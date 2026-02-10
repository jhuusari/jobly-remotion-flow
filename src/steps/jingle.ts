import {existsSync, readdirSync} from 'fs';
import {join} from 'path';

const JINGLE_DIR = join(process.cwd(), 'jingles');

export function pickRandomJingle(): string | undefined {
  if (!existsSync(JINGLE_DIR)) return undefined;
  const files = readdirSync(JINGLE_DIR)
    .filter((f) => /\.(mp3|wav|m4a|aac|ogg)$/i.test(f));
  if (files.length === 0) return undefined;
  const idx = Math.floor(Math.random() * files.length);
  return join(JINGLE_DIR, files[idx]);
}
