// Settings, as data. Pure: no storage and no DOM, so the rules for reading a stored setting back can be tested.
// The book keeps settings as plain text under a key; reading them back never trusts them, so a value that is missing
// or that this build doesn't know falls back to its default instead of breaking the page. The binding (the app's look)
// is kept as its id, and which ids exist is data (content/themes), so the caller says which ones this build knows.
// Dev mode's hidden switch and its two toggles are here too; they are stored like any other rule but are inert while
// the switch is off.

export type TypewriterSpeed = 'slow' | 'steady' | 'quick' | 'instant';

export type TextSize = 'small' | 'standard' | 'large' | 'largest';

export interface Settings {
  typewriter: TypewriterSpeed;
  textSize: TextSize;
  /** The id of the binding in use (a file in content/themes). A book that has never chosen one reads as Parchment. */
  theme: string;
  /** When on, the reader's binding is kept for every story and no story's own palette is shown. Off by default: a story dresses the page while it is read. */
  bindingOverStory: boolean;
  /** The hidden switch. Everything below it does nothing while this is off. */
  dev: boolean;
  /** Dev: the hero loses no HP. */
  god: boolean;
  /** Dev: scenes show their choices and keep their prose behind a tap. */
  skipText: boolean;
}

/** Slowest to fastest, which is also the order they are listed in. */
export const SPEEDS: readonly TypewriterSpeed[] = ['slow', 'steady', 'quick', 'instant'];

const CHARACTERS_PER_SECOND: Record<TypewriterSpeed, number> = { slow: 35, steady: 70, quick: 140, instant: 0 };

export const TEXT_SIZES: readonly TextSize[] = ['small', 'standard', 'large', 'largest'];

const TEXT_SCALE: Record<TextSize, number> = { small: 0.9, standard: 1, large: 1.15, largest: 1.3 };

/** What the reading sizes and the line rhythm are multiplied by. */
export function textScale(size: TextSize): number {
  return TEXT_SCALE[size];
}

/** The binding every book starts with, and falls back to: the app's original look. content/themes marks the same one "default". */
export const DEFAULT_THEME_ID = 'parchment';

const THEME_ID_FORM = /^[a-z][a-z0-9-]{1,47}$/;

export const DEFAULT_SETTINGS: Settings = { typewriter: 'steady', textSize: 'standard', theme: DEFAULT_THEME_ID, bindingOverStory: false, dev: false, god: false, skipText: false };

/** Characters written per second; zero means the whole page at once. */
export function speedCps(speed: TypewriterSpeed): number {
  return CHARACTERS_PER_SECOND[speed];
}

/**
 * `themeIds` is every binding this build has. Say it, and a stored binding that isn't among them falls back to the
 * default; leave it out and any well-formed id is kept (for tests of the other settings).
 */
export function settingsFrom(stored: Record<string, string>, themeIds?: readonly string[]): Settings {
  const speed = SPEEDS.find((s) => s === stored['typewriter']);
  const size = TEXT_SIZES.find((s) => s === stored['textSize']);
  const theme = stored['theme'] ?? '';
  const knownTheme = themeIds ? themeIds.includes(theme) : THEME_ID_FORM.test(theme);
  return {
    typewriter: speed ?? DEFAULT_SETTINGS.typewriter,
    textSize: size ?? DEFAULT_SETTINGS.textSize,
    theme: knownTheme ? theme : DEFAULT_SETTINGS.theme,
    bindingOverStory: stored['bindingOverStory'] === 'on',
    dev: stored['dev'] === 'on',
    god: stored['god'] === 'on',
    skipText: stored['skipText'] === 'on',
  };
}

/** How a setting is written down: switches as on/off, everything else as its own name. */
export function settingText(value: string | boolean): string {
  return typeof value === 'boolean' ? (value ? 'on' : 'off') : value;
}

/** What the loop is told about dev mode. Nothing at all unless the hidden switch is on. */
export function devEffective(settings: Settings): { god: boolean; skipText: boolean } {
  return { god: settings.dev && settings.god, skipText: settings.dev && settings.skipText };
}
