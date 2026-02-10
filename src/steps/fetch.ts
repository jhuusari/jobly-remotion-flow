import {writeFileSync} from 'fs';
import {join} from 'path';

export type FetchResult = {
  htmlPath: string;
};

export async function fetchHtml(jobDir: string, url: string, force = false): Promise<FetchResult> {
  const htmlPath = join(jobDir, 'raw.html');
  if (!force) {
    try {
      const existing = require('fs').readFileSync(htmlPath, 'utf8');
      if (existing && existing.length > 50) {
        return {htmlPath};
      }
    } catch {
      // ignore
    }
  }

  const res = await fetch(url, {
    headers: {
      'user-agent': 'remotion-flow/0.1 (jobly scraper)'
    }
  });

  if (!res.ok) {
    throw new Error(`Fetch failed for ${url}: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  writeFileSync(htmlPath, html, 'utf8');
  return {htmlPath};
}
