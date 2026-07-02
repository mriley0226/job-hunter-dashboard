# Job Hunter Dashboard

AI-powered job search with resume parsing and match scoring. Upload your resume once — Claude extracts your full professional profile and scores every job posting against your actual experience.

## Features

- **Resume AI parsing** — upload a PDF or Word doc, Claude extracts job titles, skills, methodologies, tools, industries, seniority level
- **Auto-search keywords** — no manual filtering; your resume drives the query
- **Match scoring** — every job card shows a % match against your profile with reasons
- **Live job feeds** — Adzuna, Arbeitnow, The Muse, Remotive (free APIs, no scraping)
- **Freshness bar** — visual indicator of how old each posting is; sort by newest first
- **Save for later** — track jobs you're interested in across sessions

---

## Deploy to Vercel (recommended, free)

### Step 1 — Get your Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up or log in
3. Go to **API Keys** → **Create Key**
4. Copy the key (starts with `sk-ant-...`) — you'll need it in Step 4

### Step 2 — Push to GitHub

1. Go to [github.com](https://github.com) and create a free account if you don't have one
2. Click **New repository** → name it `job-hunter-dashboard` → **Create repository**
3. On your computer, open Terminal (Mac) or Command Prompt (Windows) and run:

```bash
# Navigate to where you want the project
cd ~/Desktop

# Clone your new repo (replace YOUR_USERNAME)
git clone https://github.com/YOUR_USERNAME/job-hunter-dashboard.git
cd job-hunter-dashboard

# Copy all the project files into this folder, then:
git add .
git commit -m "Initial deploy"
git push origin main
```

> **Don't have git?** Download it at [git-scm.com](https://git-scm.com/downloads). Or use [GitHub Desktop](https://desktop.github.com/) for a visual interface.

### Step 3 — Connect to Vercel

1. Go to [vercel.com](https://vercel.com) → **Sign up with GitHub**
2. Click **Add New Project**
3. Find and import your `job-hunter-dashboard` repository
4. Leave all settings as default — Vercel auto-detects the config
5. Click **Deploy** (takes ~30 seconds)

### Step 4 — Add your API key (critical)

Your API key must never go in the code — it lives in Vercel's environment:

1. In your Vercel project, go to **Settings → Environment Variables**
2. Add this variable:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** your `sk-ant-...` key
   - **Environment:** Production, Preview, Development (check all three)
3. Click **Save**
4. Go to **Deployments** → click the three dots on your latest deploy → **Redeploy**

Your app is now live at `https://your-project-name.vercel.app` 🎉

---

## Set up automated email alerts (the killer feature)

This turns the dashboard from something you visit into something that works for you 24/7.

### How it works
Every hour, Vercel automatically runs a background scan — no browser needed, no action required. It fetches fresh job listings, scores them against your resume profile, and emails you only when a high-match role appears that you haven't seen before.

### Step 1 — Add Vercel KV storage (free)

The hourly scanner needs somewhere to store your profile and track which jobs it's already alerted you about.

1. In your Vercel project dashboard, go to **Storage**
2. Click **Create** → choose **KV** (Upstash Redis)
3. Name it anything (e.g. `job-hunter-kv`) → **Create**
4. On the next screen, click **Connect to Project** → select your project
5. Vercel auto-adds the KV env vars — nothing else to do here

### Step 2 — Get a free Resend API key (5 min)

[Resend](https://resend.com) is the email delivery service. Free tier: 3,000 emails/month.

1. Sign up at resend.com
2. Go to **API Keys** → **Create API Key** → copy it
3. Go to **Domains** → add your domain (optional but recommended for deliverability)
   - If you skip this, use `onboarding@resend.dev` as the from address in `scan-jobs.js` for testing

### Step 3 — Add these environment variables in Vercel

Go to Vercel → your project → **Settings → Environment Variables** and add:

| Variable | Value | What it does |
|---|---|---|
| `ALERT_EMAIL` | your@email.com | Where alerts get sent |
| `RESEND_API_KEY` | re_xxxx... | Your Resend key |
| `MATCH_THRESHOLD` | 60 | Min % match to trigger alert (60 is a good start) |
| `APP_URL` | https://your-app.vercel.app | Used in email links |
| `CRON_SECRET` | any-random-string | Prevents outsiders from triggering scans |

### Step 4 — Update the from address in scan-jobs.js

Open `api/scan-jobs.js` and find this line:
```javascript
from: 'Job Hunter <alerts@yourdomain.com>',
```
Replace `yourdomain.com` with your actual domain (if you set one up in Resend), or use `onboarding@resend.dev` for testing.

### Step 5 — Redeploy and test

1. Push your changes to GitHub (Vercel auto-deploys)
2. In the dashboard, go to the **Alerts** tab
3. Click **Run scan now** — if everything is configured, you'll get a test email within seconds

The cron runs at the top of every hour. You can verify it's firing in Vercel → your project → **Logs**.

---

## Optional: Lock it to your domain only

In Vercel Environment Variables, also add:
- **Name:** `ALLOWED_ORIGIN`
- **Value:** `your-project-name.vercel.app`

This prevents anyone else from using your API key if they somehow find your endpoint URL.

---

## Local development

```bash
# Install Vercel CLI
npm install -g vercel

# Create local env file
cp .env.example .env.local
# Edit .env.local and add your ANTHROPIC_API_KEY

# Run locally
vercel dev
# Open http://localhost:3000
```

---

## Project structure

```
job-hunter-dashboard/
├── api/
│   └── parse-resume.js     # Serverless function — keeps API key server-side
├── public/
│   └── index.html          # The full dashboard UI
├── .env.example            # Template for local environment variables
├── .gitignore              # Keeps secrets and node_modules out of git
├── package.json
├── vercel.json             # Routing config
└── README.md
```

---

## Job board APIs used

| Source | What it covers |
|---|---|
| **Adzuna** | Large US/UK aggregator, pulls from many boards |
| **Arbeitnow** | Remote and EU-focused tech roles |
| **The Muse** | Company-culture-forward listings |
| **Remotive** | Remote-only tech and PM roles |

All are free public APIs — no scraping, no ToS violations.

---

## Adzuna API key (optional upgrade)

The dashboard uses a shared demo Adzuna key which has rate limits. For heavy personal use, get your own free key:

1. Go to [developer.adzuna.com](https://developer.adzuna.com)
2. Register for a free account
3. In `public/index.html`, find `app_id=5c90fad7&app_key=bfc851b76b38c88e73d7e52cb4eebbdc` and replace with your own

---

## Troubleshooting

**Resume parsing fails:**
- Check that `ANTHROPIC_API_KEY` is set in Vercel → Settings → Environment Variables
- Make sure you redeployed after adding the key
- Try a PDF rather than a Word doc for best results

**No job results showing:**
- Some APIs have occasional downtime — try toggling sources on/off
- The Adzuna demo key may hit rate limits; get your own free key (see above)

**`vercel dev` not working locally:**
- Run `npm install` first
- Make sure `.env.local` exists with your API key
