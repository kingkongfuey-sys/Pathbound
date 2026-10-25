// The app's door to its bindings (content/themes). They are bundled as raw text and read once, through the same
// checks as `npm run validate` (minus the typeface rule, which needs fonts.css and was settled at build). If any
// binding is wrong the app offers none of them and runs on the fallback values in tokens.css, which are Parchment's own,
// so a broken binding file costs the reader a choice, never a page.
import { createThemeValidator } from '../content/schemas.ts';
import type { SchemaFiles } from '../content/schemas.ts';
import { defaultTheme, themeFor, validateThemes } from '../content/themes.ts';
import type { ContentProblem, Theme } from '../content/types.ts';

const schemaModules = import.meta.glob('../../content/schema/*.json', { eager: true, import: 'default' }) as SchemaFiles;
const themeFiles = import.meta.glob('/content/themes/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface Bindings {
  /** In listing order; empty if anything was wrong. */
  themes: Theme[];
  problems: ContentProblem[];
}

let read: Bindings | null = null;

/** Every binding this build has, checked. Read once. */
export function bindings(): Bindings {
  if (!read) {
    const files: Record<string, string> = {};
    for (const [path, text] of Object.entries(themeFiles)) files[path.slice(path.lastIndexOf('/') + 1)] = text;
    read = validateThemes(files, createThemeValidator(schemaModules));
  }
  return read;
}

export function bindingIds(): string[] {
  return bindings().themes.map((t) => t.id);
}

/** The binding with this id, or the default one; undefined only when there are no usable bindings at all. */
export function bindingFor(id: string): Theme | undefined {
  return themeFor(bindings().themes, id);
}

export function fallbackBinding(): Theme | undefined {
  return defaultTheme(bindings().themes);
}
