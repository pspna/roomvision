import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
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
    return res.status(201).json({ url: data.publicUrl });
  } catch (err) { console.error('Upload API:', err); return res.status(500).json({ error: err.message }); }
}
