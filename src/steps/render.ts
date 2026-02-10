import {join} from 'path';
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {readFileSync, existsSync} from 'fs';
import {pickRandomJingle} from './jingle';
import {applyOverrides, EditorOverrides} from '../utils/editor-overrides';

export type RenderResult = {
  videoPath: string;
  thumbnailPath: string;
};

export async function renderVideo(
  jobDir: string,
  extractedPath: string,
  bubblesPath: string,
  overrides?: EditorOverrides,
  jinglePath?: string
): Promise<RenderResult> {
  const extracted = JSON.parse(readFileSync(extractedPath, 'utf8')) as any;
  const bubbles = JSON.parse(readFileSync(bubblesPath, 'utf8')) as any;

  const entry = join(process.cwd(), 'remotion', 'src', 'index.tsx');
  const bundleLocation = join(jobDir, 'remotion-bundle');

  const serveUrl = await bundle({
    entryPoint: entry,
    outDir: bundleLocation
  });

  const baseProps = applyOverrides(extracted, bubbles, overrides);
  const inputProps = {
    ...baseProps,
    logoSrc: loadLogoDataUrl(extracted.logo_path),
    audioSrc: pickAudioSrc(jinglePath),
    lang: baseProps.lang ?? detectLanguage(extracted),
    showGuides: process.env.SHOW_TIKTOK_GUIDES === '1',
    showLogoDebug: process.env.SHOW_LOGO_DEBUG === '1'
  };

  const composition = await selectComposition({
    serveUrl,
    id: 'AdVideo',
    inputProps
  });

  const jobId = extracted.job_id ?? deriveJobId(extracted.source_url) ?? 'job';
  const safeId = String(jobId).replace(/[^a-zA-Z0-9_-]+/g, '_');
  const videoPath = join(jobDir, `${safeId}_video.mp4`);
  await renderMedia({
    serveUrl,
    composition,
    codec: 'h264',
    audioCodec: 'aac',
    audioBitrate: '128k',
    crf: 28,
    outputLocation: videoPath,
    inputProps,
    chromiumOptions: {
      disableWebSecurity: true
    }
  });

  const thumbnailPath = join(jobDir, `${safeId}_thumbnail.png`);
  await renderStill({
    serveUrl,
    composition,
    frame: Math.max(0, composition.durationInFrames - 1),
    output: thumbnailPath,
    inputProps,
    chromiumOptions: {
      disableWebSecurity: true
    }
  });

  return {videoPath, thumbnailPath};
}

function deriveJobId(url?: string): string | undefined {
  if (!url) return undefined;
  const match = String(url).match(/-(\d+)$/);
  return match ? match[1] : undefined;
}

function detectLanguage(extracted: any): 'fi' | 'en' {
  const sample = [
    extracted.title,
    extracted.description,
    extracted.company
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const finnishHints = ['odotamme', 'tarjoamme', 'työ', 'tyopaikka', 'hakemus', 'edu', 'kokemus', 'ohjelmist', 'tiimi', 'kehitys'];
  if (/[äöå]/.test(sample)) return 'fi';
  if (finnishHints.some((w) => sample.includes(w))) return 'fi';
  return 'en';
}

function loadLogoDataUrl(path?: string): string | undefined {
  if (!path) return undefined;
  if (!existsSync(path)) return undefined;
  const ext = path.toLowerCase();
  let mime = 'image/png';
  if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) mime = 'image/jpeg';
  if (ext.endsWith('.webp')) mime = 'image/webp';
  if (ext.endsWith('.gif')) mime = 'image/gif';
  if (ext.endsWith('.svg')) mime = 'image/svg+xml';
  const buffer = readFileSync(path);
  const base64 = buffer.toString('base64');
  return `data:${mime};base64,${base64}`;
}

function pickAudioSrc(explicitPath?: string): string | undefined {
  const file = explicitPath ?? pickRandomJingle();
  if (!file) return undefined;
  return loadAudioDataUrl(file);
}

function loadAudioDataUrl(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  const ext = path.toLowerCase();
  let mime = 'audio/mpeg';
  if (ext.endsWith('.wav')) mime = 'audio/wav';
  if (ext.endsWith('.m4a')) mime = 'audio/mp4';
  if (ext.endsWith('.aac')) mime = 'audio/aac';
  if (ext.endsWith('.ogg')) mime = 'audio/ogg';
  const buffer = readFileSync(path);
  const base64 = buffer.toString('base64');
  return `data:${mime};base64,${base64}`;
}
