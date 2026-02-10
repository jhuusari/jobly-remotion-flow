import {readFileSync} from 'fs';
import {join} from 'path';
import {validateWithSchema} from '../utils/validate';

export type Bubbles = {
  version: string;
  job_id?: string;
  language?: string;
  offers: Array<{text: string}>;
  expects: Array<{text: string}>;
  constraints: {min_items: number; max_items: number; max_text_len: number};
};

export async function reviewBubbles(jobDir: string, extractedPath: string, bubblesPath: string): Promise<Bubbles> {
  const job = JSON.parse(readFileSync(extractedPath, 'utf8')) as Record<string, unknown>;
  const bubbles = JSON.parse(readFileSync(bubblesPath, 'utf8')) as Bubbles;

  const schemaPath = join(process.cwd(), 'src', 'schemas', 'bubbles.schema.json');
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as Record<string, unknown>;

  const revised = await callLlm(job, bubbles, schema, 'review');
  const cleaned = sanitizeBubbles(revised);

  if (needsRepair(cleaned)) {
    const repaired = await callLlm(job, cleaned, schema, 'repair');
    const repairedClean = sanitizeBubbles(repaired);
    validateWithSchema('bubbles.schema.json', repairedClean);
    return repairedClean;
  }

  validateWithSchema('bubbles.schema.json', cleaned);
  return cleaned;
}

async function callLlm(job: Record<string, unknown>, bubbles: Bubbles, schema: Record<string, unknown>, mode: 'review' | 'repair'): Promise<Bubbles> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY in environment');
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4.1';

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: mode === 'repair'
                ? 'You fix bubble text issues. Each bubble must be a complete, natural phrase that can stand alone. Never end with an unfinished stem or trailing conjunction. If too long, rephrase to a shorter complete phrase.'
                : 'You are a strict editor for short bubble texts in job ads. Improve language quality, fix broken words, remove awkward truncations, and ensure the text is natural and correct. Keep each text within the length limit and in the specified language. Use the job posting for accuracy.'
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: buildPrompt(job, bubbles, mode)
            }
          ]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'bubbles',
          strict: true,
          schema
        }
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${text}`);
  }

  const data = (await response.json()) as any;
  const jsonText = extractJsonText(data);
  if (!jsonText) {
    throw new Error('OpenAI API error: no JSON text found in response');
  }

  return JSON.parse(jsonText) as Bubbles;
}

function buildPrompt(job: Record<string, unknown>, bubbles: Bubbles, mode: 'review' | 'repair'): string {
  const language = (job.language as string | undefined) ?? bubbles.language ?? 'en';
  const maxLen = bubbles.constraints?.max_text_len ?? 32;
  const extra = mode === 'repair'
    ? 'Fix ONLY problematic bubbles; keep good ones as-is.'
    : 'Do NOT cut words. If too long, rephrase instead of truncating.';

  return [
    'Review and improve the bubble texts.',
    `Language: ${language}.`,
    `Keep 3–4 items per section and keep each text <= ${maxLen} characters.`,
    'Aim for 3–6 words per bubble.',
    'Each bubble must be a complete standalone phrase.',
    'Avoid ending with a conjunction or unfinished stem.',
    extra,
    'Do NOT add new claims not supported by the job description.',
    '',
    'Job posting JSON:',
    JSON.stringify(job, null, 2),
    '',
    'Current bubbles JSON:',
    JSON.stringify(bubbles, null, 2)
  ].join('\n');
}

function sanitizeBubbles(bubbles: Bubbles): Bubbles {
  const maxLen = bubbles.constraints?.max_text_len ?? 32;
  return {
    ...bubbles,
    offers: bubbles.offers.map((b) => ({text: sanitizeText(b.text, maxLen)})),
    expects: bubbles.expects.map((b) => ({text: sanitizeText(b.text, maxLen)}))
  };
}

function sanitizeText(text: string, maxLen: number): string {
  const t = (text || '').replace(/\u00ad/g, '').replace(/\s+/g, ' ').trim();
  return t.length > maxLen ? t : t;
}

function needsRepair(bubbles: Bubbles): boolean {
  const maxLen = bubbles.constraints?.max_text_len ?? 32;
  const all = [...bubbles.offers, ...bubbles.expects].map((b) => b.text);
  return all.some((text) => isSuspect(text, maxLen));
}

function isSuspect(text: string, maxLen: number): boolean {
  const t = (text || '').trim();
  if (!t) return true;
  if (t.length >= maxLen - 1) return true; // likely truncated
  if (t.length > maxLen) return true;
  if (/[\-–—]$/.test(t)) return true;
  if (/(\bja|\btai|\bsekä|\bettä|\beli)$/.test(t.toLowerCase())) return true;
  if (/(\bmm\.?|\bym\.?|\besim\.?|\bt\.)$/.test(t.toLowerCase())) return true;
  return false;
}

function extractJsonText(data: any): string | null {
  if (!data) return null;
  if (typeof data.output_text === 'string' && data.output_text.trim().length > 0) {
    return data.output_text;
  }
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (part?.type === 'output_text' && typeof part.text === 'string') return part.text;
      if (part?.type === 'text' && typeof part.text === 'string') return part.text;
      if (typeof part?.text === 'string') return part.text;
    }
  }
  return null;
}
