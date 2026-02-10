# Pipeline Overview

This project builds short Remotion videos from Jobly job ads using a single, cacheable pipeline. The pipeline always pulls its input from the Jobly feed:

```
https://jobly.almamedia.fi/aineistot/jesselle/2026-kamppikset.json
```

## High-Level Flow

1. **Feed fetch**
   - Fetches the JSON feed and filters out expired jobs.
   - Optional date filter: only process jobs published in the last N days.
   - Optional limits and concurrency for testing.

2. **Fetch HTML**
   - Downloads the job page HTML and caches it to disk.

3. **Extract job data**
   - Parses JSON-LD when available.
   - Extracts title, company, description, location, dates.
   - Derives language (fi/en).
   - Derives job_id from URL if not present.

4. **Logo handling**
   - Downloads logo from Jobly.
   - GIFs are converted to PNG and trimmed.
   - Normalizes logo by removing near-white background to preserve the 1:1 logo tile.

5. **Brand colors**
   - Tries company site theme/manifest colors.
   - Falls back to logo-derived colors.
   - Final fallback: Jobly brand gradient `#ED2D26 -> #F4817D`.

6. **Bubbles (LLM)**
   - Generates offers/expectations bubbles with GPT-4.1.
   - Language is enforced (fi/en).

7. **Bubbles review (LLM)**
   - Second pass to fix Finnish/English quality.
   - Ensures complete phrases, no truncation.

8. **Render (Remotion)**
   - Renders video + thumbnail.
   - Adds random jingle from `/jingles`.
   - Outputs MP4 with mobile-friendly compression.

## Artifacts

Each job is cached in:

```
artifacts/<job_id or url_hash>/
```

Files:
- `input.json`
- `raw.html`
- `extracted.json`
- `bubbles.json`
- `logo-original.*`
- `logo.png` / `logo-normalized.png`
- `<jobid>_video.mp4`
- `<jobid>_thumbnail.png`

## Run Commands

Process latest feed:
```
npm run dev
```

Only last 7 days:
```
npm run dev -- --since-days 7
```

Limit count:
```
npm run dev -- --since-days 7 --limit 5
```

Run a single job:
```
npm run dev -- --job-id 2585951
```

Parallel runs:
```
npm run dev -- --since-days 7 --limit 10 --concurrency 2
```

## Environment Variables

- `OPENAI_API_KEY` (required)
- `OPENAI_MODEL` (optional, defaults to `gpt-4.1`)
- `SHOW_TIKTOK_GUIDES=1` (renders safe-zone overlay)
- `SHOW_LOGO_DEBUG=1` (logo box debug overlay)

## Notes

- This is a single-job pipeline that can be executed in batch mode from the feed.
- The Remotion layout keeps a 250x250 logo tile with 25px padding (logo is 200x200).
- The next steps planned: editing pass and final partner output JSON.
