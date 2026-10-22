// Build-time validator. Two jobs: (1) check the app's own copy against the voice rules, so tone drift is
// caught here rather than by eye; (2) run every story in content/stories through the same schema and
// integrity checks the app runs when a story is opened, naming the file and place of each problem.
import { readFileSync } from 'node:fs';
import { makeValidators, readStories, validateStory } from './content.mjs';

const file = new URL('../src/copy/voice.ts', import.meta.url);
const source = readFileSync(file, 'utf-8');

// Every quoted or template string literal in voice.ts is UI copy (the file holds nothing else quoted).
const strings = [...source.matchAll(/'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? '');
const copy = strings.filter((s) => /\s/.test(s) || /^[A-Z]/.test(s));

const bannedPhrases = ['welcome', 'loading', 'oops', 'tap to continue', 'something went wrong', 'please wait'];
const emoji = /\p{Extended_Pictographic}/u;

const problems = [];
for (const text of copy) {
  if (text.includes('!')) problems.push(`exclamation mark in: "${text}"`);
  if (emoji.test(text)) problems.push(`emoji in: "${text}"`);
  if (text.includes("\\'") || /\w'\w/.test(text)) problems.push(`straight apostrophe (use ’) in: "${text}"`);
  for (const phrase of bannedPhrases) {
    if (text.toLowerCase().includes(phrase)) problems.push(`banned phrase "${phrase}" in: "${text}"`);
  }
}

if (problems.length > 0) {
  console.error('Voice check failed:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`Voice check passed (${copy.length} strings read).`);

const validators = makeValidators();
const stories = readStories();
let failed = false;
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
