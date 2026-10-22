// Shared by the validate and selftest scripts: reads the schemas and story folders from disk and runs the same
// validator the app runs at load time (src/content/validate.ts, executed directly by Node's TypeScript stripping).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createValidators } from '../src/content/schemas.ts';
import { validateStory } from '../src/content/validate.ts';

const root = new URL('..', import.meta.url).pathname;
export const storiesDir = join(root, 'content', 'stories');

export function readSchemas() {
  const dir = join(root, 'content', 'schema');
  const schemas = {};
  for (const name of readdirSync(dir)) schemas[name] = JSON.parse(readFileSync(join(dir, name), 'utf-8'));
  return schemas;
}

export function makeValidators() {
  return createValidators(readSchemas());
}

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else if (name.endsWith('.json')) files.push(path);
  }
  return files;
}

/** Read every story folder into { folder, files } where files is keyed by path inside the folder. */
export function readStories() {
  return readdirSync(storiesDir)
    .filter((name) => statSync(join(storiesDir, name)).isDirectory())
    .map((folder) => {
      const base = join(storiesDir, folder);
      const files = {};
      for (const path of walk(base)) files[relative(base, path).split('\\').join('/')] = readFileSync(path, 'utf-8');
      return { folder, files };
    });
}

export { validateStory };
