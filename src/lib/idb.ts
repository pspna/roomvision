import type { Design, Project, Snapshot, SurfaceKey } from '../types';

const DB_NAME = 'roomvision-cache';
const DB_VERSION = 2;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('designs')) db.createObjectStore('designs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local project storage.'));
    request.onblocked = () => reject(new Error('Close other RoomVision tabs to finish the storage update.'));
  });
}

function requestResult<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, request: (objectStore: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    let value: T;
    let failure: Error | DOMException | null = null;
    const result = request(tx.objectStore(store));
    result.onsuccess = () => { value = result.result; };
    result.onerror = () => { failure = result.error ?? new Error('Could not access local project storage.'); };
    tx.onabort = () => { db.close(); reject(failure ?? tx.error ?? new Error('Local project storage was interrupted.')); };
    tx.onerror = () => { failure = tx.error ?? new Error('Could not access local project storage.'); };
    tx.oncomplete = () => { db.close(); if (failure) reject(failure); else resolve(value); };
  });
}

function validSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<Snapshot>;
  const surfaces = snapshot.surfaces;
  const keys: SurfaceKey[] = ['front', 'left', 'right', 'back', 'ceiling'];
  return Boolean(surfaces && keys.every(key => {
    const surface = surfaces[key];
    return surface && (surface.url === null || typeof surface.url === 'string') &&
      ['scale', 'repeatX', 'repeatY', 'offsetX', 'offsetY', 'rotation'].every(field => Number.isFinite(surface[field as keyof typeof surface])) &&
      typeof surface.locked === 'boolean' && ['fit', 'fill', 'stretch', 'custom'].includes(surface.fit);
  }) && Array.isArray(snapshot.furniture) && snapshot.furniture.every(item => typeof item === 'string'));
}

function validProject(value: unknown): value is Project {
  if (!value || typeof value !== 'object') return false;
  const project = value as Partial<Project>;
  return typeof project.id === 'string' && typeof project.name === 'string' && typeof project.room_type === 'string' && typeof project.mode === 'string' && typeof project.unit === 'string' && typeof project.floor === 'string' && Number.isFinite(project.width) && Number.isFinite(project.length) && Number.isFinite(project.height) && project.width! > 0 && project.length! > 0 && project.height! > 0 && typeof project.updated_at === 'string' && validSnapshot(project.snapshot);
}

export async function listProjects(): Promise<Project[]> {
  const db = await openDB();
  const records = await requestResult<unknown[]>(db, 'projects', 'readonly', store => store.getAll());
  return records.filter(validProject).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function getProjects<T>(): Promise<T[]> { return listProjects() as Promise<T[]>; }

export async function saveProject(project: Project): Promise<Project> {
  if (!validProject(project)) throw new Error('This room cannot be saved because its project data is incomplete.');
  const saved = { ...project, name: project.name.trim() || 'Untitled room', updated_at: new Date().toISOString() };
  const db = await openDB();
  await requestResult(db, 'projects', 'readwrite', store => store.put(saved));
  return saved;
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(['projects', 'designs'], 'readwrite');
  tx.objectStore('projects').delete(id);
  const designs = tx.objectStore('designs');
  const request = designs.indexNames.contains('project_id') ? designs.index('project_id').openCursor(IDBKeyRange.only(id)) : designs.openCursor();
  if (!designs.indexNames.contains('project_id')) {
    request.onsuccess = () => { const cursor = request.result; if (cursor) { if ((cursor.value as Design).project_id === id) cursor.delete(); cursor.continue(); } };
  } else request.onsuccess = () => { const cursor = request.result; if (cursor) { cursor.delete(); cursor.continue(); } };
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Could not delete this project.')); }; });
}

export async function listDesigns(projectId: string): Promise<Design[]> {
  const db = await openDB();
  const records = await requestResult<Design[]>(db, 'designs', 'readonly', store => store.getAll());
  return records.filter(design => design.project_id === projectId && typeof design.name === 'string' && validSnapshot(design.snapshot));
}

export async function saveDesign(design: Design): Promise<Design> {
  if (!design.id || !design.project_id || !design.name.trim() || !validSnapshot(design.snapshot)) throw new Error('This design is incomplete and could not be saved.');
  const saved = { ...design, name: design.name.trim() };
  const db = await openDB();
  await requestResult(db, 'designs', 'readwrite', store => store.put(saved));
  return saved;
}

export async function deleteDesign(id: string): Promise<void> {
  const db = await openDB();
  await requestResult(db, 'designs', 'readwrite', store => store.delete(id));
}

export async function cacheImage(key: string, blob: Blob): Promise<void> {
  const db = await openDB();
  await requestResult(db, 'images', 'readwrite', store => store.put(blob, key));
}

export async function getImage(key: string): Promise<Blob | undefined> {
  const db = await openDB();
  return requestResult<Blob | undefined>(db, 'images', 'readonly', store => store.get(key));
}

export async function resolveWallpaperAsset(reference: string): Promise<{ src: string; release: () => void }> {
  if (reference.startsWith('idb:')) {
    const blob = await getImage(reference);
    if (!blob || blob.size === 0) throw new Error('The saved image is missing. Replace it to restore this wallpaper.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) throw new Error('The saved file is not a supported image. Replace it to restore this wallpaper.');
    const src = URL.createObjectURL(blob);
    let released = false;
    return { src, release: () => { if (!released) { released = true; URL.revokeObjectURL(src); } } };
  }

  if (reference.startsWith('data:image/jpeg;') || reference.startsWith('data:image/png;') || reference.startsWith('data:image/webp;') || reference.startsWith('https://') || reference.startsWith('http://') || reference.startsWith('blob:')) {
    return { src: reference, release: () => {} };
  }
  throw new Error('The wallpaper reference is invalid. Replace the image to restore this wallpaper.');
}

// Compatibility exports for the earlier best-effort cache. Invalid old rows are
// ignored when reading so a damaged record cannot take down the dashboard.
export async function cacheProject(project: { id: string }): Promise<void> {
  if (validProject(project)) await saveProject(project);
}
export async function cachedProjects<T>(): Promise<T[]> { return getProjects<T>(); }
export async function removeCachedProject(id: string): Promise<void> { await deleteProject(id); }
