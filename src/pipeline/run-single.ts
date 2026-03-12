import {join} from 'path';
import {readFileSync} from 'fs';
import {load} from 'cheerio';
import {ensureJobDir, makeJobKey, writeJson} from '../utils/cache';
import {validateWithSchema} from '../utils/validate';
import {fetchHtml} from '../steps/fetch';
import {extractJob} from '../steps/extract';
import {generateBubbles} from '../steps/llm';
import {reviewBubbles} from '../steps/review';
import {downloadLogo} from '../steps/download';
import {renderVideo} from '../steps/render';
import {extractBrandColors} from '../steps/brand';
import {discoverCompanySite} from '../steps/company-site';
import {InputPayload, RunSingleResult} from './types';

export async function runSingle(input: InputPayload): Promise<RunSingleResult> {
  const jobKey = makeJobKey({jobId: input.job_id ? String(input.job_id) : undefined, jobUrl: input.job_url});
  const dir = ensureJobDir(jobKey);
  const inputPath = join(dir, 'input.json');
  writeJson(inputPath, input);

  try {
    const fetchResult = await fetchHtml(dir, input.job_url);
    const extracted = extractJob(fetchResult.htmlPath, input.job_url, {
      job_id: input.job_id ? String(input.job_id) : undefined,
      company: input.company,
      title: input.title,
      company_site: input.company_site
    });

    if (!extracted.logo_url) {
      extracted.logo_url = discoverLogoUrlFromJobPage(fetchResult.htmlPath, input.job_url);
    }

    extracted.company_site = normalizePublicUrl(extracted.company_site);

    if (!extracted.company_site || extracted.company_site.includes('jobly.fi')) {
      const fromDesc = findUrlInText(extracted.description);
      if (fromDesc) extracted.company_site = normalizePublicUrl(fromDesc);
    }
    if (!extracted.company_site || extracted.company_site.includes('jobly.fi')) {
      const discovered = await discoverCompanySite(fetchResult.htmlPath);
      if (discovered) extracted.company_site = normalizePublicUrl(discovered);
    }

    const logo = await downloadLogo(dir, extracted.logo_url);
    if (logo?.filePath) {
      extracted.logo_path = logo.filePath;
      extracted.logo_meta = {width: logo.width, height: logo.height};
    }

    extracted.brand_colors = await extractBrandColors(extracted.company_site, extracted.logo_path);
    validateWithSchema('job.schema.json', extracted);

    const extractedPath = join(dir, 'extracted.json');
    writeJson(extractedPath, extracted);

    const bubbles = await generateBubbles(dir, extractedPath);
    const bubblesPath = join(dir, 'bubbles.json');
    writeJson(bubblesPath, bubbles);

    const reviewed = await reviewBubbles(dir, extractedPath, bubblesPath);
    writeJson(bubblesPath, reviewed);

    const renderResult = await renderVideo(dir, extractedPath, bubblesPath);

    return {
      job_key: jobKey,
      input_path: inputPath,
      extracted_path: extractedPath,
      bubbles_path: bubblesPath,
      video_path: renderResult.videoPath,
      thumbnail_path: renderResult.thumbnailPath
    };
  } catch (err) {
    return {
      job_key: jobKey,
      input_path: inputPath,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

function findUrlInText(text: string): string | undefined {
  if (!text) return undefined;
  const matches = text.match(/(https?:\/\/[^\s)]+|www\.[^\s)]+)/gi) ?? [];
  for (const raw of matches) {
    const url = raw.startsWith('http') ? raw : `https://${raw}`;
    if (url.includes('jobly.fi')) continue;
    return url.replace(/[.,;:]+$/, '');
  }
  return undefined;
}

function normalizePublicUrl(value?: string): string | undefined {
  if (!value) return undefined;
  const cleaned = value.trim().replace(/[)\],;:]+$/, '');
  if (!cleaned) return undefined;
  const withProtocol = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
  try {
    const url = new URL(withProtocol);
    if (!/^https?:$/i.test(url.protocol)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function discoverLogoUrlFromJobPage(htmlPath: string, pageUrl: string): string | undefined {
  const html = readFileSync(htmlPath, 'utf8');
  const $ = load(html);

  const candidates = [
    $('[data-cy="company-logo"] img').attr('src'),
    $('[data-cy="company-logo"]').attr('src'),
    $('.company-logo img').attr('src')
  ];

  for (const candidate of candidates) {
    const normalized = normalizeImageUrl(candidate, pageUrl);
    if (normalized) return normalized;
  }
  return undefined;
}

function normalizeImageUrl(value: string | undefined, pageUrl: string): string | undefined {
  if (!value) return undefined;
  const cleaned = value.trim();
  if (!cleaned) return undefined;
  try {
    const absolute = new URL(cleaned, pageUrl).toString();
    return /^https?:\/\//i.test(absolute) ? absolute : undefined;
  } catch {
    return undefined;
  }
}
