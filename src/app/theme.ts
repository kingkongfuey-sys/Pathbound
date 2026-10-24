// Applies a story's palette and type feel to the page while that story is being read, and puts the base
// parchment back afterwards. Colours are written as CSS variables on the document root, so every screen
// that already uses the tokens picks them up with no extra code.
import type { Story } from '../content/types.ts';

const VARIABLES = ['--paper', '--ink', '--choice', '--oxblood', '--ink-faded', '--stats-bar', '--combat-log'] as const;

export function applyTheme(story: Story): () => void {
  const root = document.documentElement;
  const { colors, typefaceFeel } = story.theme;
  root.style.setProperty('--paper', colors.background);
  root.style.setProperty('--ink', colors.prose);
  root.style.setProperty('--choice', colors.choices);
  root.style.setProperty('--oxblood', colors.accent);
  root.style.setProperty('--stats-bar', colors.statsBar);
  root.style.setProperty('--combat-log', colors.combatLog);
  root.style.setProperty('--ink-faded', `color-mix(in srgb, ${colors.prose} 70%, ${colors.background})`);
  root.dataset.feel = typefaceFeel;
  return () => {
    for (const name of VARIABLES) root.style.removeProperty(name);
    delete root.dataset.feel;
  };
}
