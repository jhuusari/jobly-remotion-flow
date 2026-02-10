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

export async function generateBubbles(jobDir: string, extractedPath: string): Promise<Bubbles> {
  const rawJob = readFileSync(extractedPath, 'utf8');
  const job = JSON.parse(rawJob) as Record<string, unknown>;

  const schemaPath = join(process.cwd(), 'src', 'schemas', 'bubbles.schema.json');
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as Record<string, unknown>;

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
              text:
                'You generate short, punchy bubble texts for a job ad video. Return ONLY JSON that matches the provided schema. Keep items concise, concrete, and easy to read. Use the job posting language. Avoid duplicate or overly similar bubbles.'
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: buildPrompt(job)
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

  const bubbles = JSON.parse(jsonText) as Bubbles;
  validateWithSchema('bubbles.schema.json', bubbles);
  return bubbles;
}

function buildPrompt(job: Record<string, unknown>): string {
  const description = String(job.description ?? '');
  const maxLen = computeMaxLen(description);
  const constraints = {
    min_items: 3,
    max_items: 4,
    max_text_len: maxLen
  };

  const language = (job.language as string | undefined) ?? 'en';

  return [
    'Create two short lists of bubble texts for a job ad video.',
    'Section A: "offers" (what the job offers).',
    'Section B: "expects" (what the job expects).',
    `Use 3–4 items per section, each <= ${constraints.max_text_len} characters.`,
    'Aim for 3–6 words per bubble.',
    'Do NOT cut words. If too long, rephrase instead of truncating.',
    `Language: ${language}. All bubble text must be in this language.`,
    'Return ONLY JSON matching the schema.',
    '',
    'Job posting JSON:',
    JSON.stringify(job, null, 2),
    '',
    'Constraints JSON:',
    JSON.stringify(constraints)
  ].join('\n');
}

function computeMaxLen(description: string): number {
  const len = description.length;
  if (len > 2000) return 64;
  if (len > 1200) return 56;
  if (len > 600) return 48;
  return 40;
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
