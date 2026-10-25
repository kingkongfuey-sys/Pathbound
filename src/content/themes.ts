// Bindings, as data. Pure: no DOM, no storage, so the same code checks them in the app and in `npm run validate`.
// A binding is one file in content/themes. Like a story it is checked in layers: the file parses, it fits
// theme.schema.json, and only then do the cross-file rules run (ids, the one default, readable colours, typefaces that
// are really bundled). `themeCss` turns a checked binding into the one stylesheet rule the app swaps in.
import { contrastRatio, luminance } from './integrity.ts';
import { describeSchemaErrors } from './schemas.ts';
import type { ContentProblem, Theme, Wash } from './types.ts';

/** Raw binding files keyed by file name ("parchment.json"). */
export type RawThemes = Record<string, string>;

export interface ThemeCheck {
  problems: ContentProblem[];
  /** In listing order. Empty whenever there is any problem: a half-trusted binding is never offered. */
  themes: Theme[];
}

/** Any function that says whether data fits the theme schema and keeps its `errors` (Ajv's ValidateFunction does). */
type SchemaCheck = ((data: unknown) => boolean) & { errors?: Parameters<typeof describeSchemaErrors>[0] };

/** Readable roles and the least contrast each needs against the paper. Accent also carries error text and low HP, so it needs the text figure. */
const READABLE: Array<{ role: 'ink' | 'inkFaded' | 'accent' | 'accentWet' | 'choices' | 'statsBar' | 'combatLog'; least: number }> = [
  { role: 'ink', least: 4.5 },
  { role: 'inkFaded', least: 4.5 },
  { role: 'accent', least: 4.5 },
  { role: 'accentWet', least: 4.5 },
  { role: 'choices', least: 4.5 },
  { role: 'statsBar', least: 4.5 },
  { role: 'combatLog', least: 4.5 },
];

/** The ruled lines are decoration, but they have to be seen: this much against the paper, and no less. */
const RULE_LEAST = 1.3;

/** A rule drawn in colour on the surface (the margin rule, the rule under titles) has to be seen as a line: this much against the paper. */
const MARK_LEAST = 3;

/** Where black and white text are equally readable. A paper above this is light, below it dark. */
const LIGHT_ABOVE = 0.179;

/** The typefaces a stack or a font shorthand names in quotes ("64px \"Tektur\"" gives Tektur). */
function quotedFamilies(text: string): string[] {
  return [...text.matchAll(/"([^"]+)"|'([^']+)'/g)].map((m) => m[1] ?? m[2] ?? '');
}

/** The first family of a stack, quoted or bare: the one the binding actually depends on being there. */
function firstFamily(stack: string): string {
  const first = stack.split(',')[0]?.trim() ?? '';
  return first.replace(/^['"]|['"]$/g, '');
}

/** Every family a stylesheet declares with @font-face (pass fonts.css's text). */
export function declaredFamilies(fontsCss: string): string[] {
  return [...fontsCss.matchAll(/@font-face\s*\{[^}]*?font-family:\s*['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');
}

/**
 * Parse and check every binding. `declared` is the list of typefaces fonts.css bundles; leave it out where that file
 * can't be read (the app itself) and the typeface rule is skipped.
 */
export function validateThemes(files: RawThemes, check: SchemaCheck, declared?: readonly string[]): ThemeCheck {
  const problems: ContentProblem[] = [];
  const found: Array<{ file: string; theme: Theme }> = [];
  const names = Object.keys(files).filter((name) => name.endsWith('.json')).sort();

  for (const name of names) {
    const file = `themes/${name}`;
    let data: unknown;
    try {
      data = JSON.parse(files[name] ?? '');
    } catch (error) {
      problems.push({ file, where: '(file)', message: `isn't valid JSON: ${error instanceof Error ? error.message : String(error)}` });
      continue;
    }
    if (!check(data)) {
      for (const line of describeSchemaErrors(check.errors)) problems.push({ file, ...line });
      continue;
    }
    found.push({ file, theme: data as Theme });
  }
  if (names.length === 0) problems.push({ file: 'themes/', where: '(folder)', message: 'no binding files found' });

  const add = (file: string, where: string, message: string): void => {
    problems.push({ file, where, message });
  };
  const seenId = new Map<string, string>();
  const seenOrder = new Map<number, string>();
  const seenName = new Map<string, string>();
  const defaults: string[] = [];

  for (const { file, theme } of found) {
    const stem = file.slice('themes/'.length, -'.json'.length);
    if (theme.id !== stem) add(file, 'id', `the id "${theme.id}" must match the file name "${stem}"`);
    if (seenId.has(theme.id)) add(file, 'id', `the id "${theme.id}" is already used by ${seenId.get(theme.id)}`);
    seenId.set(theme.id, file);
    const otherOrder = seenOrder.get(theme.order);
    if (otherOrder) add(file, 'order', `order ${theme.order} is already taken by ${otherOrder}`);
    seenOrder.set(theme.order, file);
    const lower = theme.name.toLowerCase();
    if (seenName.has(lower)) add(file, 'name', `the name "${theme.name}" is already used by ${seenName.get(lower)}`);
    seenName.set(lower, file);
    if (theme.default) defaults.push(file);

    const { colors } = theme;
    for (const { role, least } of READABLE) {
      const colour = colors[role];
      if (colour === undefined) continue;
      const ratio = contrastRatio(colour, colors.paper);
      if (ratio < least) add(file, `colors.${role}`, `contrast against the paper is ${ratio.toFixed(1)} to 1; it needs at least ${least} to 1 to be readable`);
    }
    // The paper is not flat: the lit wash brightens it (a lamp, a shaft of light). Text has to stay readable where it is lit most,
    // not just on the bare paper, or a binding could pass here and be hard to read in the one corner everyone looks at.
    const lit = blendedOver(colors.paper, theme.surface.lit);
    for (const { role, least } of READABLE) {
      const colour = colors[role];
      if (colour === undefined) continue;
      const ratio = contrastRatio(colour, lit);
      if (ratio < least) add(file, `colors.${role}`, `contrast where the surface is lit most (${lit}) is ${ratio.toFixed(1)} to 1; it needs at least ${least} to 1`);
    }
    const ruleRatio = contrastRatio(colors.rule, colors.paper);
    if (ruleRatio < RULE_LEAST) add(file, 'colors.rule', `contrast against the paper is ${ruleRatio.toFixed(2)} to 1; the ruled lines need at least ${RULE_LEAST} to 1 to be seen`);
    if (colors.inkRule !== undefined && contrastRatio(colors.inkRule, colors.paper) < MARK_LEAST) {
      add(file, 'colors.inkRule', `the rule under every title needs at least ${MARK_LEAST} to 1 against the paper`);
    }
    if (colors.marginRule !== undefined && contrastRatio(colors.marginRule, colors.paper) < MARK_LEAST) {
      add(file, 'colors.marginRule', `the margin rule needs at least ${MARK_LEAST} to 1 against the paper to be seen as a line`);
    }
    const light = luminance(colors.paper) > LIGHT_ABOVE;
    if (light !== (theme.scheme === 'light')) {
      add(file, 'scheme', `the paper is ${light ? 'light' : 'dark'}, so the scheme must be "${light ? 'light' : 'dark'}" (it decides the system bar icons and form controls)`);
    }

    if (declared) {
      for (const slot of ['display', 'text'] as const) {
        const family = firstFamily(theme.fonts[slot]);
        if (!declared.includes(family)) add(file, `fonts.${slot}`, `"${family}" is not declared in src/styles/fonts.css, so the phone would never have it`);
      }
      theme.fonts.load.forEach((entry, i) => {
        const families = quotedFamilies(entry);
        if (families.length === 0) add(file, `fonts.load[${i}]`, 'must name a typeface in quotes, like 20px "Name"');
        for (const family of families) {
          if (!declared.includes(family)) add(file, `fonts.load[${i}]`, `"${family}" is not declared in src/styles/fonts.css`);
        }
      });
    }
  }

  if (found.length > 0) {
    if (defaults.length === 0) add('themes/', '(folder)', 'no binding is marked "default": true; one has to be, for a book that has chosen nothing');
    if (defaults.length > 1) add('themes/', '(folder)', `only one binding may be the default; ${defaults.join(' and ')} all claim it`);
  }

  if (problems.length > 0) return { problems, themes: [] };
  const themes = found.map((f) => f.theme).sort((a, b) => a.order - b.order);
  return { problems, themes };
}

/** The binding a book falls back on: the one marked default. */
export function defaultTheme(themes: readonly Theme[]): Theme | undefined {
  return themes.find((t) => t.default === true);
}

/** A binding by id, or the default when the id isn't one this build has. */
export function themeFor(themes: readonly Theme[], id: string): Theme | undefined {
  return themes.find((t) => t.id === id) ?? defaultTheme(themes);
}

function channel(hex: string, start: number): number {
  return parseInt(hex.slice(start, start + 2), 16);
}

/** A wash laid over a colour at its full strength, as a hex colour: what the surface looks like where it is brightest. */
export function blendedOver(base: string, wash: Wash): string {
  const mixed = [1, 3, 5].map((start) => Math.round(channel(base, start) * (1 - wash.alpha) + channel(wash.color, start) * wash.alpha));
  return `#${mixed.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A wash as a CSS colour: `rgba(92, 64, 24, 0.34)`. Written out rather than as hex with alpha, and in the comma form
 * the stylesheet always used: the browser rounds that form's alpha to eight bits, the space form it doesn't, and
 * Parchment's surface was tuned against the rounded one (the two differ by up to two levels at the lit centre).
 */
export function washCss(wash: Wash): string {
  return `rgba(${channel(wash.color, 1)}, ${channel(wash.color, 3)}, ${channel(wash.color, 5)}, ${wash.alpha})`;
}

/**
 * The one rule that dresses the book in a binding. Everything a screen reads is a variable set here, so no screen
 * knows which binding is on. The selector carries the id so it outranks the fallback values in tokens.css whatever
 * order the stylesheets arrive in.
 */
export function themeCss(theme: Theme): string {
  const { colors, fonts, type, surface, marks } = theme;
  const lines: string[] = [
    `--paper: ${colors.paper};`,
    `--ink: ${colors.ink};`,
    `--ink-faded: ${colors.inkFaded};`,
    `--rule: ${colors.rule};`,
    `--oxblood: ${colors.accent};`,
    `--oxblood-wet: ${colors.accentWet};`,
  ];
  if (colors.choices) lines.push(`--choice: ${colors.choices};`);
  if (colors.statsBar) lines.push(`--stats-bar: ${colors.statsBar};`);
  if (colors.combatLog) lines.push(`--combat-log: ${colors.combatLog};`);
  if (colors.inkRule) lines.push(`--ink-rule: ${colors.inkRule};`);
  if (colors.marginRule) lines.push(`--margin-rule: ${colors.marginRule};`);
  if (type.figures) lines.push(`--figures: ${type.figures === 'lining' ? 'lining-nums' : 'oldstyle-nums'};`);
  lines.push(
    `--font-display: ${fonts.display};`,
    `--font-text: ${fonts.text};`,
    `--emph: ${type.emphasis};`,
    `--type-scale: ${type.scale};`,
    `--display-scale: ${type.displayScale};`,
    `--surface-lit: ${washCss(surface.lit)};`,
    `--surface-edge: ${washCss(surface.edge)};`,
    `--leader: ${marks.leader};`,
    `--glow: ${marks.glow};`,
    `--underline: ${marks.underline}%;`,
    `color-scheme: ${theme.scheme};`,
  );
  if (surface.trace) lines.push(`--surface-trace: ${washCss(surface.trace)};`);
  return `:root[data-theme='${theme.id}'] {\n  ${lines.join('\n  ')}\n}\n`;
}
