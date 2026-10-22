// Self-test for the content validator and the narrative engine. Not a framework: each check prints one line and
// the script exits non-zero if any fail. Run with `npm run selftest`.
import { makeValidators, readStories, validateStory } from './content.mjs';
import { choose, startRun, UnsupportedSceneError, viewOf } from '../src/engine/play.ts';
import { drawInt } from '../src/engine/rng.ts';
import { addNote, backpackOf, equip, unequip, useItem } from '../src/engine/inventory.ts';
import { statusOf } from '../src/engine/status.ts';
import { tallyLayout } from '../src/ui/tally.ts';
import { expandTokens } from '../src/content/tokens.ts';

const validators = makeValidators();
const base = readStories().find((s) => s.folder === 'saltwick');
if (!base) throw new Error('The saltwick demo story is missing.');

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failures += 1;
}

/** Copy the demo files, let `edit` change them (get/set parsed JSON by file name), return a RawStory. */
function variant(edit) {
  const files = { ...base.files };
  edit({ get: (name) => JSON.parse(files[name]), set: (name, data) => { files[name] = JSON.stringify(data); }, files });
  return { folder: 'saltwick', files };
}
const scenesOf = (api) => api.get('scenes/the-causeway.json');
const sceneNamed = (data, id) => data.scenes.find((s) => s.id === id);

function expectProblem(name, raw, needle, fileNeedle) {
  const { problems, loaded } = validateStory(raw, validators);
  const hit = problems.find((p) => p.message.includes(needle) && (!fileNeedle || p.file.includes(fileNeedle)));
  check(`validator catches: ${name}`, !loaded && Boolean(hit), `wanted "${needle}", got ${JSON.stringify(problems.map((p) => p.message))}`);
}

// ---------------- validator ----------------
{
  const { problems, loaded } = validateStory(base, validators);
  check('demo story is valid', problems.length === 0 && loaded !== null, JSON.stringify(problems));
}

expectProblem('malformed JSON names the file', variant(({ files }) => { files['scenes/the-causeway.json'] = '{ "scenes": [ '; }), "isn't valid JSON", 'scenes/the-causeway.json');
expectProblem('missing file', variant(({ files }) => { delete files['items.json']; }), 'this file is missing', 'items.json');
expectProblem('schema: wrong number of archetypes', variant((a) => { const s = a.get('story.json'); s.archetypes.pop(); a.set('story.json', s); }), 'at least 3', 'story.json');
expectProblem('schema: unknown field', variant((a) => { const s = a.get('story.json'); s.surprise = 1; a.set('story.json', s); }), "isn't a known field", 'story.json');
expectProblem('schema: effect without a note', variant((a) => { const d = scenesOf(a); delete sceneNamed(d, 'saltwick-causeway').choices[1].effects[0].note; a.set('scenes/the-causeway.json', d); }), 'missing the field "note"');
expectProblem('choice to a scene that does not exist', variant((a) => { const d = scenesOf(a); sceneNamed(d, 'saltwick-causeway').choices[0].target = 'nowhere-at-all'; a.set('scenes/the-causeway.json', d); }), 'nowhere-at-all');
expectProblem('orphan scene', variant((a) => { const d = scenesOf(a); d.scenes.push({ id: 'lonely-room', chapterId: 'the-causeway', type: 'narrative', prose: ['One.', 'Two.'], choices: [{ text: 'Out', target: 'saltwick-gate-open' }] }); a.set('scenes/the-causeway.json', d); }), 'unreachable', 'the-causeway.json');
expectProblem('narrative scene with no always-available choice', variant((a) => { const d = scenesOf(a); for (const c of sceneNamed(d, 'saltwick-midway').choices) c.conditions ??= [{ type: 'gold', op: '>=', value: 1 }]; a.set('scenes/the-causeway.json', d); }), 'every choice has conditions');
expectProblem('trap loop with no way out', variant((a) => { const d = scenesOf(a); const mid = sceneNamed(d, 'saltwick-midway'); mid.choices = [{ text: 'Round again', target: 'saltwick-midway' }]; a.set('scenes/the-causeway.json', d); }), 'a trap');
expectProblem('effect names an unknown item', variant((a) => { const d = scenesOf(a); sceneNamed(d, 'saltwick-midway').choices[1].effects[0].itemId = 'ghost-lantern'; a.set('scenes/the-causeway.json', d); }), 'ghost-lantern');
expectProblem('item that can never be obtained', variant((a) => { const i = a.get('items.json'); i.items.push({ id: 'dead-weight', name: 'Dead weight', flavor: 'Nothing.', codexEntry: 'Nothing at all.', type: 'trinket', modifiers: { nerve: 1 }, value: 0, purchasable: false }); a.set('items.json', i); }), 'never obtainable', 'items.json');
expectProblem('flag checked but never set', variant((a) => { const d = scenesOf(a); sceneNamed(d, 'saltwick-causeway').choices[0].effects = undefined; a.set('scenes/the-causeway.json', d); }), 'nothing ever sets it');
expectProblem('unknown text token', variant((a) => { const d = scenesOf(a); sceneNamed(d, 'saltwick-causeway').prose[0] += ' {hero.age}'; a.set('scenes/the-causeway.json', d); }), 'unknown token');
expectProblem('$return outside an encounter scene', variant((a) => { const d = scenesOf(a); sceneNamed(d, 'saltwick-causeway').choices[1].target = '$return'; a.set('scenes/the-causeway.json', d); }), '"$return" can only be used');
expectProblem('encounter scene linked to directly', variant((a) => { const d = scenesOf(a); sceneNamed(d, 'saltwick-causeway').choices[1].target = 'saltwick-gull'; a.set('scenes/the-causeway.json', d); }), 'no other scene may link to it');
expectProblem('ending not listed in story.json', variant((a) => { const d = scenesOf(a); d.scenes.push({ id: 'extra-end', chapterId: 'the-causeway', type: 'ending', prose: ['One.', 'Two.'] }); a.set('scenes/the-causeway.json', d); }), "isn't listed under endings");
expectProblem('lore entry nobody unlocks', variant((a) => { const d = scenesOf(a); delete sceneNamed(d, 'saltwick-midway').unlocksLore; a.set('scenes/the-causeway.json', d); }), 'no scene unlocks this lore entry');
expectProblem('found-only item with nothing that gives it', variant((a) => { const d = scenesOf(a); delete sceneNamed(d, 'saltwick-causeway').choices[2].effects; a.set('scenes/the-causeway.json', d); }), 'never obtainable', 'items.json');
expectProblem('story id must match its folder', variant((a) => { const s = a.get('story.json'); s.id = 'elsewhere'; a.set('story.json', s); }), 'must match the folder name');

// A richer fixture with monsters, a fight, a shop and a fight encounter: valid on its own, then broken.
function rich(edit) {
  return variant((a) => {
    a.set('monsters.json', { monsters: [{ id: 'brine-crab', name: 'Brine crab', codexEntry: 'It disapproves of everything.', hp: 8, damage: { min: 1, max: 3 }, styleTendencies: { strike: 3, guard: 5, feint: 1 }, skills: [], lootTable: { items: [{ itemId: 'brine-tonic', weight: 2 }], noneWeight: 3, gold: { min: 1, max: 4 } }, boss: false }] });
    const d = scenesOf(a);
    d.scenes.push(
      { id: 'saltwick-crab', chapterId: 'the-causeway', type: 'fight', prose: ['A crab.', 'A large crab.'], fight: { monsterId: 'brine-crab', onVictory: { sceneId: 'saltwick-gate-open', effects: [{ type: 'gold', delta: 3, note: 'It had been sitting on three {currency.name}.' }] }, onFlee: { sceneId: 'saltwick-midway' }, onDefeat: 'the-deep-channel' } },
      { id: 'saltwick-quay', chapterId: 'the-causeway', type: 'shop', prose: ['A stall.', 'A damp stall.'], shop: { stock: [{ itemId: 'gull-knife', price: 6 }], leaveSceneId: 'saltwick-midway' } },
    );
    sceneNamed(d, 'saltwick-midway').choices.push({ text: 'Face the crab', target: 'saltwick-crab' });
    sceneNamed(d, 'saltwick-causeway').choices.push({ text: 'Stop at the quay stall', target: 'saltwick-quay' });
    a.set('scenes/the-causeway.json', d);
    const e = a.get('encounters.json');
    e.pools[0].entries.push({ type: 'fight', monsterId: 'brine-crab', weight: 1 });
    a.set('encounters.json', e);
    edit?.({ ...a, scenes: d });
  });
}
{
  const { problems } = validateStory(rich(), validators);
  check('rich fixture (monster, fight, shop, fight encounter) is valid', problems.length === 0, JSON.stringify(problems));
}
expectProblem('fight names a missing monster', rich((a) => { const d = scenesOf(a); sceneNamed(d, 'saltwick-crab').fight.monsterId = 'sea-wolf'; a.set('scenes/the-causeway.json', d); }), 'sea-wolf');
expectProblem('shop sells a non-purchasable item', rich((a) => { const d = scenesOf(a); sceneNamed(d, 'saltwick-quay').shop.stock[0].itemId = 'salt-lantern'; a.set('scenes/the-causeway.json', d); }), 'purchasable: false');
expectProblem('monster never used', rich((a) => { const e = a.get('encounters.json'); e.pools[0].entries.pop(); a.set('encounters.json', e); const d = scenesOf(a); sceneNamed(d, 'saltwick-midway').choices.pop(); d.scenes = d.scenes.filter((s) => s.id !== 'saltwick-crab'); a.set('scenes/the-causeway.json', d); }), 'never used', 'monsters.json');
expectProblem('fight defeat ending must be a death ending', rich((a) => { const d = scenesOf(a); sceneNamed(d, 'saltwick-crab').fight.onDefeat = 'across-before-the-turn'; a.set('scenes/the-causeway.json', d); }), "isn't one of the death endings");

// ---------------- tokens ----------------
{
  const ctx = (pronouns) => ({ name: 'Wen', pronouns, currencyName: 'pennies' });
  const line = '{player.name} {v:lift|lifts} {their} lantern; {They} {v:are|is} sure {theirs} is lit, {themself} included. {{ok}}';
  check('tokens: they/them', expandTokens(line, ctx('they')).text === 'Wen lift their lantern; They are sure theirs is lit, themself included. {ok}');
  check('tokens: she/her', expandTokens(line, ctx('she')).text === 'Wen lifts her lantern; She is sure hers is lit, herself included. {ok}');
  check('tokens: he/him', expandTokens(line, ctx('he')).text === 'Wen lifts his lantern; He is sure his is lit, himself included. {ok}');
  check('tokens: a name with braces stays literal', expandTokens('{player.name}', { ...ctx('they'), name: '{their}' }).text === '{their}');
  check('tokens: stray brace reported', expandTokens('open { brace', ctx('they')).errors.length === 1);
}

// ---------------- engine ----------------
const { loaded } = validateStory(base, validators);
const hero = (archetypeId, pronouns = 'they', seed = 'seed-1') => startRun(loaded, { archetypeId, name: 'Wen', pronouns, seed });
const texts = (run) => viewOf(loaded, run).choices.map((c) => c.text);
/** The engine wants a choice's position in the scene file, which differs from its position in the visible list. */
const pick = (run, prefix) => viewOf(loaded, run).choices.find((c) => c.text.startsWith(prefix))?.index;

{
  const run = hero('wrecker', 'he');
  check('start: stats, gear and hp', run.hp === 14 && run.equipment.weapon === 'gull-knife' && run.inventory['brine-tonic'] === 1 && run.sceneId === 'saltwick-causeway');
  check('start: lore unlocked on entry', run.loreUnlocked.includes('keepers-marks'));
  check('prose uses the chosen pronouns', viewOf(loaded, run).paragraphs[0].includes('his back') && viewOf(loaded, hero('marksreader', 'she')).paragraphs[0].includes('her back'));
}
{
  const run = choose(loaded, hero('tidewarden'), 1);
  check('hp effect applies and is narrated', run.hp === 15 && viewOf(loaded, run).notes[0].includes('3 HP') && run.sceneId === 'saltwick-midway');
}
{
  const atMid = choose(loaded, hero('wrecker'), 1);
  check('stat gate hides a choice (wits 3 < 4)', !texts(atMid).some((t) => t.startsWith('Read the keepers')));
  const reader = choose(loaded, hero('marksreader'), 1);
  check('stat gate shows a choice (wits 5 + staff)', texts(reader).some((t) => t.startsWith('Read the keepers')));
  const readerShe = choose(loaded, hero('marksreader', 'she'), 1);
  const won = choose(loaded, readerShe, pick(readerShe, 'Read the keepers'));
  check('victory ending closes the run', won.status === 'ended' && won.ending.kind === 'victory' && viewOf(loaded, won).paragraphs[1].includes('She sits down'));
  let threw = false;
  try { choose(loaded, won, 0); } catch { threw = true; }
  check('a closed entry cannot be continued', threw);
}
{
  let run = choose(loaded, hero('tidewarden'), 1);
  const lift = pick(run, 'Lift the lantern');
  check('item gate: lantern offered, walking-by not yet', lift !== undefined && !texts(run).some((t) => t.startsWith('Walk on by')));
  run = choose(loaded, run, lift);
  check('item effect gives the item and loops back', run.inventory['salt-lantern'] === 1 && run.sceneId === 'saltwick-midway');
  check('item gate flips after pickup', !texts(run).some((t) => t.startsWith('Lift the lantern')) && texts(run).some((t) => t.startsWith('Walk on by')));
  const stones = choose(loaded, hero('tidewarden', 'they', 'x'), 0);
  check('flag gate: kept-to-stones opens a choice', stones.flags['kept-to-stones'] === true && (stones.sceneId === 'saltwick-midway' || stones.sceneId === 'saltwick-gull'));
}
{
  const atMidWade = choose(loaded, hero('wrecker'), 1);
  const wade = choose(loaded, atMidWade, pick(atMidWade, 'Wade the deep channel'));
  check('narrative death ending', wade.status === 'ended' && wade.ending.kind === 'death' && wade.ending.id === 'the-deep-channel');
  const weak = { ...hero('wrecker'), hp: 2 };
  const dead = choose(loaded, weak, 1);
  check('hp at zero ends the run in the default death ending', dead.status === 'ended' && dead.hp === 0 && dead.sceneId === 'saltwick-drowned');
}
{
  const outcomes = new Set();
  let returned = false;
  let goldNote = false;
  for (let i = 0; i < 80; i += 1) {
    const run = choose(loaded, hero('marksreader', 'she', `enc-${i}`), 0);
    outcomes.add(run.sceneId);
    if (run.sceneId === 'saltwick-gull') {
      if (!returned) {
        returned = run.returnStack.length === 1 && run.returnStack[0] === 'saltwick-midway';
        const back = choose(loaded, run, pick(run, 'Let it be'));
        returned = returned && back.sceneId === 'saltwick-midway' && back.returnStack.length === 0;
        const loot = choose(loaded, run, pick(run, 'Look where'));
        goldNote = loot.gold === 2 && viewOf(loaded, loot).notes[0].includes('two pennies');
      }
    }
  }
  check('encounter roll: both outcomes occur across seeds', outcomes.has('saltwick-midway') && outcomes.has('saltwick-gull'), [...outcomes].join(','));
  check('encounter returns to the original destination', returned);
  check('encounter gold effect and currency token', goldNote);
}
{
  const play = (seed) => {
    let run = hero('tidewarden', 'they', seed);
    run = choose(loaded, run, 0);
    if (run.sceneId === 'saltwick-gull') run = choose(loaded, run, pick(run, 'Let it be'));
    return run;
  };
  check('same seed + same choices = identical run state', JSON.stringify(play('fixed')) === JSON.stringify(play('fixed')));
  const base1 = hero('tidewarden', 'they', 'streams');
  const [, afterEncounter] = drawInt(base1, 'encounter', 100);
  const [combatAlone] = drawInt(base1, 'combat', 1000);
  const [combatAfter] = drawInt(afterEncounter, 'combat', 1000);
  check('random streams are independent', combatAlone === combatAfter);
  const [first] = drawInt(base1, 'encounter', 1000);
  const [again] = drawInt(base1, 'encounter', 1000);
  check('a draw does not mutate the run it came from', first === again && Object.keys(base1.rng).length === 0);
}
{
  const richLoaded = validateStory(rich(), validators).loaded;
  let run = startRun(richLoaded, { archetypeId: 'wrecker', name: 'Wen', pronouns: 'he', seed: 's' });
  run = choose(richLoaded, run, 1);
  const crab = richLoaded.scenes.get('saltwick-midway').choices.findIndex((c) => c.text === 'Face the crab');
  let unsupported = false;
  try { choose(richLoaded, run, crab); } catch (error) { unsupported = error instanceof UnsupportedSceneError; }
  check('fight scenes are refused clearly until combat exists', unsupported);
}

// ---------------- satchel: status, equipment, consumables ----------------
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
const textsOf = (run) => viewOf(loaded, run).choices.map((c) => c.text);
{
  const run = hero('tidewarden');
  const status = statusOf(loaded, run);
  check('status: exact HP, gold, symbol, equipment folded into stats', status.hp === 18 && status.maxHp === 18 && status.gold === 0 && status.currencySymbol === 'p' && status.stats.attack === 5 && status.stats.defense === 3);
  check('status: chapter position', status.chapter.index === 0 && status.chapter.count === 1 && status.chapter.title === 'The Causeway');
  const hurt = statusOf(loaded, { ...run, hp: 7 });
  check('status: current HP is reported exactly', hurt.hp === 7 && hurt.maxHp === 18);
}
{
  let run = hero('tidewarden');
  check('scene items: the sou’wester is offered at the start', textsOf(run).some((t) => t.startsWith('Take the sou’wester')));
  run = choose(loaded, run, pick(run, 'Take the sou’wester'));
  check('scene items: taking it adds it to the backpack, narrates it, and stays on the page', run.inventory['tarred-souwester'] === 1 && run.sceneId === 'saltwick-causeway' && viewOf(loaded, run).notes[0].includes('sou’wester'));
  check('scene items: a carried item hides its own pickup', !textsOf(run).some((t) => t.startsWith('Take the sou’wester')));

  const worn = equip(loaded, run, 'tarred-souwester');
  check('equip: fills an empty slot, leaves the backpack, changes stats', worn.run.equipment.head === 'tarred-souwester' && worn.run.inventory['tarred-souwester'] === undefined && worn.replacedId === null && worn.slot === 'head' && statusOf(loaded, worn.run).stats.nerve === 4);
  check('equip: a worn item still counts as held (pickup stays hidden)', !textsOf(worn.run).some((t) => t.startsWith('Take the sou’wester')));
  check('equip: does not touch the run it came from', run.equipment.head === null && run.inventory['tarred-souwester'] === 1);
  const off = unequip(loaded, worn.run, 'head');
  check('unequip: back to the backpack, counts conserved', off.run.equipment.head === null && off.run.inventory['tarred-souwester'] === 1 && off.itemId === 'tarred-souwester');

  let withStaff = choose(loaded, hero('tidewarden'), pick(hero('tidewarden'), 'Pick up the length of driftwood'));
  const swapped = equip(loaded, withStaff, 'driftwood-staff');
  check('equip: swapping returns the old weapon to the backpack', swapped.replacedId === 'oar-hook' && swapped.run.equipment.weapon === 'driftwood-staff' && swapped.run.inventory['oar-hook'] === 1 && swapped.run.inventory['driftwood-staff'] === undefined);
  check('equip: swapped gear changes the stats', statusOf(loaded, swapped.run).stats.attack === 3 && statusOf(loaded, swapped.run).stats.wits === 3);
  const back = equip(loaded, swapped.run, 'oar-hook');
  check('equip: swapping back restores the original loadout', JSON.stringify(back.run.equipment) === JSON.stringify(withStaff.equipment) && back.run.inventory['driftwood-staff'] === 1);
  check('driftwood pickup is hidden once the staff is carried', !textsOf(withStaff).some((t) => t.startsWith('Pick up the length')));
  check('unequipping gear removes its stat bonus (marksreader wits 6 to 5)', (() => {
    const reader = choose(loaded, hero('marksreader'), 1);
    const bare = unequip(loaded, reader, 'weapon').run;
    return textsOf(reader).some((t) => t.startsWith('Read the keepers')) && statusOf(loaded, bare).stats.wits === 5 && statusOf(loaded, reader).stats.wits === 6;
  })());
}
{
  const run = hero('wrecker', 'he');
  check('equip refuses things not carried, consumables and empty slots', throws(() => equip(loaded, run, 'driftwood-staff')) && throws(() => equip(loaded, run, 'brine-tonic')) && throws(() => unequip(loaded, run, 'head')));
  const full = useItem(loaded, run, 'brine-tonic');
  check('use: at full HP nothing is spent', !full.ok && full.reason === 'full-health');
  const hurt = useItem(loaded, { ...run, hp: 5 }, 'brine-tonic');
  check('use: heals the stated amount and spends one', hurt.ok && hurt.run.hp === 11 && hurt.healed === 6 && hurt.run.inventory['brine-tonic'] === undefined);
  const near = useItem(loaded, { ...run, hp: 12 }, 'brine-tonic');
  check('use: healing stops at the maximum and reports what was actually restored', near.ok && near.run.hp === 14 && near.healed === 2);
  check('use refuses gear, and things not carried', throws(() => useItem(loaded, run, 'gull-knife')) && throws(() => useItem(loaded, hurt.run, 'brine-tonic')));
  const two = { ...run, hp: 3, inventory: { ...run.inventory, 'brine-tonic': 2 } };
  const once = useItem(loaded, two, 'brine-tonic');
  check('use: a stack loses exactly one', once.ok && once.run.inventory['brine-tonic'] === 1);
}
{
  const helm = { id: 'iron-helm', name: 'Iron helm', flavor: 'Heavy.', codexEntry: 'Very heavy.', type: 'head', modifiers: { hp: 5 }, value: 1, purchasable: true };
  const tall = { ...loaded, items: new Map([...loaded.items, ['iron-helm', helm]]) };
  const base = startRun(tall, { archetypeId: 'wrecker', name: 'Wen', pronouns: 'he', seed: 's' });
  const worn = equip(tall, { ...base, inventory: { ...base.inventory, 'iron-helm': 1 } }, 'iron-helm');
  check('max HP: wearing +HP gear raises the ceiling but does not heal', statusOf(tall, worn.run).maxHp === 19 && worn.run.hp === 14);
  const topped = { ...worn.run, hp: 19 };
  check('max HP: taking it off pulls current HP down to the new ceiling', unequip(tall, topped, 'head').run.hp === 14);
}
{
  const readerShe = choose(loaded, hero('marksreader', 'she'), 1);
  const won = choose(loaded, readerShe, pick(readerShe, 'Read the keepers'));
  check('a closed entry refuses satchel changes', throws(() => unequip(loaded, won, 'weapon')) && throws(() => useItem(loaded, won, 'brine-tonic')));
  const noted = addNote(readerShe, 'A line.');
  check('addNote appends without touching the original', noted.pendingNotes.at(-1) === 'A line.' && readerShe.pendingNotes.length === noted.pendingNotes.length - 1);
  const run = { ...hero('wrecker'), inventory: { 'brine-tonic': 2, 'driftwood-staff': 1, 'tarred-souwester': 1, 'gull-knife': 1 } };
  check('backpack order: weapons, then head, then consumables, each by name', backpackOf(loaded, run).map((e) => e.item.id).join(',') === 'driftwood-staff,gull-knife,tarred-souwester,brine-tonic');
}
{
  const one = tallyLayout(1, 1);
  check('tally: one chapter is one inked stroke', one.strokes.length === 1 && !one.strokes[0].gate && one.strokes[0].reached && one.width < 20);
  const seven = tallyLayout(7, 3);
  const [a, , , d, gate, f] = seven.strokes;
  check('tally: the fifth stroke slants across the first four', gate.gate && gate.x1 < a.x1 && gate.x2 > d.x1 && seven.strokes.filter((s) => s.gate).length === 1);
  check('tally: a new group starts clear of the slant', f.x1 > gate.x2 && seven.width > f.x1);
  check('tally: only the chapters reached are inked', seven.strokes.map((s) => s.reached).join() === 'true,true,true,false,false,false,false');
  check('tally: layout is deterministic', JSON.stringify(tallyLayout(12, 5)) === JSON.stringify(tallyLayout(12, 5)));
}

console.log(failures === 0 ? '\nAll self-tests passed.' : `\n${failures} self-test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
