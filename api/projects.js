import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('projects').select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const { id, name, room_type, mode, length, width, height, unit, floor, snapshot, thumbnail } = req.body || {};
      if (!id || !name?.trim()) return res.status(400).json({ error: 'Project name is required.' });
      const { data, error } = await supabase.from('projects').insert({ id, name: name.trim(), room_type, mode, length, width, height, unit, floor, snapshot, thumbnail: thumbnail || null, updated_at: new Date().toISOString() }).select('*').single();
      if (error) throw error;
      return res.status(201).json(data);
    }
    if (req.method === 'PUT') {
      const { id, ...changes } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Project ID is required.' });
      const allowed = ['name','room_type','mode','length','width','height','unit','floor','snapshot','thumbnail'];
      const update = Object.fromEntries(Object.entries(changes).filter(([key]) => allowed.includes(key)));
      const { data, error } = await supabase.from('projects').update({ ...update, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Project ID is required.' });
      const { error: designsError } = await supabase.from('designs').delete().eq('project_id', id);
      if (designsError) throw designsError;
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) { console.error('Projects API:', err); return res.status(500).json({ error: err.message }); }
}
