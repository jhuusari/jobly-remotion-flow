import express from 'express';
import {existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync} from 'fs';
import {basename, join, relative} from 'path';
import {applyOverrides, EditorOverrides} from '../utils/editor-overrides';
import {renderVideo} from '../steps/render';

const app = express();
const PORT = Number(process.env.EDITOR_PORT ?? 3300);
const ROOT = process.cwd();
const ARTIFACTS_DIR = join(ROOT, 'artifacts');
const JINGLES_DIR = join(ROOT, 'jingles');
const PARTNER_FEED = join(ARTIFACTS_DIR, 'partner-feed.json');
const JOBLY_FEED = join(ROOT, 'jobly_videoad_feed.json');
const OUTPUT_BASE_URL = process.env.OUTPUT_BASE_URL ?? 'https://example.com/jobly';
const LOCAL_FEED_CACHE = join(ROOT, 'kamppikset.json');

let localFeedIndex: Record<string, {published?: string; job_ad_type?: string}> | null = null;

app.use(express.json({limit: '2mb'}));
app.use('/assets', express.static(ROOT));

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJson(path: string, data: unknown) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function listArtifactDirs(): string[] {
  if (!existsSync(ARTIFACTS_DIR)) return [];
  return readdirSync(ARTIFACTS_DIR)
    .filter((name) => !name.startsWith('.'))
    .filter((name) => {
      const full = join(ARTIFACTS_DIR, name);
      return existsSync(full) && statSync(full).isDirectory();
    });
}

function loadArtifact(id: string) {
  const dir = join(ARTIFACTS_DIR, id);
  if (!existsSync(dir)) return null;
  const extracted = readJson<any>(join(dir, 'extracted.json'));
  const bubbles = readJson<any>(join(dir, 'bubbles.json'));
  const overrides = readJson<EditorOverrides>(join(dir, 'overrides.json'));
  const input = readJson<any>(join(dir, 'input.json'));
  if (!extracted || !bubbles) return null;

  const video = findMediaFile(dir, /_video\.mp4$/i);
  const thumbnail = findMediaFile(dir, /_thumbnail\.png$/i);

  return {
    id,
    dir,
    extracted,
    bubbles,
    overrides,
    input,
    video,
    thumbnail
  };
}

function findMediaFile(dir: string, pattern: RegExp): string | null {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => pattern.test(f));
  if (files.length === 0) return null;
  return join(dir, files[0]);
}

function toPublicPath(absPath: string | null | undefined): string | null {
  if (!absPath) return null;
  if (!absPath.startsWith(ROOT)) return null;
  const rel = relative(ROOT, absPath).replace(/\\/g, '/');
  return `/assets/${rel}`;
}

function listJingles(): string[] {
  if (!existsSync(JINGLES_DIR)) return [];
  return readdirSync(JINGLES_DIR).filter((f) => /\.(mp3|wav|m4a|aac|ogg)$/i.test(f));
}

function sanitizeOverrides(raw: any): EditorOverrides {
  const cleanText = (val: any) => (typeof val === 'string' ? val.trim() : '');
  const cleanArray = (val: any) =>
    (Array.isArray(val) ? val : undefined)?.map((item) => cleanText(item)).filter(Boolean);
  const cleanColor = (val: any) => {
    const v = cleanText(val);
    if (!v) return undefined;
    const hex = v.startsWith('#') ? v : `#${v}`;
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex) ? hex : undefined;
  };

  const theme = {
    primary: cleanColor(raw?.theme?.primary),
    secondary: cleanColor(raw?.theme?.secondary),
    text: cleanColor(raw?.theme?.text),
    logo_bg: cleanColor(raw?.theme?.logo_bg)
  };

  const jingle = cleanText(raw?.jingle);

  const offers = cleanArray(raw?.offers);
  const expects = cleanArray(raw?.expects);
  const themeValue = {
    primary: theme.primary,
    secondary: theme.secondary,
    text: theme.text,
    logo_bg: theme.logo_bg
  };
  const hasTheme = Object.values(themeValue).some(Boolean);

  return {
    company: cleanText(raw?.company) || undefined,
    title: cleanText(raw?.title) || undefined,
    location: cleanText(raw?.location) || undefined,
    offers,
    expects,
    theme: hasTheme ? themeValue : undefined,
    jingle: jingle && jingle !== 'random' ? jingle : null
  };
}

function sanitizeThemeAndJingle(raw: any): Pick<EditorOverrides, 'theme' | 'jingle'> {
  const cleanText = (val: any) => (typeof val === 'string' ? val.trim() : '');
  const cleanColor = (val: any) => {
    const v = cleanText(val);
    if (!v) return undefined;
    const hex = v.startsWith('#') ? v : `#${v}`;
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex) ? hex : undefined;
  };

  const theme = {
    primary: cleanColor(raw?.theme?.primary),
    secondary: cleanColor(raw?.theme?.secondary),
    text: cleanColor(raw?.theme?.text),
    logo_bg: cleanColor(raw?.theme?.logo_bg)
  };

  const jingleRaw = cleanText(raw?.jingle);
  const jingle = jingleRaw && jingleRaw !== 'random' ? jingleRaw : null;

  return {theme, jingle};
}

function mergeThemeAndJingle(existing: EditorOverrides | null, patch: Pick<EditorOverrides, 'theme' | 'jingle'>): EditorOverrides {
  return {
    ...existing,
    theme: {
      primary: patch.theme?.primary ?? existing?.theme?.primary,
      secondary: patch.theme?.secondary ?? existing?.theme?.secondary,
      text: patch.theme?.text ?? existing?.theme?.text,
      logo_bg: patch.theme?.logo_bg ?? existing?.theme?.logo_bg
    },
    jingle: patch.jingle ?? existing?.jingle ?? null
  };
}

function updatePartnerFeed(entry: any) {
  const existing = readJson<{items: any[]; updated_at?: string}>(PARTNER_FEED) ?? {items: []};
  const items = Array.isArray(existing.items) ? existing.items : [];
  const idx = items.findIndex((item) => item.job_id === entry.job_id);
  if (idx >= 0) {
    items[idx] = {...items[idx], ...entry};
  } else {
    items.push(entry);
  }
  writeJson(PARTNER_FEED, {updated_at: new Date().toISOString(), items});
}

function loadLocalFeedIndex() {
  if (localFeedIndex) return localFeedIndex;
  if (!existsSync(LOCAL_FEED_CACHE)) {
    localFeedIndex = {};
    return localFeedIndex;
  }
  try {
    const raw = JSON.parse(readFileSync(LOCAL_FEED_CACHE, 'utf8')) as any[];
    const index: Record<string, {published?: string; job_ad_type?: string}> = {};
    for (const item of raw ?? []) {
      const jobId = item?.job_id != null ? String(item.job_id) : null;
      if (!jobId) continue;
      index[jobId] = {
        published: item?.published,
        job_ad_type: item?.job_ad_type
      };
    }
    localFeedIndex = index;
    return localFeedIndex;
  } catch {
    localFeedIndex = {};
    return localFeedIndex;
  }
}

function buildPublicUrl(jobId: string, filePath: string | null): string | null {
  if (!filePath) return null;
  const file = basename(filePath);
  return `${OUTPUT_BASE_URL}/${encodeURIComponent(jobId)}/${encodeURIComponent(file)}`;
}

function buildJoblyFeedItem(artifact: any) {
  const jobId = String(artifact.extracted.job_id ?? artifact.id);
  const index = loadLocalFeedIndex();
  const published = artifact.input?.published ?? index[jobId]?.published ?? artifact.extracted?.posted_date ?? null;
  const jobAdType = artifact.input?.job_ad_type ?? index[jobId]?.job_ad_type ?? null;
  const company = artifact.overrides?.company ?? artifact.extracted?.company ?? '';
  const title = artifact.overrides?.title ?? artifact.extracted?.title ?? '';

  return {
    job_id: jobId,
    published,
    company,
    title,
    job_ad_type: jobAdType,
    video_url: buildPublicUrl(jobId, artifact.video),
    thumbnail_url: buildPublicUrl(jobId, artifact.thumbnail)
  };
}

function rebuildJoblyFeed() {
  const items = listArtifactDirs()
    .map((id) => loadArtifact(id))
    .filter(Boolean)
    .map((artifact: any) => buildJoblyFeedItem(artifact));
  writeJson(JOBLY_FEED, {updated_at: new Date().toISOString(), items});
}

app.get('/api/health', (_req, res) => {
  res.json({ok: true});
});

app.get('/api/jingles', (_req, res) => {
  res.json({jingles: listJingles()});
});

app.get('/api/artifacts', (_req, res) => {
  const entries = listArtifactDirs()
    .map((id) => loadArtifact(id))
    .filter(Boolean)
    .map((artifact: any) => {
      const stat = statSync(artifact.dir);
      const title = artifact.overrides?.title ?? artifact.extracted.title ?? '';
      const company = artifact.overrides?.company ?? artifact.extracted.company ?? '';
      return {
        id: artifact.id,
        job_id: artifact.extracted.job_id ?? artifact.id,
        title,
        company,
        location: artifact.overrides?.location ?? artifact.extracted.location ?? '',
        updated_at: stat.mtime.toISOString(),
        has_overrides: Boolean(artifact.overrides),
        thumbnail_url: toPublicPath(artifact.thumbnail),
        video_url: toPublicPath(artifact.video)
      };
    });

  res.json({items: entries});
});

app.get('/api/artifacts/:id', (req, res) => {
  const {id} = req.params;
  const artifact = loadArtifact(id);
  if (!artifact) {
    res.status(404).json({error: 'Not found'});
    return;
  }

  const logoUrl = toPublicPath(artifact.extracted.logo_path);
  const videoUrl = toPublicPath(artifact.video);
  const thumbnailUrl = toPublicPath(artifact.thumbnail);

  res.json({
    id,
    extracted: artifact.extracted,
    bubbles: artifact.bubbles,
    overrides: artifact.overrides,
    assets: {
      logo_url: logoUrl,
      video_url: videoUrl,
      thumbnail_url: thumbnailUrl
    },
    jingles: listJingles()
  });
});

app.post('/api/artifacts/:id/reset', (req, res) => {
  const {id} = req.params;
  const artifact = loadArtifact(id);
  if (!artifact) {
    res.status(404).json({error: 'Not found'});
    return;
  }

  const overridesPath = join(artifact.dir, 'overrides.json');
  if (existsSync(overridesPath)) {
    unlinkSync(overridesPath);
  }
  res.json({ok: true});
});

app.post('/api/artifacts/bulk-overrides', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  if (ids.length === 0) {
    res.status(400).json({error: 'No ids provided'});
    return;
  }

  const patch = sanitizeThemeAndJingle(req.body?.overrides ?? {});
  const updated: string[] = [];
  const missing: string[] = [];

  for (const id of ids) {
    const artifact = loadArtifact(id);
    if (!artifact) {
      missing.push(id);
      continue;
    }
    const overridesPath = join(artifact.dir, 'overrides.json');
    const existing = readJson<EditorOverrides>(overridesPath);
    const merged = mergeThemeAndJingle(existing, patch);
    writeJson(overridesPath, merged);
    updated.push(id);
  }

  res.json({ok: true, updated, missing});
});

app.post('/api/artifacts/:id/regenerate', async (req, res) => {
  const {id} = req.params;
  const artifact = loadArtifact(id);
  if (!artifact) {
    res.status(404).json({error: 'Not found'});
    return;
  }

  const overrides = sanitizeOverrides(req.body?.overrides ?? {});
  const overridesPath = join(artifact.dir, 'overrides.json');
  writeJson(overridesPath, overrides);

  let jinglePath: string | undefined;
  if (overrides.jingle) {
    const candidate = join(JINGLES_DIR, overrides.jingle);
    if (existsSync(candidate)) jinglePath = candidate;
  }

  try {
    const result = await renderVideo(
      artifact.dir,
      join(artifact.dir, 'extracted.json'),
      join(artifact.dir, 'bubbles.json'),
      overrides,
      jinglePath
    );

    const merged = applyOverrides(artifact.extracted, artifact.bubbles, overrides);
    updatePartnerFeed({
      job_id: artifact.extracted.job_id ?? id,
      job_key: id,
      company: merged.company,
      title: merged.title,
      location: merged.location,
      video_path: result.videoPath,
      thumbnail_path: result.thumbnailPath,
      updated_at: new Date().toISOString(),
      source_url: artifact.extracted.source_url
    });
    rebuildJoblyFeed();

    res.json({
      ok: true,
      video_url: toPublicPath(result.videoPath),
      thumbnail_url: toPublicPath(result.thumbnailPath)
    });
  } catch (err) {
    res.status(500).json({error: err instanceof Error ? err.message : String(err)});
  }
});

rebuildJoblyFeed();

app.listen(PORT, () => {
  console.log(`Editor API listening on http://localhost:${PORT}`);
});
