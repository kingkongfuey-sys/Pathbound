// Shared by the validate and selftest scripts: reads the schemas and story folders from disk and runs the same
// validator the app runs at load time (src/content/validate.ts, executed directly by Node's TypeScript stripping).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createValidators } from '../src/content/schemas.ts';
import { validateStory } from '../src/content/validate.ts';
import { declaredFamilies, validateThemes } from '../src/content/themes.ts';

const root = new URL('..', import.meta.url).pathname;
export const storiesDir = join(root, 'content', 'stories');

export const themesDir = join(root, 'content', 'themes');

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

/** Every binding file in content/themes, keyed by file name. */
export function readThemes() {
  const files = {};
  for (const name of readdirSync(themesDir).filter((n) => n.endsWith('.json')).sort()) files[name] = readFileSync(join(themesDir, name), 'utf-8');
  return files;
}

/** The typefaces src/styles/fonts.css bundles, so a binding can't name one the phone doesn't have. */
export function declaredFonts() {
  return declaredFamilies(readFileSync(join(root, 'src', 'styles', 'fonts.css'), 'utf-8'));
}

export { validateStory, validateThemes };
