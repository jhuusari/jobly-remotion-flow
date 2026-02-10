# Status – Remotion Job Ad Pipeline

## Current State

Pipeline works end-to-end:
- Fetch feed from Jobly
- Scrape job pages
- Extract structured data
- Generate bubbles (LLM)
- Review bubbles (LLM)
- Render Remotion video + thumbnail
- Add random jingle
- Editor UI for no-code review + regeneration
- Partner feed JSON in project root (`jobly_videoad_feed.json`)

## Key Design Decisions

### Logo tile (locked)
- Fixed tile: **250×250**, **radius 25**
- Inner logo box: **200×200**
- Logo fills inner box (`width/height: 100%`, `objectFit: contain`)
- This guarantees **25px padding** on all sides, regardless of logo shape
- `flexShrink: 0` enforced so long content never shrinks the logo tile

### Logo normalization
- GIF → PNG conversion
- Trim transparent space
- **No white background normalization** (caused artifacts)

### Brand colors
- Try company site theme/manifest colors
- Fallback to logo-based colors
- Final fallback: Jobly red gradient
  - `#ED2D26` → `#F4817D`

### Bubbles (LLM)
- GPT‑4.1 default
- Language enforced (fi/en)
- Review pass fixes truncation and grammar
- Max length dynamic (up to 64)
- Bubbles can wrap to 2 lines if needed

### Bubble scaling (adaptive)
- Bubble rows scale down when content is heavy
- Scaling is anchored to **top center** (`transformOrigin: 'top center'`)
- Titles and header do not shrink

### TikTok safe zones
- Safe padding (top 120, bottom 340, sides 120)
- Debug overlay flag: `SHOW_TIKTOK_GUIDES=1`
- Safe zone outline with white stroke for visibility

### Logo debug
- Debug overlay flag: `SHOW_LOGO_DEBUG=1`
- Green outline = tile, Blue outline = inner logo box

## Known Issues / Needs

- Font loading warning (Poppins too many requests) – currently ignored
- Potential logo edge cases (very light logos)
- Editor API/UI not production-hardened (local only)

## Run Commands

Default:
```
npm run dev
```

Recent only:
```
npm run dev -- --since-days 7
```

Limit + concurrency:
```
npm run dev -- --since-days 7 --limit 5 --concurrency 2
```

Single job:
```
npm run dev -- --job-id 2585951
```

Editor:
```
npm run editor
```

## Next Steps

1. Optional: bulk regenerate concurrency + cancel
2. Optional: remote publish for partner feed
3. Optional: local font bundling for Poppins
