import {createHash} from 'crypto';
import {mkdirSync, writeFileSync} from 'fs';
import {join} from 'path';

export type JobKeyInput = {
  jobId?: string;
  jobUrl: string;
};

export const artifactsRoot = join(process.cwd(), 'artifacts');

export function makeJobKey(input: JobKeyInput): string {
  if (input.jobId && input.jobId.trim().length > 0) {
    return sanitizeKey(input.jobId);
  }
  const hash = createHash('sha1').update(input.jobUrl).digest('hex').slice(0, 12);
  return `url_${hash}`;
}

export function ensureJobDir(jobKey: string): string {
  const dir = join(artifactsRoot, jobKey);
  mkdirSync(dir, {recursive: true});
  return dir;
}

export function writeJson(path: string, data: unknown): void {
  const pretty = JSON.stringify(data, null, 2);
  writeFileSync(path, pretty, 'utf8');
}

function sanitizeKey(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, '_');
}
