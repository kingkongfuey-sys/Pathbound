// Build-time validator. Three jobs: (1) check the app's own copy against the voice rules, so tone drift is
// caught here rather than by eye; (2) check every binding in content/themes (schema, readable colours, typefaces that
// are really bundled, and the words they carry against the same voice rules); (3) run every story in content/stories
// through the same schema and integrity checks the app runs when a story is opened, naming the file and place of each problem.
import { readFileSync } from 'node:fs';
import { declaredFonts, makeValidators, readStories, readThemes, validateStory, validateThemes } from './content.mjs';
import { voiceProblems } from './voice.mjs';

const file = new URL('../src/copy/voice.ts', import.meta.url);
const source = readFileSync(file, 'utf-8');

// Every quoted or template string literal in voice.ts is UI copy (the file holds nothing else quoted).
const strings = [...source.matchAll(/'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? '');
const copy = strings.filter((s) => /\s/.test(s) || /^[A-Z]/.test(s));

const problems = voiceProblems(copy);

if (problems.length > 0) {
  console.error('Voice check failed:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`Voice check passed (${copy.length} strings read).`);

const validators = makeValidators();
let failed = false;

// Bindings: every file in content/themes, checked like a story, plus the words they carry against the same voice rules.
const bindingFiles = readThemes();
const binding = validateThemes(bindingFiles, validators.theme, declaredFonts());
const bindingWords = Object.values(bindingFiles).flatMap((text) => {
  try {
    const data = JSON.parse(text);
    return [data.name, data.note].filter((word) => typeof word === 'string');
  } catch {
    return [];
  }
});
const bindingVoice = voiceProblems(bindingWords);
if (binding.problems.length > 0 || bindingVoice.length > 0) {
  failed = true;
  console.error(`Bindings have ${binding.problems.length + bindingVoice.length} problem(s):`);
  for (const p of binding.problems) console.error(`  ${p.file}  ${p.where}\n    ${p.message}`);
  for (const p of bindingVoice) console.error(`  voice: ${p}`);
} else {
  console.log(`Bindings passed (${binding.themes.map((t) => t.name).join(', ')}).`);
}

const stories = readStories();
for (const raw of stories) {
  const { problems, loaded } = validateStory(raw, validators);
  if (problems.length > 0) {
    failed = true;
    console.error(`Story "${raw.folder}" has ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  ${p.file}  ${p.where}\n    ${p.message}`);
  } else if (loaded) {
    console.log(`Story "${raw.folder}" passed (${loaded.scenes.size} scenes, ${loaded.items.size} items, ${loaded.monsters.size} monsters).`);
  }
}
if (stories.length === 0) {
  failed = true;
  console.error('No stories found in content/stories.');
}
if (failed) process.exit(1);
