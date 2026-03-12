import {validateWithSchema} from '../utils/validate';
import {runSingle} from '../pipeline/run-single';
import {InputPayload} from '../pipeline/types';

const FEED_URL = 'https://jobly.almamedia.fi/aineistot/jesselle/2026-kamppikset.json';

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

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
