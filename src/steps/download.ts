import {createWriteStream} from 'fs';
import {extname, join} from 'path';
import {pipeline} from 'stream/promises';
import sharp from 'sharp';

export type DownloadResult = {
  filePath: string;
  width?: number;
  height?: number;
};

export async function downloadLogo(jobDir: string, logoUrl?: string): Promise<DownloadResult | null> {
  if (!logoUrl) return null;
  const url = new URL(logoUrl);
  const ext = sanitizeExt(extname(url.pathname)) || '.png';
  const originalPath = join(jobDir, `logo-original${ext}`);
  const basePath = join(jobDir, ext.toLowerCase() === '.gif' ? 'logo.png' : `logo${ext}`);

  const res = await fetch(logoUrl, {headers: {'user-agent': 'remotion-flow/0.1 (logo fetch)'}});
  if (!res.ok || !res.body) {
    throw new Error(`Logo download failed: ${res.status} ${res.statusText}`);
  }

  const stream = createWriteStream(originalPath);
  await pipeline(res.body as unknown as NodeJS.ReadableStream, stream);
  if (ext.toLowerCase() === '.gif') {
    await convertGifToPng(originalPath, basePath);
    await trimLogo(basePath, basePath);
  } else {
    await trimLogo(originalPath, basePath);
  }

  const meta = await safeMetadata(basePath);
  return {filePath: basePath, width: meta?.width, height: meta?.height};
}

function sanitizeExt(ext: string): string {
  const lower = ext.toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(lower)) return lower;
  return '';
}

async function trimLogo(inputPath: string, outputPath: string): Promise<void> {
  try {
    const tempPath = outputPath === inputPath ? `${outputPath}.tmp` : outputPath;
    await sharp(inputPath)
      .trim({threshold: 10})
      .toFile(tempPath);
    if (tempPath !== outputPath) {
      // If we used a temp file, move it into place.
      await import('fs').then((fs) => fs.renameSync(tempPath, outputPath));
    }
  } catch {
    // Fallback to original if trim fails.
    if (inputPath !== outputPath) {
      await sharp(inputPath).toFile(outputPath);
    }
  }
}

async function convertGifToPng(inputPath: string, outputPath: string): Promise<void> {
  try {
    await sharp(inputPath, {animated: false})
      .png()
      .toFile(outputPath);
  } catch {
    await sharp(inputPath).png().toFile(outputPath);
  }
}

async function safeMetadata(path: string): Promise<{width?: number; height?: number} | null> {
  try {
    const meta = await sharp(path).metadata();
    return {width: meta.width, height: meta.height};
  } catch {
    return null;
  }
}

// Note: Logo normalization removed to avoid artifacts on light logos.
