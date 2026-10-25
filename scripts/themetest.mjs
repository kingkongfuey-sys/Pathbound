// Self-test for bindings (content/themes): the shipped ones pass, the validator catches every kind of broken one, the
// stylesheet rule is what the page expects, Parchment still equals the fallback values in tokens.css, the typefaces are
// really bundled, and the setting that records the choice reads back safely. Run with `npm run selftest`.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { declaredFonts, makeValidators, readThemes, validateThemes } from './content.mjs';
import { voiceProblems } from './voice.mjs';
import { DEFAULT_SETTINGS, DEFAULT_THEME_ID, settingsFrom } from '../src/app/settings.ts';
import { blendedOver, defaultTheme, themeCss, themeFor, washCss } from '../src/content/themes.ts';

const root = new URL('..', import.meta.url).pathname;
const check = makeValidators().theme;
const declared = declaredFonts();
const shipped = readThemes();

let failures = 0;
function ok(name, pass, detail = '') {
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${pass || !detail ? '' : `  (${detail})`}`);
  if (!pass) failures += 1;
}

/** Copy the shipped bindings, let `edit` change the parsed files (by file name), and validate the result. */
function variant(edit) {
  const files = { ...shipped };
  edit({
    get: (name) => JSON.parse(files[name]),
    set: (name, data) => { files[name] = JSON.stringify(data); },
    files,
  });
  return validateThemes(files, check, declared);
}
function catches(name, needle, edit) {
  const { problems, themes } = variant(edit);
  const hit = problems.find((p) => `${p.where} ${p.message}`.includes(needle));
  ok(`validator catches: ${name}`, themes.length === 0 && Boolean(hit), `wanted "${needle}", got ${JSON.stringify(problems.map((p) => p.message))}`);
}

// ---------------- the shipped bindings ----------------
const real = validateThemes(shipped, check, declared);
ok('shipped bindings pass every check', real.problems.length === 0, JSON.stringify(real.problems));
ok('listing order is Parchment, Cyberpunk, then Greenwood', real.themes.map((t) => t.name).join(',') === 'Parchment,Cyberpunk,Greenwood');
ok('the default binding is the one settings.ts defaults to', defaultTheme(real.themes)?.id === DEFAULT_THEME_ID && DEFAULT_SETTINGS.theme === DEFAULT_THEME_ID);
ok('an unknown id falls back to the default binding', themeFor(real.themes, 'no-such-binding')?.id === DEFAULT_THEME_ID && themeFor(real.themes, 'cyberpunk')?.id === 'cyberpunk');
ok('no binding carries a storyStyling flag any more: the reader\'s own setting decides', real.themes.every((t) => !('storyStyling' in t)) && DEFAULT_SETTINGS.bindingOverStory === false && settingsFrom({ bindingOverStory: 'on' }).bindingOverStory === true && settingsFrom({ bindingOverStory: 'yes' }).bindingOverStory === false);
ok('every binding\'s name and note keep to the voice rules', voiceProblems(real.themes.flatMap((t) => [t.name, t.note])).length === 0);

// ---------------- Parchment is still the base ----------------
const tokens = readFileSync(join(root, 'src/styles/tokens.css'), 'utf-8');
const tokenOf = (name) => new RegExp(`${name}:\\s*([^;]+);`).exec(tokens)?.[1]?.trim();
const parchment = real.themes.find((t) => t.id === 'parchment');
ok('Parchment\'s colours equal the fallback values in tokens.css', parchment !== undefined
  && tokenOf('--paper') === parchment.colors.paper && tokenOf('--ink') === parchment.colors.ink && tokenOf('--ink-faded') === parchment.colors.inkFaded
  && tokenOf('--rule') === parchment.colors.rule && tokenOf('--oxblood') === parchment.colors.accent && tokenOf('--oxblood-wet') === parchment.colors.accentWet);
ok('Parchment\'s type, surface and marks equal the fallbacks too', parchment !== undefined
  && tokenOf('--font-display') === parchment.fonts.display && tokenOf('--font-text') === parchment.fonts.text && tokenOf('--emph') === parchment.type.emphasis
  && tokenOf('--display-scale') === String(parchment.type.displayScale) && tokenOf('--type-scale') === String(parchment.type.scale)
  && tokenOf('--surface-lit') === washCss(parchment.surface.lit) && tokenOf('--surface-edge') === washCss(parchment.surface.edge)
  && tokenOf('--leader') === parchment.marks.leader && tokenOf('--glow') === String(parchment.marks.glow) && tokenOf('--underline') === `${parchment.marks.underline}%`);

// ---------------- the stylesheet rule ----------------
const css = Object.fromEntries(real.themes.map((t) => [t.id, themeCss(t)]));
ok('the rule is scoped by id and carries the scheme', css.cyberpunk.startsWith(":root[data-theme='cyberpunk'] {") && css.cyberpunk.includes('color-scheme: dark;') && css.parchment.includes('color-scheme: light;'));
ok('optional colours are written only when a binding sets them', css.cyberpunk.includes('--choice: #4be8f5;') && css.cyberpunk.includes('--ink-rule: #ff2e88;') && !css.parchment.includes('--choice') && !css.parchment.includes('--ink-rule') && !css.parchment.includes('--surface-trace'));
ok('a screen surface carries its scanline trace', css.cyberpunk.includes('--surface-trace: rgba(75, 232, 245, 0.04);'));
ok('a wash is written in the comma form the stylesheet always used', washCss({ color: '#5c4018', alpha: 0.34 }) === 'rgba(92, 64, 24, 0.34)');

// ---------------- typefaces ----------------
const fontsCss = readFileSync(join(root, 'src/styles/fonts.css'), 'utf-8');
ok('every bundled typeface the bindings name is declared', ['IM Fell French Canon', 'IM Fell English', 'Tektur', 'Jura', 'Almendra', 'Alegreya'].every((f) => declared.includes(f)));
const local = [...fontsCss.matchAll(/url\('\.\.\/(assets\/fonts\/[^']+)'\)/g)].map((m) => m[1]);
const licences = ['Jura-OFL.txt', 'Tektur-OFL.txt', 'Almendra-OFL.txt', 'Alegreya-OFL.txt'];
ok('every typeface file kept in the repo exists (5 files for 4 families), with its licence beside it', local.length === 5 && local.every((f) => existsSync(join(root, 'src', f))) && licences.every((f) => existsSync(join(root, 'src/assets/fonts', f))), `${local.length} declared`);
ok('every file in src/assets/fonts is declared (nothing bundled and never used)', readdirSync(join(root, 'src/assets/fonts')).filter((f) => !f.endsWith('.txt')).every((f) => local.includes(`assets/fonts/${f}`)));

// ---------------- Greenwood: what the new surface, rule and margin colour ask of the validator ----------------
const greenwood = real.themes.find((t) => t.id === 'greenwood');
ok('Greenwood is a dark glade with a vine rule and its own margin colour', greenwood !== undefined && greenwood.scheme === 'dark' && greenwood.surface.kind === 'glade' && greenwood.marks.rule === 'vine' && greenwood.colors.marginRule !== undefined);
ok('a glade carries its fireflies as the trace, like a screen carries its scanlines', css.greenwood.includes('--surface-trace: rgba(242, 229, 139, 0.55);') && css.greenwood.includes('--margin-rule: #4c7f58;') && !css.cyberpunk.includes('--margin-rule') && !css.parchment.includes('--margin-rule'));
ok('figures: Greenwood asks for lining ones, the others leave the face its own', css.greenwood.includes('--figures: lining-nums;') && !css.parchment.includes('--figures') && !css.cyberpunk.includes('--figures') && tokenOf('--figures') === 'normal');
ok('blendedOver gives the colour where a wash is brightest', blendedOver('#000000', { color: '#ffffff', alpha: 0.5 }) === '#808080' && blendedOver('#0e1812', { color: '#d6eaa8', alpha: 0 }) === '#0e1812');

// ---------------- the validator catches broken bindings ----------------
catches('a file that is not JSON', "isn't valid JSON", (a) => { a.files['cyberpunk.json'] = '{ nope'; });
catches('a field the schema does not know', "isn't a known field", (a) => { const d = a.get('cyberpunk.json'); d.sparkle = true; a.set('cyberpunk.json', d); });
catches('a missing field', 'missing the field "marks"', (a) => { const d = a.get('cyberpunk.json'); delete d.marks; a.set('cyberpunk.json', d); });
catches('an id that does not match the file name', 'must match the file name', (a) => { const d = a.get('cyberpunk.json'); d.id = 'neon'; a.set('cyberpunk.json', d); });
catches('two bindings claiming the default', 'only one binding may be the default', (a) => { const d = a.get('cyberpunk.json'); d.default = true; a.set('cyberpunk.json', d); });
catches('no default at all', 'no binding is marked', (a) => { const d = a.get('parchment.json'); delete d.default; a.set('parchment.json', d); });
catches('a repeated order', 'is already taken', (a) => { const d = a.get('cyberpunk.json'); d.order = 1; a.set('cyberpunk.json', d); });
catches('a repeated name', 'is already used', (a) => { const d = a.get('cyberpunk.json'); d.name = 'parchment'; a.set('cyberpunk.json', d); });
catches('text too faint against the paper', 'colors.inkFaded', (a) => { const d = a.get('cyberpunk.json'); d.colors.inkFaded = '#1a1930'; a.set('cyberpunk.json', d); });
catches('an accent that cannot carry error text', 'colors.accent', (a) => { const d = a.get('cyberpunk.json'); d.colors.accent = '#2a1a40'; a.set('cyberpunk.json', d); });
catches('ruled lines that vanish', 'the ruled lines need', (a) => { const d = a.get('cyberpunk.json'); d.colors.rule = '#0c0b15'; a.set('cyberpunk.json', d); });
catches('a scheme that disagrees with the paper', 'the scheme must be', (a) => { const d = a.get('cyberpunk.json'); d.scheme = 'light'; a.set('cyberpunk.json', d); });
catches('a typeface that is not bundled', 'is not declared in src/styles/fonts.css', (a) => { const d = a.get('cyberpunk.json'); d.fonts.text = "'Orbitron', sans-serif"; a.set('cyberpunk.json', d); });
catches('a load entry naming no typeface', 'must name a typeface', (a) => { const d = a.get('cyberpunk.json'); d.fonts.load = ['20px sans-serif']; a.set('cyberpunk.json', d); });
catches('a screen surface with no trace', 'missing the field "trace"', (a) => { const d = a.get('cyberpunk.json'); delete d.surface.trace; a.set('cyberpunk.json', d); });
catches('a paper surface with a trace it would never use', 'isn\'t allowed here', (a) => { const d = a.get('parchment.json'); d.surface.trace = { color: '#000000', alpha: 0.1 }; a.set('parchment.json', d); });
catches('a type scale outside what the layout allows', 'must be', (a) => { const d = a.get('cyberpunk.json'); d.type.scale = 2; a.set('cyberpunk.json', d); });
catches('a hex colour that is not six digits', 'must match', (a) => { const d = a.get('cyberpunk.json'); d.colors.accent = '#f08'; a.set('cyberpunk.json', d); });
catches('a figures setting that does not exist', 'must be', (a) => { const d = a.get('greenwood.json'); d.type.figures = 'tabular'; a.set('greenwood.json', d); });
catches('a margin rule too faint to be seen as a line', 'colors.marginRule', (a) => { const d = a.get('greenwood.json'); d.colors.marginRule = '#14231b'; a.set('greenwood.json', d); });
catches('a glade with no fireflies', 'missing the field \"trace\"', (a) => { const d = a.get('greenwood.json'); delete d.surface.trace; a.set('greenwood.json', d); });
catches('a lit wash so bright the text is lost in it', 'where the surface is lit most', (a) => { const d = a.get('greenwood.json'); d.surface.lit = { color: '#ffffff', alpha: 0.9 }; a.set('greenwood.json', d); });
catches('a surface kind that does not exist', 'must be', (a) => { const d = a.get('greenwood.json'); d.surface.kind = 'moss'; a.set('greenwood.json', d); });
catches('a rule kind that does not exist', 'must be', (a) => { const d = a.get('greenwood.json'); d.marks.rule = 'ivy'; a.set('greenwood.json', d); });
catches('Greenwood naming a typeface that is not bundled', 'is not declared in src/styles/fonts.css', (a) => { const d = a.get('greenwood.json'); d.fonts.display = "'Uncial Antiqua', serif"; a.set('greenwood.json', d); });
ok('validator catches: no binding files at all', validateThemes({}, check, declared).problems.some((p) => p.message.includes('no binding files')));

// ---------------- the voice rules catch a binding that talks out of turn ----------------
ok('voice: an exclamation mark, a banned phrase and a straight apostrophe are all caught', voiceProblems(['Welcome to the neon!', "It's fine"]).length === 3);

// ---------------- the setting ----------------
ok('setting: nothing stored reads as Parchment', settingsFrom({}).theme === 'parchment' && settingsFrom({}, ['parchment', 'cyberpunk']).theme === 'parchment');
ok('setting: a stored binding this build has is kept', settingsFrom({ theme: 'cyberpunk' }, ['parchment', 'cyberpunk']).theme === 'cyberpunk');
ok('setting: a stored binding this build lacks falls back, never breaks', settingsFrom({ theme: 'vaporwave' }, ['parchment', 'cyberpunk']).theme === 'parchment' && settingsFrom({ theme: '' }, ['parchment']).theme === 'parchment');
ok('setting: with no list given only a well-formed id is kept', settingsFrom({ theme: 'cyberpunk' }).theme === 'cyberpunk' && settingsFrom({ theme: 'Not An Id!' }).theme === 'parchment');
ok('setting: the other rules read exactly as before when a book has no binding stored', settingsFrom({ typewriter: 'quick', textSize: 'large', dev: 'on' }).textSize === 'large' && settingsFrom({ typewriter: 'quick' }).typewriter === 'quick');

if (failures > 0) {
  console.error(`\n${failures} binding check(s) failed.`);
  process.exit(1);
}
console.log('\nAll binding tests passed.');
