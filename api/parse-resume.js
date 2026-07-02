// api/parse-resume.js
// Serverless function — runs on Vercel's edge, never exposes your API key to the browser

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  // CORS — only allow your own domain in production
  const origin = req.headers.origin || '';
  const allowed =
    origin.includes('localhost') ||
    origin.includes('vercel.app') ||
    (process.env.ALLOWED_ORIGIN && origin.includes(process.env.ALLOWED_ORIGIN));

  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : 'null');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured on server' });

  // Basic payload validation
  const { fileData, isPdf } = req.body || {};
  if (!fileData) return res.status(400).json({ error: 'No file data provided' });
  if (fileData.length > 5_000_000) return res.status(413).json({ error: 'File too large (max ~3MB)' });

  const systemPrompt = `You are a resume parser. Extract structured information and return ONLY valid JSON — no markdown, no backticks, no explanation.

Return exactly this structure:
{
  "name": "Full name or null",
  "currentTitle": "Most recent job title",
  "yearsExperience": number or null,
  "seniority": "junior|mid|senior|lead|director|vp|c-level",
  "industries": ["industry1", "industry2"],
  "jobTitles": ["title1", "title2", "title3"],
  "coreSkills": ["skill1", "skill2", ... up to 12],
  "methodologies": ["Agile", "Scrum", "Kanban", etc],
  "tools": ["Jira", "Confluence", "Salesforce", etc],
  "searchKeywords": ["keyword1", ... up to 8 — best job search terms for this person],
  "preferredRemote": true or false based on resume signals,
  "summary": "2-sentence summary of this person's professional profile"
}`;

  const userContent = isPdf
    ? [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileData } },
        { type: 'text', text: 'Parse this resume and return the JSON profile.' }
      ]
    : [{ type: 'text', text: 'Parse this resume and return the JSON profile:\n\n' + Buffer.from(fileData, 'base64').toString('utf8') }];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('Anthropic API error:', err);
      return res.status(response.status).json({ error: err.error?.message || 'API error' });
    }

    const data = await response.json();
    const raw = (data.content || []).map(b => b.text || '').join('').trim();
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('JSON parse failed. Raw response:', raw);
      return res.status(500).json({ error: 'Could not parse AI response as JSON' });
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message || 'Unexpected server error' });
  }
}
