import {load} from 'cheerio';

export async function discoverCompanySite(jobHtmlPath: string): Promise<string | undefined> {
  const fs = await import('fs');
  const html = fs.readFileSync(jobHtmlPath, 'utf8');
  const $ = load(html);

  const sameAs = extractJsonLdSameAs($);
  if (sameAs && isLikelyCompanySite(sameAs)) return sameAs;

  const companyProfileUrl = $('a[href*="/yritys/"]').first().attr('href');
  if (!companyProfileUrl) return undefined;

  const absolute = new URL(companyProfileUrl, 'https://www.jobly.fi').toString();
  try {
    const res = await fetch(absolute, {headers: {'user-agent': 'remotion-flow/0.1 (company site)'}});
    if (!res.ok) return undefined;
    const profileHtml = await res.text();
    const $$ = load(profileHtml);

    const homepageField = $$('.field--name-field-company-homepage a[href^="http"]').first().attr('href');
    if (homepageField && isLikelyCompanySite(homepageField)) return homepageField;

    const external = $$('a[href^="http"]')
      .map((_, el) => $$(el).attr('href') || '')
      .get()
      .filter((href) => href && !href.includes('jobly.fi'));

    const site = external.find((href) => isLikelyCompanySite(href));
    return site;
  } catch {
    return undefined;
  }
}

function extractJsonLdSameAs($: ReturnType<typeof load>): string | undefined {
  const scripts = $('script[type="application/ld+json"]');
  if (!scripts || scripts.length === 0) return undefined;

  for (const el of scripts.toArray()) {
    const raw = $(el).text();
    if (!raw) continue;
    const parsed = safeJsonParse(raw);
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of candidates) {
      if (!item || typeof item !== 'object') continue;
      const type = String((item as any)['@type'] ?? '');
      if (type !== 'JobPosting') continue;
      const hiringOrg = (item as any).hiringOrganization ?? {};
      const sameAs = hiringOrg.sameAs;
      if (typeof sameAs === 'string' && sameAs.startsWith('http')) return sameAs;
    }
  }

  return undefined;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isLikelyCompanySite(href: string): boolean {
  if (!href.startsWith('http')) return false;
  const badHosts = ['linkedin.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'youtube.com'];
  if (href.includes('jobly.fi')) return false;
  return !badHosts.some((h) => href.includes(h));
}
