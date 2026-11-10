import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key'
);

app.get('/api/projects', async (req, res) => {
  try {
    const { data, error } = await supabase.from('projects').select('*').order('updated_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects', async (req, res) => {
  try {
    const { id, name, room_type, mode, length, width, height, unit, floor, snapshot, thumbnail } = req.body || {};
    if (!id || !name?.trim()) return res.status(400).json({ error: 'Project name is required.' });
    const { data, error } = await supabase.from('projects').insert({ 
      id, 
      name: name.trim(), 
      room_type, 
      mode, 
      length, 
      width, 
      height, 
      unit, 
      floor, 
      snapshot, 
      thumbnail: thumbnail || null, 
      updated_at: new Date().toISOString() 
    }).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/projects', async (req, res) => {
  try {
    const { id, ...changes } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Project ID is required.' });
    const allowed = ['name','room_type','mode','length','width','height','unit','floor','snapshot','thumbnail'];
    const update = Object.fromEntries(Object.entries(changes).filter(([key]) => allowed.includes(key)));
    const { data, error } = await supabase.from('projects').update({ ...update, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/projects', async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Project ID is required.' });
    const { error: designsError } = await supabase.from('designs').delete().eq('project_id', id);
    if (designsError) throw designsError;
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/designs', async (req, res) => {
  try {
    let query = supabase.from('designs').select('*').order('created_at', { ascending: true });
    if (req.query.project_id) query = query.eq('project_id', req.query.project_id);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/designs', async (req, res) => {
  try {
    const { id, project_id, name, snapshot } = req.body || {};
    if (!id || !project_id || !name?.trim()) return res.status(400).json({ error: 'A design name and project are required.' });
    const { data, error } = await supabase.from('designs').insert({ id, project_id, name: name.trim(), snapshot }).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/designs', async (req, res) => {
  try {
    const { id, name, snapshot } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Design ID is required.' });
    const update = { ...(name !== undefined ? { name: String(name).trim() } : {}), ...(snapshot !== undefined ? { snapshot } : {}) };
    const { data, error } = await supabase.from('designs').update(update).eq('id', id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/designs', async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Design ID is required.' });
    const { error } = await supabase.from('designs').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload', async (req, res) => {
  try {
    const { fileBase64, contentType, fileName } = req.body || {};
    if (!fileBase64 || !['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) return res.status(400).json({ error: 'Please upload a JPG, PNG, or WEBP image.' });
    const buffer = Buffer.from(fileBase64, 'base64');
    if (buffer.length > 8 * 1024 * 1024) return res.status(400).json({ error: 'Image must be under 8 MB after processing.' });
    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const safeName = String(fileName || 'wallpaper').replace(/[^a-z0-9-]/gi, '-').slice(0, 40);
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}.${ext}`;
    const { error } = await supabase.storage.from('wallpapers').upload(path, buffer, { contentType, upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from('wallpapers').getPublicUrl(path);
    res.status(201).json({ url: data.publicUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});