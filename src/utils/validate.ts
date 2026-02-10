import Ajv, {ValidateFunction} from 'ajv';
import addFormats from 'ajv-formats';
import {readFileSync} from 'fs';
import {join} from 'path';

const ajv = new Ajv({allErrors: true, strict: false});
addFormats(ajv);

const cache = new Map<string, ValidateFunction>();

export function validateWithSchema(schemaFile: string, data: unknown): void {
  const validator = getValidator(schemaFile);
  const ok = validator(data);
  if (!ok) {
    const errors = validator.errors ?? [];
    const details = errors.map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim());
    const message = `Schema validation failed for ${schemaFile}: ${details.join('; ')}`;
    throw new Error(message);
  }
}

function getValidator(schemaFile: string): ValidateFunction {
  const existing = cache.get(schemaFile);
  if (existing) return existing;
  const fullPath = join(process.cwd(), 'src', 'schemas', schemaFile);
  const raw = readFileSync(fullPath, 'utf8');
  const schema = JSON.parse(raw) as Record<string, unknown>;
  const compiled = ajv.compile(schema);
  cache.set(schemaFile, compiled);
  return compiled;
}
