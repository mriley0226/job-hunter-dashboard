// api/save-profile.js
// Called by the dashboard after resume parsing.
// Stores your profile + keywords in Vercel KV so the hourly cron can use them.

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { profile, keywords, location } = req.body || {};

  try {
    if (profile)  await kv.set('resume_profile',   profile);
    if (keywords) await kv.set('search_keywords',  keywords);
    if (location) await kv.set('search_location',  location);
    return res.status(200).json({ ok: true });
  } catch(e) {
    console.error('KV write error:', e);
    return res.status(500).json({ error: 'Could not save profile: ' + e.message });
  }
}
