export type SurfaceKey = 'front' | 'left' | 'right' | 'back' | 'ceiling';
export type ViewKey = 'perspective' | 'front' | 'left' | 'right' | 'back' | 'ceiling';
export type TextureFit = 'fit' | 'fill' | 'stretch' | 'custom';
export interface SurfaceSettings { url: string | null; fileName: string | null; mimeType: string | null; scale: number; repeatX: number; repeatY: number; offsetX: number; offsetY: number; rotation: number; fit: TextureFit; locked: boolean; }
export interface Snapshot { surfaces: Record<SurfaceKey, SurfaceSettings>; furniture: string[]; }
export interface Project { id: string; name: string; room_type: string; mode: string; length: number; width: number; height: number; unit: string; floor: string; snapshot: Snapshot; thumbnail: string | null; updated_at: string; }
export interface Design { id: string; project_id: string; name: string; snapshot: Snapshot; created_at: string; }
export const surfaceKeys: SurfaceKey[] = ['front', 'left', 'right', 'back', 'ceiling'];
export const surfaceName: Record<SurfaceKey, string> = { front: 'Front wall', left: 'Left wall', right: 'Right wall', back: 'Back wall', ceiling: 'Ceiling' };
export const defaultSurface = (): SurfaceSettings => ({ url: null, fileName: null, mimeType: null, scale: 1, repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0, rotation: 0, fit: 'fit', locked: false });
export const defaultSnapshot = (mode = 'furnished', roomType = 'Living Room'): Snapshot => ({ surfaces: { front: defaultSurface(), left: defaultSurface(), right: defaultSurface(), back: defaultSurface(), ceiling: defaultSurface() }, furniture: mode === 'empty' ? [] : roomType === 'Bedroom' ? ['bed', 'table', 'lamp', 'plant', 'frame'] : roomType === 'Office' ? ['table', 'chair', 'lamp', 'plant', 'frame'] : ['sofa', 'chair', 'table', 'lamp', 'plant', 'frame'] });
