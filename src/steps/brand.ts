import {readFileSync, existsSync} from 'fs';
import {load} from 'cheerio';
import sharp from 'sharp';

export type BrandColors = {
  primary?: string;
  secondary?: string;
  text?: string;
  logo_bg?: string;
};

export async function extractBrandColors(companySite?: string, logoPath?: string): Promise<BrandColors> {
  const siteColors = companySite ? await fetchSiteColors(companySite) : {};
  const logoSource = pickLogoSource(logoPath);
  const logoColors = logoSource ? await extractLogoColors(logoSource) : {};

  const defaultPrimary = '#ED2D26';
  const defaultSecondary = '#F4817D';

  const detectedPrimary = normalizePrimary(siteColors.primary || logoColors.primary);
  const primary = detectedPrimary || defaultPrimary;
  const secondary = detectedPrimary
    ? (normalizePrimary(siteColors.secondary || logoColors.secondary) || adjustColor(primary, -0.12))
    : defaultSecondary;
  const text = ensureReadableText(primary);
  const logo_bg = siteColors.logo_bg || logoColors.logo_bg || '#FFFFFF';

  return {
    primary,
    secondary,
    text,
    logo_bg
  };
}

function pickLogoSource(logoPath?: string): string | undefined {
  if (!logoPath) return undefined;
  const original = logoPath.replace(/logo(\.[a-zA-Z0-9]+)$/, 'logo-original$1');
  if (existsSync(original)) return original;
  return existsSync(logoPath) ? logoPath : undefined;
}

async function fetchSiteColors(site: string): Promise<BrandColors> {
  try {
    const res = await fetch(site, {headers: {'user-agent': 'remotion-flow/0.1 (brand colors)'}});
    if (!res.ok) return {};
    const html = await res.text();
    const $ = load(html);

    const theme = $('meta[name="theme-color"]').attr('content');
    const manifestHref = $('link[rel="manifest"]').attr('href');

    const primary = normalizeHex(theme);
    let secondary: string | undefined;

    if (manifestHref) {
      const manifestUrl = new URL(manifestHref, site).toString();
      const manifest = await fetchManifest(manifestUrl);
      secondary = normalizeHex(manifest?.background_color) || normalizeHex(manifest?.theme_color) || undefined;
    }

    return {
      primary: primary || undefined,
      secondary
    };
  } catch {
    return {};
  }
}

async function fetchManifest(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {headers: {'user-agent': 'remotion-flow/0.1 (manifest fetch)'}});
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function extractLogoColors(path: string): Promise<BrandColors> {
  try {
    const image = sharp(path);
    const meta = await image.metadata();
    const width = meta.width ?? 64;
    const height = meta.height ?? 64;

    const small = await image
      .resize(80, 80, {fit: 'inside'})
      .ensureAlpha()
      .raw()
      .toBuffer({resolveWithObject: true});

    const {data, info} = small;
    const accent = detectAccentColor(data, info.width, info.height);
    const [avgR, avgG, avgB] = accent || averageOpaquePixels(data, info.width, info.height);
    const primary = rgbToHex(avgR, avgG, avgB);

    const [bgR, bgG, bgB, bgA] = averageCorners(data, info.width, info.height);
    const bgHex = rgbToHex(bgR, bgG, bgB);
    const logo_bg = pickLogoBackground(bgHex, bgA, [avgR, avgG, avgB]);

    return {
      primary,
      secondary: adjustColor(primary, -0.12),
      logo_bg
    };
  } catch {
    return {};
  }
}

function normalizePrimary(hex?: string): string | undefined {
  if (!hex) return undefined;
  const [r, g, b] = hexToRgb(hex);
  const lum = relativeLuminance(r, g, b);
  if (lum > 0.92) return undefined;
  return hex;
}

function pickLogoBackground(bgHex: string, bgAlpha: number, avg: [number, number, number]): string {
  if (bgAlpha < 0.2) return '#FFFFFF';
  if (isLowSaturation(avg)) return '#FFFFFF';
  const lum = relativeLuminance(...avg);
  if (lum > 0.85) return '#FFFFFF';
  return bgHex;
}

function averageOpaquePixels(data: Buffer, width: number, height: number): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let i = 0; i < width * height; i += 1) {
    const idx = i * 4;
    const alpha = data[idx + 3] / 255;
    if (alpha < 0.2) continue;
    r += data[idx];
    g += data[idx + 1];
    b += data[idx + 2];
    count += 1;
  }
  if (count === 0) return [140, 191, 26];
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
}

function detectAccentColor(data: Buffer, width: number, height: number): [number, number, number] | null {
  let bestScore = -1;
  let best: [number, number, number] | null = null;

  for (let i = 0; i < width * height; i += 1) {
    const idx = i * 4;
    const alpha = data[idx + 3] / 255;
    if (alpha < 0.5) continue;

    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    // Ignore near-white and near-black pixels.
    if (r > 242 && g > 242 && b > 242) continue;
    if (r < 16 && g < 16 && b < 16) continue;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max - min;
    if (saturation < 30) continue;

    const lum = relativeLuminance(r, g, b);
    // Prefer vivid but not extreme dark/light colors.
    const score = saturation * (1 - Math.abs(lum - 0.5));
    if (score > bestScore) {
      bestScore = score;
      best = [r, g, b];
    }
  }

  return best;
}

function averageCorners(data: Buffer, width: number, height: number): [number, number, number, number] {
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1]
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (const [x, y] of corners) {
    const idx = (y * width + x) * 4;
    r += data[idx];
    g += data[idx + 1];
    b += data[idx + 2];
    a += data[idx + 3] / 255;
  }
  return [r / 4, g / 4, b / 4, a / 4];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function toHex(v: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(v)));
  return clamped.toString(16).padStart(2, '0');
}

function normalizeHex(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^#([0-9a-fA-F]{3})$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  if (/^#([0-9a-fA-F]{6})$/.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

function adjustColor(hex?: string, amount = -0.12): string | undefined {
  if (!hex) return undefined;
  const [r, g, b] = hexToRgb(hex);
  const adj = (v: number) => Math.max(0, Math.min(255, Math.round(v + 255 * amount)));
  return rgbToHex(adj(r), adj(g), adj(b));
}

function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return [r, g, b];
}

function ensureReadableText(bgHex: string): string {
  const [r, g, b] = hexToRgb(bgHex);
  const luminance = relativeLuminance(r, g, b);
  return luminance > 0.55 ? '#0B0B0B' : '#FFFFFF';
}

function isLowSaturation([r, g, b]: [number, number, number]): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max - min < 18;
}

function relativeLuminance(r: number, g: number, b: number): number {
  const srgb = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}
