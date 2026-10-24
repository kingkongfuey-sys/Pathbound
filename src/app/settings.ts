// House rules, as data. Pure: no storage and no DOM, so the rules for reading a stored setting back can be tested.
// The book keeps settings as plain text under a key; reading them back never trusts them, so a value that is missing
// or that this build doesn't know falls back to its default instead of breaking the page. Stage 8 adds its hidden
// switch here.

export type TypewriterSpeed = 'slow' | 'steady' | 'quick' | 'instant';

export interface Settings {
  typewriter: TypewriterSpeed;
}

/** Slowest to fastest, which is also the order they are listed in. */
export const SPEEDS: readonly TypewriterSpeed[] = ['slow', 'steady', 'quick', 'instant'];

const CHARACTERS_PER_SECOND: Record<TypewriterSpeed, number> = { slow: 35, steady: 70, quick: 140, instant: 0 };

export const DEFAULT_SETTINGS: Settings = { typewriter: 'steady' };

/** Characters written per second; zero means the whole page at once. */
export function speedCps(speed: TypewriterSpeed): number {
  return CHARACTERS_PER_SECOND[speed];
}

export function settingsFrom(stored: Record<string, string>): Settings {
  const speed = SPEEDS.find((s) => s === stored['typewriter']);
  return { typewriter: speed ?? DEFAULT_SETTINGS.typewriter };
}
