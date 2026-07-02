// api/scan-jobs.js
// Runs every hour via Vercel Cron (configured in vercel.json)
// Fetches fresh job listings, scores them against your saved profile,
// and emails you when a high-match role appears that you haven't seen before.

import { kv } from '@vercel/kv';
import { Resend } from 'resend';

export const config = { maxDuration: 30 };

// ─── Job board fetchers (same logic as the frontend) ────────────────────────

function detectCountry(location) {
  const loc = (location || '').trim();
  if (/^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/.test(loc)) return 'gb'; // UK postcode
  return 'us'; // default (also matches 5-digit US zip)
}

async function fetchAdzuna(kw, location) {
  const query  = location?.query;
  const radius = location?.radius;
  const country = detectCountry(query);
  let url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1` +
    `?app_id=${process.env.ADZUNA_APP_ID || '5c90fad7'}` +
    `&app_key=${process.env.ADZUNA_APP_KEY || 'bfc851b76b38c88e73d7e52cb4eebbdc'}` +
    `&what=${encodeURIComponent(kw)}&results_per_page=20&sort_by=date`;
  if (query && radius !== 'remote') {
    url += `&where=${encodeURIComponent(query)}`;
    if (radius && radius !== 'any') url += `&distance=${Math.round(Number(radius) * 1.60934)}`; // miles -> km
  }
  const r = await fetch(url);
  if (!r.ok) return [];
  const d = await r.json();
  return (d.results || []).map(j => ({
    id: 'az_' + j.id,
    title: j.title,
    company: j.company?.display_name || '',
    location: j.location?.display_name || '',
    url: j.redirect_url,
    description: j.description || '',
    posted_at: j.created,
    _source: 'Adzuna'
  }));
}

async function fetchArbeitnow(kw) {
  const r = await fetch(`https://www.arbeitnow.com/api/job-board-api?search=${encodeURIComponent(kw)}`);
  if (!r.ok) return [];
  const d = await r.json();
  return (d.data || []).slice(0, 20).map(j => ({
    id: 'ab_' + j.slug,
    title: j.title,
    company: j.company_name || '',
    location: j.location || 'Remote',
    url: j.url,
    description: j.description || '',
    posted_at: new Date(j.created_at * 1000).toISOString(),
    _source: 'Arbeitnow'
  }));
}

async function fetchRemotive(kw) {
  const r = await fetch(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(kw)}&limit=20`);
  if (!r.ok) return [];
  const d = await r.json();
  return (d.jobs || []).map(j => ({
    id: 'rm_' + j.id,
    title: j.title,
    company: j.company_name || '',
    location: j.candidate_required_location || 'Remote',
    url: j.url,
    description: j.description || '',
    posted_at: j.publication_date,
    _source: 'Remotive'
  }));
}

// ─── Match scoring (mirrors the frontend logic) ──────────────────────────────

function scoreJob(job, profile) {
  if (!profile) return 0;
  const txt = (job.title + ' ' + job.description).toLowerCase();
  let score = 0;

  (profile.jobTitles     || []).forEach(t => { if (txt.includes(t.toLowerCase())) score += 18; });
  (profile.methodologies || []).forEach(m => { if (txt.includes(m.toLowerCase())) score += 12; });
  (profile.coreSkills    || []).forEach(s => { if (txt.includes(s.toLowerCase())) score +=  8; });
  (profile.tools         || []).forEach(t => { if (txt.includes(t.toLowerCase())) score +=  6; });
  (profile.searchKeywords|| []).forEach(k => { if (txt.includes(k.toLowerCase())) score +=  7; });

  const levelMap = {
    junior:    ['junior','associate','entry'],
    mid:       ['mid-level','intermediate'],
    senior:    ['senior','sr.','sr '],
    lead:      ['lead','principal','staff'],
    director:  ['director','head of'],
    vp:        ['vp ','vice president'],
    'c-level': ['chief','cto','cpo','ceo']
  };
  (levelMap[profile.seniority] || []).forEach(s => { if (txt.includes(s)) score += 10; });

  return Math.min(Math.round(score), 99);
}

function hoursAgo(d) {
  if (!d) return 999;
  const dt = new Date(d);
  return isNaN(dt) ? 999 : Math.max(0, Math.round((Date.now() - dt) / 3_600_000));
}

// ─── Email builder ───────────────────────────────────────────────────────────

function buildEmailHtml(jobs, profile) {
  const greeting = profile?.name ? `Hey ${profile.name.split(' ')[0]}` : 'Hey';
  const rows = jobs.map(({ job, score }) => `
    <tr>
      <td style="padding:14px 16px;border-bottom:1px solid #21262d;vertical-align:top">
        <div style="margin-bottom:4px">
          <a href="${job.url}" style="color:#2f81f7;font-weight:600;font-size:14px;text-decoration:none">${job.title}</a>
        </div>
        <div style="color:#8b949e;font-size:12px;margin-bottom:8px">
          ${job.company} · ${job.location} · ${job._source}
        </div>
        <div style="display:inline-block;background:${score>=70?'#0d4a1a':'#4a3000'};color:${score>=70?'#3fb950':'#d29922'};border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700">
          ${score}% match
        </div>
        <span style="color:#484f58;font-size:11px;margin-left:10px">
          posted ${hoursAgo(job.posted_at)}h ago
        </span>
      </td>
      <td style="padding:14px 16px;border-bottom:1px solid #21262d;vertical-align:middle;text-align:right;white-space:nowrap">
        <a href="${job.url}" style="background:#2f81f7;color:#fff;text-decoration:none;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600">
          Apply now →
        </a>
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px">

    <div style="margin-bottom:24px">
      <div style="color:#2f81f7;font-size:13px;font-weight:600;margin-bottom:6px">
        ● JOB HUNTER DASHBOARD
      </div>
      <h1 style="color:#e6edf3;font-size:22px;font-weight:700;margin:0 0 6px">
        ${jobs.length} new high-match role${jobs.length > 1 ? 's' : ''} found
      </h1>
      <p style="color:#8b949e;font-size:13px;margin:0">
        ${greeting} — these just dropped and match your profile. Apply before the crowd catches up.
      </p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid #21262d;border-radius:12px;border-collapse:collapse;overflow:hidden">
      ${rows}
    </table>

    <div style="margin-top:20px;padding:14px 16px;background:#161b22;border:1px solid #21262d;border-radius:8px">
      <div style="color:#484f58;font-size:11px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Your profile match factors</div>
      <div style="color:#8b949e;font-size:12px">
        ${[...(profile?.jobTitles||[]).slice(0,3), ...(profile?.methodologies||[]).slice(0,2)].join(' · ')}
      </div>
    </div>

    <p style="color:#484f58;font-size:11px;margin-top:20px;text-align:center">
      Sent by your Job Hunter Dashboard · Only high-match roles ≥ ${process.env.MATCH_THRESHOLD || 60}% · 
      <a href="${process.env.APP_URL || ''}/settings" style="color:#484f58">manage alerts</a>
    </p>
  </div>
</body>
</html>`;
}

// ─── Main handler ────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Vercel Cron passes a secret header — verify it to block outside calls
  const authHeader = req.headers['authorization'];
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const alertEmail     = process.env.ALERT_EMAIL;
  const resendKey      = process.env.RESEND_API_KEY;
  const matchThreshold = parseInt(process.env.MATCH_THRESHOLD || '60', 10);

  if (!alertEmail || !resendKey) {
    console.log('Scan ran but ALERT_EMAIL or RESEND_API_KEY not configured — skipping email');
    return res.status(200).json({ ok: true, skipped: 'email not configured' });
  }

  // Load saved profile, keywords, and location from KV store
  let profile, keywords, location;
  try {
    profile  = await kv.get('resume_profile');
    keywords = await kv.get('search_keywords') || [];
    location = await kv.get('search_location') || null;
  } catch(e) {
    console.error('KV read error:', e);
    return res.status(500).json({ error: 'Could not read profile from storage' });
  }

  if (!profile && !keywords?.length) {
    console.log('No profile or keywords saved yet — upload your resume in the dashboard first');
    return res.status(200).json({ ok: true, skipped: 'no profile saved' });
  }

  // Pull the search terms: auto keywords from profile + any manually saved ones
  const searchTerms = [
    ...(profile?.searchKeywords || []),
    ...(profile?.methodologies  || []).slice(0, 2),
    ...(keywords || [])
  ].filter(Boolean).slice(0, 5); // cap at 5 to avoid rate limits

  if (!searchTerms.length) {
    return res.status(200).json({ ok: true, skipped: 'no search terms' });
  }

  const primaryTerm = searchTerms[0];

  // Fetch from all sources in parallel
  const [adzuna, arbeitnow, remotive] = await Promise.allSettled([
    fetchAdzuna(primaryTerm, location),
    fetchArbeitnow(primaryTerm),
    fetchRemotive(primaryTerm)
  ]);

  const allJobs = [
    ...(adzuna.status     === 'fulfilled' ? adzuna.value     : []),
    ...(arbeitnow.status  === 'fulfilled' ? arbeitnow.value  : []),
    ...(remotive.status   === 'fulfilled' ? remotive.value   : [])
  ];

  // Load already-seen job IDs so we don't re-alert on the same postings
  let seenIds = new Set();
  try {
    const stored = await kv.get('seen_job_ids') || [];
    seenIds = new Set(stored);
  } catch(e) {
    console.warn('Could not load seen IDs:', e);
  }

  // Score, filter, dedupe
  const newHighMatches = allJobs
    .filter(job => !seenIds.has(job.id))           // not already alerted
    .filter(job => hoursAgo(job.posted_at) < 48)   // posted in last 48h
    .map(job => ({ job, score: scoreJob(job, profile) }))
    .filter(({ score }) => score >= matchThreshold) // above threshold
    .sort((a, b) => b.score - a.score)             // best first
    .slice(0, 10);                                  // cap at 10 per email

  console.log(`Scan complete: ${allJobs.length} jobs fetched, ${newHighMatches.length} new high matches`);

  // Mark all fetched jobs as seen (regardless of score) to avoid re-scanning
  const allIds = [...seenIds, ...allJobs.map(j => j.id)];
  // Keep only the last 2000 IDs to avoid bloat
  const trimmedIds = allIds.slice(-2000);
  try {
    await kv.set('seen_job_ids', trimmedIds);
  } catch(e) {
    console.warn('Could not save seen IDs:', e);
  }

  // Send email if there are new matches
  if (newHighMatches.length > 0) {
    const resend = new Resend(resendKey);
    try {
      await resend.emails.send({
        from: 'Job Hunter <alerts@yourdomain.com>', // update this after verifying domain in Resend
        to: alertEmail,
        subject: `🎯 ${newHighMatches.length} new high-match job${newHighMatches.length > 1 ? 's' : ''} — apply now`,
        html: buildEmailHtml(newHighMatches, profile)
      });
      console.log(`Email sent to ${alertEmail} with ${newHighMatches.length} matches`);
    } catch(e) {
      console.error('Email send failed:', e);
      return res.status(500).json({ error: 'Email send failed', detail: e.message });
    }
  }

  return res.status(200).json({
    ok: true,
    scanned: allJobs.length,
    newMatches: newHighMatches.length,
    emailSent: newHighMatches.length > 0,
    topMatch: newHighMatches[0] ? {
      title: newHighMatches[0].job.title,
      company: newHighMatches[0].job.company,
      score: newHighMatches[0].score
    } : null
  });
}
