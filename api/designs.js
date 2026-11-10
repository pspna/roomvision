import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      const query = supabase.from('designs').select('*').order('created_at', { ascending: true });
      const { data, error } = req.query.project_id ? await query.eq('project_id', req.query.project_id) : await query;
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const { id, project_id, name, snapshot } = req.body || {};
      if (!id || !project_id || !name?.trim()) return res.status(400).json({ error: 'A design name and project are required.' });
      const { data, error } = await supabase.from('designs').insert({ id, project_id, name: name.trim(), snapshot }).select('*').single();
      if (error) throw error;
      return res.status(201).json(data);
    }
    if (req.method === 'PUT') {
      const { id, name, snapshot } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Design ID is required.' });
      const update = { ...(name !== undefined ? { name: String(name).trim() } : {}), ...(snapshot !== undefined ? { snapshot } : {}) };
      const { data, error } = await supabase.from('designs').update(update).eq('id', id).select('*').single();
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Design ID is required.' });
      const { error } = await supabase.from('designs').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) { console.error('Designs API:', err); return res.status(500).json({ error: err.message }); }
}
