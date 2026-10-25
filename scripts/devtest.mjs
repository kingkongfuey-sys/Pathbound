// Self-test for dev mode and the settings that govern it: the pure helpers (jump, reseed, listings), the switches the
// loop honours (god-mode, a forced encounter), and how settings are read and written. Dev tools must produce runs that
// pass the same integrity check as any other, so every jump and reseed is also run through `runProblem`.
import { makeValidators, readStories, validateStory } from './content.mjs';
import { devJump, devPool, devReseed, devScenes } from '../src/engine/dev.ts';
import { choose, fightAction, fleeFight, leaveShop, startRun, viewOf } from '../src/engine/play.ts';
import { buy } from '../src/engine/shop.ts';
import { runProblem } from '../src/save/snapshot.ts';
import { DEFAULT_SETTINGS, SPEEDS, TEXT_SIZES, devEffective, settingText, settingsFrom, textScale } from '../src/app/settings.ts';

const validators = makeValidators();
const raw = readStories().find((s) => s.folder === 'saltwick');
const { loaded } = validateStory(raw, validators);
if (!loaded) throw new Error('The saltwick demo story is not valid.');

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failures += 1;
}
const ARCHETYPES = ['tidewarden', 'wrecker', 'marksreader'];
const hero = (archetype = 'marksreader', seed = 'dev-1') => startRun(loaded, { archetypeId: archetype, name: 'Wen', pronouns: 'they', seed });

/** Play a run to its ending with a simple bot. `dev` is passed to every engine call. */
function playOut(start, seedNumber, dev = {}, each) {
  let state = seedNumber;
  const chance = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  let run = start;
  for (let steps = 0; run.status === 'playing' && steps < 400; steps += 1) {
    const shop = viewOf(loaded, run).shop;
    if (shop) run = leaveShop(loaded, run);
    else if (run.combat) {
      if (run.hp <= 4 && chance() < 0.35) run = fleeFight(loaded, run, dev);
      else {
        const out = fightAction(loaded, run, { kind: 'stance', stance: ['strike', 'guard', 'feint'][Math.floor(chance() * 3)] }, dev);
        run = out.ok ? out.run : run;
      }
    } else {
      const choices = viewOf(loaded, run).choices;
      run = choose(loaded, run, choices[Math.floor(chance() * choices.length)].index, dev);
    }
    each?.(run);
  }
  return run;
}

// ---------------- settings ----------------
{
  check('settings: nothing stored gives the defaults', JSON.stringify(settingsFrom({})) === JSON.stringify(DEFAULT_SETTINGS) && DEFAULT_SETTINGS.dev === false);
  check('settings: every text size round-trips, and the scale only ever grows', TEXT_SIZES.every((t) => settingsFrom({ textSize: t }).textSize === t) && TEXT_SIZES.every((t, i) => i === 0 || textScale(t) > textScale(TEXT_SIZES[i - 1])) && textScale('standard') === 1);
  check('settings: an unknown text size or speed falls back, never breaks', settingsFrom({ textSize: 'huge', typewriter: 'warp' }).textSize === 'standard' && settingsFrom({ typewriter: 'warp' }).typewriter === 'steady' && SPEEDS.length === 4);
  check('settings: switches are on/off text, and anything else reads as off', settingText(true) === 'on' && settingText(false) === 'off' && settingText('large') === 'large' && settingsFrom({ dev: 'on', god: 'on', skipText: 'on' }).god === true && settingsFrom({ dev: 'yes', god: 'true' }).dev === false && settingsFrom({ god: 'true' }).god === false);
  const loose = settingsFrom({ dev: 'off', god: 'on', skipText: 'on' });
  check('settings: god-mode and skipped text are inert while the hidden switch is off', devEffective(loose).god === false && devEffective(loose).skipText === false && devEffective({ ...loose, dev: true }).god === true);
}

// ---------------- jump ----------------
{
  const scenes = devScenes(loaded);
  check('jump: the list holds every scene once, grouped by chapter', scenes.length === loaded.scenes.size && new Set(scenes.map((s) => s.id)).size === scenes.length && scenes.every((s) => s.chapterTitle !== ''));

  let problem = null;
  let ended = 0;
  let fights = 0;
  for (const archetype of ARCHETYPES) {
    for (const scene of scenes) {
      const jumped = devJump(loaded, hero(archetype), scene.id);
      const wrong = runProblem(loaded, jumped);
      if (wrong) problem = `${archetype} at ${scene.id}: ${wrong}`;
      if (jumped.sceneId !== scene.id) problem = `${scene.id}: landed at ${jumped.sceneId}`;
      if (scene.type === 'ending') { ended += 1; if (jumped.status !== 'ended') problem = `${scene.id}: an ending scene did not close the run`; }
      if (scene.type === 'fight') { fights += 1; if (!jumped.combat) problem = `${scene.id}: a fight scene did not open its fight`; }
      if (jumped.status === 'playing') {
        // And play on from there to an ending without error.
        const finished = playOut(jumped, 11, {});
        if (finished.status !== 'ended') problem = `${archetype} from ${scene.id}: could not be played to an ending`;
      }
    }
  }
  check('jump: every scene can be jumped to, passes the integrity check, and can be played on from', problem === null && ended > 0 && fights > 0, problem ?? '');

  // A jump drops a fight in progress, a pending encounter return, and notes.
  let run = hero('wrecker');
  const fightScene = scenes.find((s) => s.type === 'fight');
  const midFight = devJump(loaded, run, fightScene.id);
  const away = devJump(loaded, { ...midFight, returnStack: [loaded.story.start], pendingNotes: ['x'] }, loaded.story.start);
  check('jump: leaves a fight, an encounter return and old notes behind', midFight.combat !== null && away.combat === null && away.returnStack.length === 0 && away.pendingNotes.length === 0);
  const closed = playOut(hero(), 3);
  let refusedEnded = false;
  try { devJump(loaded, closed, loaded.story.start); } catch { refusedEnded = true; }
  let refusedUnknown = false;
  try { devJump(loaded, hero(), 'no-such-scene'); } catch { refusedUnknown = true; }
  check('jump: refuses a closed entry and a scene the story does not have', refusedEnded && refusedUnknown);
}

// ---------------- seed ----------------
{
  const a = hero('tidewarden', 'seed-a');
  const reseeded = devReseed(a, '  seed-b ');
  check('seed: reseeding equals beginning with that seed (trimmed)', JSON.stringify(reseeded) === JSON.stringify(hero('tidewarden', 'seed-b')) && reseeded.seed === 'seed-b');
  let refused = false;
  try { devReseed(a, '   '); } catch { refused = true; }
  check('seed: an empty seed is refused', refused);

  // Mid-run: reseeding restarts every stream, and the same seed then plays the same, a different one (usually) not.
  let identical = 0;
  let differing = 0;
  for (let i = 0; i < 30; i += 1) {
    const start = playOutStopAfter(hero(ARCHETYPES[i % 3], `mid-${i}`), 20 + i, 3);
    const one = playOut(devReseed(start, 'same'), 5);
    const two = playOut(devReseed(start, 'same'), 5);
    const other = playOut(devReseed(start, 'other'), 5);
    if (JSON.stringify(one) === JSON.stringify(two)) identical += 1;
    if (JSON.stringify(one) !== JSON.stringify(other)) differing += 1;
    const wrong = runProblem(loaded, start.status === 'playing' ? devReseed(start, 'x') : start);
    if (wrong) { identical = -999; }
  }
  check('seed: the same seed replays identically from mid-run; a different one changes the run', identical === 30 && differing > 5, `identical ${identical}, differing ${differing}`);
}
function playOutStopAfter(start, seedNumber, steps) {
  let n = 0;
  let run = start;
  let state = seedNumber;
  const chance = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  while (run.status === 'playing' && n < steps) {
    if (run.combat) { const out = fightAction(loaded, run, { kind: 'stance', stance: 'strike' }); run = out.ok ? out.run : run; }
    else if (viewOf(loaded, run).shop) run = leaveShop(loaded, run);
    else { const c = viewOf(loaded, run).choices; run = choose(loaded, run, c[Math.floor(chance() * c.length)].index); }
    n += 1;
  }
  return run;
}

// ---------------- god-mode ----------------
{
  let hurt = null;
  let reached = 0;
  for (let i = 0; i < 150 && !hurt; i += 1) {
    const finished = playOut(hero(ARCHETYPES[i % 3], `god-${i}`), 900 + i, { god: true }, (r) => {
      if (r.status === 'playing' && r.hp < 1) hurt = `run ${i}: HP fell to ${r.hp} while playing`;
      const wrong = runProblem(loaded, r);
      if (wrong) hurt = `run ${i}: ${wrong}`;
    });
    if (finished.status === 'ended') reached += 1;
    if (finished.status === 'ended' && finished.ending.kind === 'death' && finished.hp === 0) hurt = `run ${i}: died of damage under god-mode`;
  }
  check('god-mode: 150 runs, the hero is never hurt, nothing dies of damage, every state passes the integrity check', hurt === null && reached === 150, hurt ?? `reached ${reached}`);

  // The random stream is untouched by it: same action, same draws.
  let run = devJump(loaded, hero('wrecker', 'god-stream'), loaded.story.start);
  for (const scene of devScenes(loaded)) if (scene.type === 'fight') { run = devJump(loaded, hero('wrecker', 'god-stream'), scene.id); break; }
  const plain = fightAction(loaded, run, { kind: 'stance', stance: 'strike' });
  const god = fightAction(loaded, run, { kind: 'stance', stance: 'strike' }, { god: true });
  check('god-mode: the round plays the same draws, the hero simply keeps their HP', plain.ok && god.ok && JSON.stringify(plain.run.rng) === JSON.stringify(god.run.rng) && god.run.hp >= plain.run.hp && god.run.hp === run.hp);

  // Off means off.
  const off = playOut(hero('tidewarden', 'god-off'), 77, {});
  const alsoOff = playOut(hero('tidewarden', 'god-off'), 77, { god: false });
  check('god-mode: left off, runs are exactly as they were', JSON.stringify(off) === JSON.stringify(alsoOff));
}

// ---------------- forced encounter ----------------
{
  let target = null;
  for (const scene of loaded.scenes.values()) {
    if (scene.type !== 'narrative') continue;
    const index = scene.choices.findIndex((c) => c.encounterChance !== undefined && c.target !== '$return');
    if (index !== -1 && (loaded.pools.get(scene.chapterId) ?? []).length > 0) { target = { scene, index }; break; }
  }
  check('encounter: the demo story has a choice that can start one', target !== null);
  if (target) {
    const pool = devPool(loaded, target.scene.chapterId);
    check('encounter: the picker lists every entry of the chapter\'s pool', pool.length === loaded.pools.get(target.scene.chapterId).length && pool.every((p) => p.label.length > 0));
    let problem = null;
    for (const entry of loaded.pools.get(target.scene.chapterId).map((e, i) => ({ e, i }))) {
      const at = devJump(loaded, hero('marksreader', 'force'), target.scene.id);
      const forced = choose(loaded, at, target.index, { force: entry.i });
      if (JSON.stringify(forced.rng.encounter) !== JSON.stringify(at.rng.encounter)) problem = `entry ${entry.i}: the roll was not skipped`;
      if (forced.returnStack.length !== at.returnStack.length + 1) problem = `entry ${entry.i}: nothing was left waiting to resume`;
      if (entry.e.type === 'fight') {
        if (!forced.combat || forced.combat.monsterId !== entry.e.monsterId || forced.combat.origin.kind !== 'encounter' || forced.combat.origin.entryIndex !== entry.i) problem = `entry ${entry.i}: the wrong fight opened`;
      } else if (forced.sceneId !== entry.e.sceneId) problem = `entry ${entry.i}: the wrong scene opened`;
      const wrong = runProblem(loaded, forced);
      if (wrong) problem = `entry ${entry.i}: ${wrong}`;
    }
    check('encounter: each pool entry can be forced, skips the roll, and leaves a sound run', problem === null, problem ?? '');
    const at = devJump(loaded, hero('marksreader', 'force'), target.scene.id);
    let fine = true;
    try { choose(loaded, at, target.index, { force: 99 }); } catch { fine = false; }
    check('encounter: a force that names nothing falls back to the dice instead of failing', fine);
  }
}

console.log(failures === 0 ? '\nAll dev-mode tests passed.' : `\n${failures} dev-mode test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
