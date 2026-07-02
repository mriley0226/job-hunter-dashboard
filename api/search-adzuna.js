// api/search-adzuna.js
// Server-side proxy for Adzuna job search — keeps the app_id/app_key out of
// client-side JS so they aren't hardcoded and visible in public/index.html.
// Set ADZUNA_APP_ID / ADZUNA_APP_KEY in Vercel env vars to use your own
// credentials (get free ones at https://developer.adzuna.com/); falls back
// to a shared demo key otherwise, which is rate-limited and unreliable.

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { what, where, distance, country } = req.query || {};
  if (!what) return res.status(400).json({ error: 'Missing "what" (search keyword)' });

  const appId  = process.env.ADZUNA_APP_ID  || '5c90fad7';
  const appKey = process.env.ADZUNA_APP_KEY || 'bfc851b76b38c88e73d7e52cb4eebbdc';
  const cc     = country === 'gb' ? 'gb' : 'us';

  let url = `https://api.adzuna.com/v1/api/jobs/${cc}/search/1` +
    `?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}` +
    `&what=${encodeURIComponent(what)}&results_per_page=10&sort_by=date`;
  if (where) url += `&where=${encodeURIComponent(where)}`;
  if (distance) url += `&distance=${encodeURIComponent(distance)}`;

  try {
    const r = await fetch(url);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('Adzuna API error:', d);
      return res.status(r.status).json({ error: d.exception || d.display || 'Adzuna API error' });
    }
    return res.status(200).json(d);
  } catch (err) {
    console.error('Adzuna proxy error:', err);
    return res.status(500).json({ error: err.message || 'Unexpected server error' });
  }
}
