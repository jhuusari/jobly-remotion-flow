import {join} from 'path';
import {readFileSync} from 'fs';
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

const FEED_URL = 'https://jobly.almamedia.fi/aineistot/jesselle/2026-kamppikset.json';

export type InputPayload = {
  job_url: string;
  job_id?: string | number;
  company?: string;
  title?: string;
  company_site?: string;
  published?: string;
  job_ad_type?: string;
  channel?: {name?: string; id?: string};
  budget?: {currency?: string; min?: number; max?: number};
};

type BatchPayload = {
  jobs: InputPayload[];
};

type RawImportJob = {
  job_url?: string;
  job_id?: string | number;
  company_name?: string;
  title?: string;
  published?: string;
  expired?: string;
  job_ad_type?: string;
};

type CliOptions = {
  sinceDays?: number;
  limit?: number;
  concurrency?: number;
  jobId?: string;
};

function parseCliOptions(argv: string[]): CliOptions {
  const opts: CliOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--since-days' && next) {
      opts.sinceDays = Number(next);
      i += 1;
    } else if (arg === '--limit' && next) {
      opts.limit = Number(next);
      i += 1;
    } else if (arg === '--concurrency' && next) {
      opts.concurrency = Number(next);
      i += 1;
    } else if (arg === '--job-id' && next) {
      opts.jobId = next;
      i += 1;
    }
  }
  return opts;
}

async function loadFeed(): Promise<unknown> {
  const res = await fetch(FEED_URL, {headers: {'user-agent': 'remotion-flow/0.1 (feed fetch)'}});
  if (!res.ok) {
    throw new Error(`Feed fetch failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function normalizeInput(input: unknown, opts: CliOptions): InputPayload | BatchPayload {
  if (Array.isArray(input)) {
    const filtered = filterRawJobs(input as RawImportJob[], opts);
    return {jobs: filtered.map(mapRawJob)};
  }
  if (input && typeof input === 'object' && 'jobs' in (input as any)) {
    const jobs = Array.isArray((input as any).jobs) ? (input as any).jobs : [];
    const filtered = filterRawJobs(jobs as RawImportJob[], opts);
    return {jobs: filtered.map(mapRawJob)};
  }
  return mapRawJob(input as RawImportJob);
}

function filterRawJobs(jobs: RawImportJob[], opts: CliOptions): RawImportJob[] {
  const now = new Date();
  const since = opts.sinceDays ? new Date(now.getTime() - opts.sinceDays * 24 * 60 * 60 * 1000) : null;
  const targetId = opts.jobId ? String(opts.jobId) : null;

  let filtered = jobs.filter((job) => {
    const published = parseDate(job.published);
    const expired = parseDate(job.expired);
    if (expired && expired <= now) return false;
    if (since && published && published < since) return false;
    if (targetId && String(job.job_id) !== targetId) return false;
    return true;
  });

  if (opts.limit && Number.isFinite(opts.limit) && opts.limit > 0) {
    filtered = filtered.slice(0, opts.limit);
  }

  return filtered;
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Format: YYYY-MM-DD HH:MM:SS.s
  const normalized = trimmed.replace(' ', 'T');
  const dt = new Date(`${normalized}Z`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function mapRawJob(raw: RawImportJob): InputPayload {
  return {
    job_url: raw.job_url || '',
    job_id: raw.job_id ?? undefined,
    company: (raw as any).company ?? raw.company_name ?? undefined,
    title: raw.title ?? undefined,
    company_site: (raw as any).company_site ?? undefined,
    published: raw.published ?? undefined,
    job_ad_type: raw.job_ad_type ?? undefined,
    channel: (raw as any).channel ?? undefined,
    budget: (raw as any).budget ?? undefined
  };
}

async function runSingle(input: InputPayload) {
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
    if (!extracted.company_site || extracted.company_site.includes('jobly.fi')) {
      const fromDesc = findUrlInText(extracted.description);
      if (fromDesc) extracted.company_site = fromDesc;
    }
    if (!extracted.company_site || extracted.company_site.includes('jobly.fi')) {
      const discovered = await discoverCompanySite(fetchResult.htmlPath);
      if (discovered) extracted.company_site = discovered;
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

async function runWithConcurrency(jobs: InputPayload[], concurrency: number) {
  const results: unknown[] = [];
  let index = 0;

  const workers = Array.from({length: concurrency}).map(async () => {
    while (index < jobs.length) {
      const current = jobs[index];
      index += 1;
      const result = await runSingle(current);
      results.push(result);
    }
  });

  await Promise.all(workers);
  return results;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const opts = parseCliOptions(argv);

  const feed = await loadFeed();
  const input = normalizeInput(feed, opts);
  const isBatch = typeof input === 'object' && input !== null && 'jobs' in (input as any);

  validateWithSchema('input.schema.json', input);

  if (isBatch) {
    const batch = input as BatchPayload;
    const concurrency = opts.concurrency && opts.concurrency > 0 ? Math.floor(opts.concurrency) : 1;
    const results = concurrency > 1
      ? await runWithConcurrency(batch.jobs, concurrency)
      : await runWithConcurrency(batch.jobs, 1);
    console.log(JSON.stringify({batch: results}, null, 2));
    return;
  }

  const result = await runSingle(input as InputPayload);
  console.log(JSON.stringify(result, null, 2));
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

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
