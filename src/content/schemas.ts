// Compiles the JSON schemas once and turns Ajv's error objects into sentences a story author can act on.
// The schema files are passed in (not imported here) so the same code runs in the app and in the build script.
import Ajv from 'ajv';
import type { ErrorObject, ValidateFunction } from 'ajv';

export type SchemaFiles = Record<string, object>;

export interface Validators {
  story: ValidateFunction;
  scenes: ValidateFunction;
  monsters: ValidateFunction;
  items: ValidateFunction;
  encounters: ValidateFunction;
}

export function createValidators(schemas: SchemaFiles): Validators {
  const ajv = new Ajv({ allErrors: true, discriminator: true, strict: true, strictRequired: false });
  for (const schema of Object.values(schemas)) ajv.addSchema(schema);
  const get = (name: string): ValidateFunction => {
    const validate = ajv.getSchema(`${name}.schema.json`);
    if (!validate) throw new Error(`The schema "${name}.schema.json" is missing from content/schema.`);
    return validate;
  };
  return {
    story: get('story'),
    scenes: get('scenes'),
    monsters: get('monsters'),
    items: get('items'),
    encounters: get('encounters'),
  };
}

function readable(error: ErrorObject): string {
  const params = error.params as Record<string, unknown>;
  switch (error.keyword) {
    case 'additionalProperties':
      return `"${String(params.additionalProperty)}" isn't a known field here`;
    case 'required':
      return `missing the field "${String(params.missingProperty)}"`;
    case 'enum':
      return `must be one of: ${(params.allowedValues as unknown[]).map(String).join(', ')}`;
    case 'const':
      return `must be exactly ${JSON.stringify(params.allowedValue)}`;
    case 'minItems':
      return `needs at least ${String(params.limit)} item(s)`;
    case 'maxItems':
      return `allows at most ${String(params.limit)} item(s)`;
    default:
      return error.message ?? 'is not valid';
  }
}

/** One line per distinct problem, with the path inside the file. */
export function describeSchemaErrors(errors: ErrorObject[] | null | undefined): Array<{ where: string; message: string }> {
  const seen = new Set<string>();
  const lines: Array<{ where: string; message: string }> = [];
  for (const error of errors ?? []) {
    if (error.keyword === 'if') continue;
    const where = error.instancePath === '' ? '(top level)' : error.instancePath;
    const message = readable(error);
    const key = `${where}|${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push({ where, message });
  }
  return lines;
}
