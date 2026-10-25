// Two layers of look, kept apart.
// The binding is the app's own dress (content/themes): colours, typefaces, the surface, how asides are set. It is written
// onto the page as one stylesheet rule plus a few attributes on the root, so every screen that uses the tokens follows it
// with no extra code, and it stays until the reader chooses another.
// A story's palette and type feel (`applyTheme`) sit on top of it while that story is played, as inline variables on the
// root, and come off again afterwards, which puts the binding back. The reader may instead keep their
// binding over every story (the `bindingOverStory` setting, off by default).
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import type { Story, Theme } from '../content/types.ts';
import { luminance } from '../content/integrity.ts';
import { themeCss } from '../content/themes.ts';
import { textScale } from './settings.ts';
import type { TextSize } from './settings.ts';

const VARIABLES = ['--paper', '--ink', '--choice', '--oxblood', '--ink-faded', '--stats-bar', '--combat-log'] as const;
const STYLE_ID = 'pathbound-binding';

let active: Theme | null = null;
let bindingOverStory = false;

/** The reader's rule: keep my binding for every story (true), or let a story dress the page while it is read (false, the default). */
export function setBindingOverStory(on: boolean): void {
  bindingOverStory = on;
}

const STORY_SURFACE = ['--rule', '--oxblood-wet', '--ink-rule', '--margin-rule', '--surface-lit', '--surface-edge', '--surface-trace'] as const;

/** The binding on the page now, or null if none could be applied (the page is then in the fallback, Parchment's values). */
export function currentBinding(): Theme | null {
  return active;
}

/** Dress the page in a binding. Takes effect at once; the choice itself is kept by the caller. */
export function applyBinding(theme: Theme): void {
  const root = document.documentElement;
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.append(style);
  }
  style.textContent = themeCss(theme);
  root.dataset.theme = theme.id;
  root.dataset.surface = theme.surface.kind;
  root.dataset.rule = theme.marks.rule;
  if (theme.marks.glow > 0) root.dataset.glow = '';
  else delete root.dataset.glow;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.colors.paper);
  active = theme;
  setSystemBars(theme.scheme);
}

/** Android's status and navigation icons: dark ones on a light page, light ones on a dark page. Phone only; a failure changes nothing else. */
function setSystemBars(scheme: Theme['scheme']): void {
  if (!Capacitor.isNativePlatform()) return;
  try {
    // The plugin's names are about the page behind the icons: Light is a light page (dark icons).
    SystemBars.setStyle({ style: scheme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined);
  } catch {
    // The icons keep whatever the native config gave them.
  }
}

/**
 * Wait (briefly) for the typefaces a binding asks for, so the first paint in it is already set in them and never flashes
 * a fallback face. Gives up after 1.2 seconds; the page then paints in the fallback stack and corrects itself.
 * With no binding, waits for Parchment's, which are the fallback values in tokens.css.
 */
export async function fontsReady(theme: Theme | null): Promise<void> {
  const wanted = (theme?.fonts.load ?? ['64px "IM Fell French Canon"', '20px "IM Fell English"', 'italic 20px "IM Fell English"']).map((font) => document.fonts.load(font));
  const giveUp = new Promise<void>((resolve) => setTimeout(resolve, 1200));
  await Promise.race([Promise.all(wanted).then(() => undefined), giveUp]);
}

/**
 * Apply a story's palette and type feel while it is played, and put the binding back afterwards. Unless the reader has
 * chosen to keep their binding over every story (Settings), the story's colours win over any binding. The binding's
 * surface washes, glow and rules were drawn for its own paper, so while a story is worn they are quieted to match the
 * story's page rather than left to fight it.
 */
export function applyTheme(story: Story): () => void {
  if (bindingOverStory) return () => undefined;
  const root = document.documentElement;
  const { colors, typefaceFeel } = story.theme;
  const dark = luminance(colors.background) <= 0.179;
  root.style.setProperty('--paper', colors.background);
  root.style.setProperty('--ink', colors.prose);
  root.style.setProperty('--choice', colors.choices);
  root.style.setProperty('--oxblood', colors.accent);
  root.style.setProperty('--stats-bar', colors.statsBar);
  root.style.setProperty('--combat-log', colors.combatLog);
  root.style.setProperty('--ink-faded', `color-mix(in srgb, ${colors.prose} 70%, ${colors.background})`);
  root.style.setProperty('--rule', `color-mix(in srgb, ${colors.prose} 28%, ${colors.background})`);
  root.style.setProperty('--oxblood-wet', `color-mix(in srgb, ${colors.accent} 80%, ${colors.prose})`);
  root.style.setProperty('--ink-rule', colors.accent);
  root.style.setProperty('--margin-rule', colors.accent);
  root.style.setProperty('--surface-lit', `color-mix(in srgb, white ${dark ? 8 : 30}%, transparent)`);
  root.style.setProperty('--surface-edge', `color-mix(in srgb, black ${dark ? 35 : 14}%, transparent)`);
  root.style.setProperty('--surface-trace', 'transparent');
  root.style.colorScheme = dark ? 'dark' : 'light';
  const glowed = 'glow' in root.dataset;
  delete root.dataset.glow;
  // The glade's dapple and lichen are baked dark and green: right on a dark page, dirt on a light one. A story with a
  // light page therefore gets plain paper under it for as long as it is played.
  const surface = root.dataset.surface;
  if (surface === 'glade' && !dark) root.dataset.surface = 'paper';
  root.dataset.feel = typefaceFeel;
  return () => {
    for (const name of VARIABLES) root.style.removeProperty(name);
    for (const name of STORY_SURFACE) root.style.removeProperty(name);
    root.style.removeProperty('color-scheme');
    if (glowed) root.dataset.glow = '';
    if (surface !== undefined) root.dataset.surface = surface;
    delete root.dataset.feel;
  };
}

/** Set how large the reading text and the ruled-line rhythm are. Independent of any story's theme; a binding adds its own allowance on top (--type-scale). */
export function applyTextSize(size: TextSize): void {
  document.documentElement.style.setProperty('--size-scale', String(textScale(size)));
}
