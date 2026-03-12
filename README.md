# Remotion Flow – Job Ad Video Pipeline

This project generates short Remotion videos for Jobly job ads. It fetches a feed, scrapes each job page, generates short bubble texts with an LLM, and renders a vertical video + thumbnail.

## Quick Start

1. Install dependencies
```
npm install
```

2. Set OpenAI API key
```
export OPENAI_API_KEY="YOUR_KEY_HERE"
```

3. Run
```
npm run dev
```

## Input Source

The pipeline always reads from:

```
https://jobly.almamedia.fi/aineistot/jesselle/2026-kamppikset.json
```

## Common Commands

Last 7 days:
```
npm run dev -- --since-days 7
```

Limit to 5 jobs:
```
npm run dev -- --since-days 7 --limit 5
```

Run a single job by id:
```
npm run dev -- --job-id 2585951
```

Run in parallel (2 at a time):
```
npm run dev -- --since-days 7 --limit 10 --concurrency 2
```

Daily server run helper:
```
npm run pipeline:daily
```

## Editor (No-Code Review UI)

The editor lets you review artifacts, tweak text + colors, choose a jingle, preview live, regenerate the MP4 + thumbnail, download rendered files, and create a new artifact directly from a pasted Jobly URL.

Start the editor (API + UI):
```
npm run editor
```

If you want to run them separately:
```
npm run editor:api
npm run editor:ui
```

The UI is served at `http://localhost:5173`, the API at `http://localhost:3300`.
Regenerations write `overrides.json` into each artifact folder and update `artifacts/partner-feed.json`.

### What Regenerate Does

When you click Regenerate:
1. Saves overrides to `artifacts/<job_id>/overrides.json`
2. Re-renders MP4 + thumbnail into the same artifact folder
3. Updates `artifacts/partner-feed.json` with the latest paths + metadata
4. Updates `jobly_videoad_feed.json` in the project root

### Editor API (local)

- `GET /api/artifacts` list all artifacts for the left panel
- `GET /api/artifacts/:id` get extracted + bubbles + overrides + assets
- `POST /api/artifacts/create-from-url` run full pipeline for one pasted Jobly URL
- `POST /api/artifacts/:id/reset` remove overrides and revert to original
- `POST /api/artifacts/bulk-overrides` apply theme + jingle to multiple ids
- `POST /api/artifacts/:id/regenerate` write overrides and re-render

### Data Model

Editor overrides are optional and only replace the editable fields:
```
{
  "company": "Optional string",
  "title": "Optional string",
  "location": "Optional string",
  "expects": ["Array of strings"],
  "offers": ["Array of strings"],
  "theme": {
    "primary": "#hex",
    "secondary": "#hex",
    "text": "#hex",
    "logo_bg": "#hex"
  },
  "jingle": "filename.mp3 | null"
}
```

## Output Feed

The editor writes a partner feed file to the project root:
```
jobly_videoad_feed.json
```

Each item contains:
- `job_id`
- `published` (from the Jobly feed, if available)
- `company`
- `title`
- `job_ad_type` (from the Jobly feed, if available)
- `video_url`
- `thumbnail_url`

The URL base is controlled by:
```
OUTPUT_BASE_URL
```
Default: `https://example.com/jobly`

## Debug Options

Show TikTok safe zone overlay:
```
SHOW_TIKTOK_GUIDES=1 npm run dev -- --since-days 7 --limit 1
```

Show logo box debug overlay:
```
SHOW_LOGO_DEBUG=1 npm run dev -- --job-id 2575938
```

## Output

Artifacts are stored per job:

```
artifacts/<job_id or url_hash>/
```

Important files:
- `extracted.json`
- `bubbles.json`
- `<jobid>_video.mp4`
- `<jobid>_thumbnail.png`

## Audio (Jingles)

Put background music files in:

```
/jingles
```

Supported formats:
`.mp3 .wav .m4a .aac .ogg`

Each render picks a random jingle.

## Environment Variables

- `OPENAI_API_KEY` (required)
- `OPENAI_MODEL` (optional, defaults to `gpt-4.1`)
- `SHOW_TIKTOK_GUIDES=1`
- `SHOW_LOGO_DEBUG=1`

## Cron (08:00 Daily)

On the server, add a root cron entry so the pipeline fetches and renders recent jobs every day at 08:00:
```
0 8 * * * cd /opt/jobly && /opt/jobly/scripts/run-daily.sh >> /var/log/jobly-daily.log 2>&1
```

Edit cron:
```
crontab -e
```

## Notes

This is currently a single pipeline with batch support. Planned next steps:
- Editing pass
- Final partner output JSON
