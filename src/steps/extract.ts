import {readFileSync} from 'fs';
import {load} from 'cheerio';

export type CanonicalJob = {
  job_id?: string;
  source_url: string;
  title: string;
  company: string;
  logo_url?: string;
  logo_path?: string;
  logo_meta?: {width?: number; height?: number};
  company_site?: string;
  language?: string;
  brand_colors?: {primary?: string; secondary?: string; text?: string; logo_bg?: string};
  location?: string;
  employment_type?: string;
  seniority?: string;
  salary?: {currency?: string; min?: number; max?: number; period?: string};
  description: string;
  requirements?: string[];
  benefits?: string[];
  posted_date?: string;
  extracted_at: string;
  raw_html_path: string;
};

export function extractJob(htmlPath: string, url: string, overrides?: Partial<CanonicalJob>): CanonicalJob {
  const html = readFileSync(htmlPath, 'utf8');
  const $ = load(html);

  const structured = extractJsonLd($);

  const title = pickFirst([
    structured?.title,
    textOf($, 'h1'),
    metaContent($, 'meta[property="og:title"]'),
    metaContent($, 'meta[name="twitter:title"]'),
    textOf($, 'title')
  ]);

  const company = pickFirst([
    structured?.company,
    textOf($, '[data-cy="company-name"]'),
    textOf($, '.company-name'),
    textOf($, '.job__company'),
    textOf($, '.job-card__company'),
    textOf($, 'a[href*="/yritys/"]'),
    metaContent($, 'meta[property="og:site_name"]')
  ]);

  const location = pickFirst([
    structured?.location,
    textOf($, '[data-cy="job-location"]'),
    textOf($, '.job__location'),
    textOf($, '.job-location')
  ]);

  const description = pickFirst([
    structured?.description,
    extractDescription($)
  ]);
  if (!title || !company || !description) {
    const missing = [!title && 'title', !company && 'company', !description && 'description']
      .filter(Boolean)
      .join(', ');
    throw new Error(`Extraction failed: missing ${missing}`);
  }

  const requirements = extractListByHeading($, ['Odotamme', 'Edellytämme', 'Toivomme']);
  const benefits = extractListByHeading($, ['Tarjoamme', 'Edut', 'Hyödyt']);

  const job: CanonicalJob = {
    job_id: deriveJobId(url),
    source_url: url,
    title,
    company,
    logo_url: structured?.logo ?? undefined,
    company_site: structured?.sameAs ?? undefined,
    language: detectLanguage(`${title} ${description}`),
    location: location || undefined,
    description,
    requirements: requirements.length > 0 ? requirements : undefined,
    benefits: benefits.length > 0 ? benefits : undefined,
    employment_type: structured?.employmentType ?? undefined,
    posted_date: toDateTime(structured?.datePosted),
    salary: structured?.salary ?? undefined,
    extracted_at: new Date().toISOString(),
    raw_html_path: htmlPath
  };

  const merged = applyOverrides(job, overrides);
  if (!merged.posted_date || !isDateTime(merged.posted_date)) {
    merged.posted_date = merged.extracted_at;
  }
  return merged;
}

function textOf($: ReturnType<typeof load>, selector: string): string | null {
  const el = $(selector).first();
  if (!el || el.length === 0) return null;
  const text = el.text().replace(/\s+/g, ' ').trim();
  return text || null;
}

function metaContent($: ReturnType<typeof load>, selector: string): string | null {
  const el = $(selector).first();
  if (!el || el.length === 0) return null;
  const content = el.attr('content');
  if (!content) return null;
  return content.replace(/\s+/g, ' ').trim();
}

function extractDescription($: ReturnType<typeof load>): string {
  const candidates = [
    '[data-cy="job-description"]',
    '.job__description',
    '.job-description',
    'article',
    'main'
  ];

  for (const selector of candidates) {
    const el = $(selector).first();
    if (el && el.length > 0) {
      const text = el.text().replace(/\s+/g, ' ').trim();
      if (text.length > 200) return text;
    }
  }

  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  return bodyText.length > 200 ? bodyText : '';
}

type JsonLdJob = {
  title?: string;
  company?: string;
  description?: string;
  location?: string;
  datePosted?: string;
  employmentType?: string;
  logo?: string;
  sameAs?: string;
  salary?: {currency?: string; min?: number; max?: number; period?: string};
};

function extractJsonLd($: ReturnType<typeof load>): JsonLdJob | null {
  const scripts = $('script[type="application/ld+json"]');
  if (!scripts || scripts.length === 0) return null;

  for (const el of scripts.toArray()) {
    const raw = $(el).text();
    if (!raw) continue;
    const parsed = safeJsonParse(raw);
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of candidates) {
      if (!item || typeof item !== 'object') continue;
      const type = String((item as any)['@type'] ?? '');
      if (type !== 'JobPosting') continue;

      const title = asString((item as any).title);
      const hiringOrg = (item as any).hiringOrganization ?? {};
      const company = asString(hiringOrg.name);
      const sameAs = asString(hiringOrg.sameAs);
      const descriptionHtml = asString((item as any).description);
      const description = descriptionHtml ? stripHtml(descriptionHtml) : undefined;
      const datePosted = asString((item as any).datePosted);
      const employmentType = extractEmploymentType((item as any).employmentType);
      const location = extractLocation((item as any).jobLocation);
      const logo = asString((hiringOrg as any).logo);
      const salary = extractSalary((item as any).baseSalary);

      return {
        title,
        company,
        description,
        datePosted,
        employmentType,
        location,
        logo,
        sameAs,
        salary
      };
    }
  }

  return null;
}

function extractListByHeading($: ReturnType<typeof load>, headingPrefixes: string[]): string[] {
  const results: string[] = [];
  $('h1,h2,h3,h4,strong').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (!text) return;
    const matches = headingPrefixes.some((p) => text.toLowerCase().startsWith(p.toLowerCase()));
    if (!matches) return;

    const list = $(el).nextAll('ul,ol').first();
    if (list && list.length > 0) {
      list.find('li').each((__, li) => {
        const item = $(li).text().replace(/\s+/g, ' ').trim();
        if (item) results.push(item);
      });
    }
  });
  return results;
}

function pickFirst(values: Array<string | null | undefined>): string {
  for (const v of values) {
    if (v && v.trim().length > 0) return v.trim();
  }
  return '';
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return undefined;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractLocation(value: unknown): string | undefined {
  if (!value) return undefined;
  const locations = Array.isArray(value) ? value : [value];
  const names: string[] = [];
  for (const loc of locations) {
    if (!loc || typeof loc !== 'object') continue;
    const address = (loc as any).address;
    if (address && typeof address === 'object') {
      const locality = asString(address.addressLocality);
      if (locality) names.push(locality);
    }
  }
  return names.length > 0 ? Array.from(new Set(names)).join(', ') : undefined;
}

function extractEmploymentType(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const items = value.filter((v) => typeof v === 'string') as string[];
    return items.length > 0 ? items.join(', ') : undefined;
  }
  return undefined;
}

function extractSalary(value: unknown): {currency?: string; min?: number; max?: number; period?: string} | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const currency = asString((value as any).currency);
  const val = (value as any).value;
  if (!val || typeof val !== 'object') return currency ? {currency} : undefined;
  const min = toNumber((val as any).minValue);
  const max = toNumber((val as any).maxValue);
  const period = asString((val as any).unitText);
  if (!currency && min === undefined && max === undefined && !period) return undefined;
  return {currency, min, max, period};
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  }
  return undefined;
}

function toDateTime(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // If only date is provided (YYYY-MM-DD), add midnight UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00:00Z`;
  return trimmed;
}

function deriveJobId(url: string): string | undefined {
  const match = String(url).match(/-(\d+)$/);
  return match ? match[1] : undefined;
}

function detectLanguage(text: string): 'fi' | 'en' {
  const sample = text.toLowerCase();
  const finnishHints = ['odotamme', 'tarjoamme', 'työ', 'tyopaikka', 'hakemus', 'edu', 'kokemus', 'ohjelmist', 'tiimi', 'kehitys', 'sinä', 'meillä'];
  if (/[äöå]/.test(sample)) return 'fi';
  if (finnishHints.some((w) => sample.includes(w))) return 'fi';
  return 'en';
}

function isDateTime(value: string): boolean {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value);
}

function applyOverrides(job: CanonicalJob, overrides?: Partial<CanonicalJob>): CanonicalJob {
  if (!overrides) return job;
  const merged: CanonicalJob = {...job};
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (merged as any)[key] = value;
    }
  }
  return merged;
}

// NOTE: This file intentionally keeps extraction heuristics simple and easy to adjust.
