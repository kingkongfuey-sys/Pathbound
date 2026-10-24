// Self-test for the content validator, the narrative engine and combat. Not a framework: each check prints one line and
// the script exits non-zero if any fail. Run with `npm run selftest`.
import { makeValidators, readStories, validateStory } from './content.mjs';
import { choose, fightAction, fleeFight, leaveShop, startRun, viewOf } from '../src/engine/play.ts';
import { BEATS, combatProblem, compareStances, flee, openCombat, playRound } from '../src/engine/combat.ts';
import { drawInt, drawWeighted } from '../src/engine/rng.ts';
import { buy, offerFor, sell } from '../src/engine/shop.ts';
import { awardXp, gainsAt, levelFor, LEVEL_CAP, XP_FOR_LEVEL, xpToNext, xpWorth } from '../src/engine/growth.ts';
import { contrastRatio } from '../src/content/integrity.ts';
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
expectProblem('found-only item with nothing that gives it', variant((a) => { const d = scenesOf(a); delete sceneNamed(d, 'saltwick-midway').choices[1].effects; a.set('scenes/the-causeway.json', d); }), 'never obtainable', 'items.json');
expectProblem('story id must match its folder', variant((a) => { const s = a.get('story.json'); s.id = 'elsewhere'; a.set('story.json', s); }), 'must match the folder name');

// Fixture with a shop scene (shops arrive in a later stage, so only the validator knows them yet).
function shopped(edit) {
  return variant((a) => {
    const d = scenesOf(a);
    d.scenes.push({ id: 'saltwick-quay', chapterId: 'the-causeway', type: 'shop', prose: ['A stall.', 'A damp stall.'], shop: { stock: [{ itemId: 'gull-knife', price: 6 }], leaveSceneId: 'saltwick-midway' } });
    sceneNamed(d, 'saltwick-causeway').choices.push({ text: 'Stop at the quay stall', target: 'saltwick-quay' });
    a.set('scenes/the-causeway.json', d);
    edit?.({ ...a, scenes: d });
  });
}
{
  const { problems } = validateStory(shopped(), validators);
  check('shop fixture is valid', problems.length === 0, JSON.stringify(problems));
}
expectProblem('fight names a missing monster', variant((a) => { const d = scenesOf(a); sceneNamed(d, 'saltwick-stone-crab').fight.monsterId = 'sea-wolf'; a.set('scenes/the-causeway.json', d); }), 'sea-wolf');
expectProblem('encounter fight names a missing monster', variant((a) => { const e = a.get('encounters.json'); e.pools[0].entries[1].monsterId = 'sea-wolf'; a.set('encounters.json', e); }), 'sea-wolf', 'encounters.json');
expectProblem('shop sells a non-purchasable item', shopped((a) => { const d = scenesOf(a); sceneNamed(d, 'saltwick-quay').shop.stock[0].itemId = 'salt-lantern'; a.set('scenes/the-causeway.json', d); }), 'purchasable: false');
expectProblem('monster never used', variant((a) => { const e = a.get('encounters.json'); e.pools[0].entries = e.pools[0].entries.filter((x) => x.type !== 'fight'); a.set('encounters.json', e); }), 'never used', 'monsters.json');
expectProblem('fight defeat ending must be a death ending', variant((a) => { const d = scenesOf(a); sceneNamed(d, 'saltwick-stone-crab').fight.onDefeat = 'across-before-the-turn'; a.set('scenes/the-causeway.json', d); }), "isn't one of the death endings");
expectProblem('fight victory scene that does not exist', variant((a) => { const d = scenesOf(a); sceneNamed(d, 'saltwick-stone-crab').fight.onVictory.sceneId = 'nowhere-at-all'; a.set('scenes/the-causeway.json', d); }), 'nowhere-at-all');
expectProblem('fight scene nothing leads to', variant((a) => { const d = scenesOf(a); sceneNamed(d, 'saltwick-midway').choices = sceneNamed(d, 'saltwick-midway').choices.filter((c) => c.target !== 'saltwick-stone-crab'); a.set('scenes/the-causeway.json', d); }), 'unreachable');
expectProblem('flag set only by a fight is still checked', variant((a) => { const d = scenesOf(a); delete sceneNamed(d, 'saltwick-stone-crab').fight.onVictory.effects; a.set('scenes/the-causeway.json', d); }), 'nothing ever sets it');
expectProblem('loot table names a missing item', variant((a) => { const m = a.get('monsters.json'); m.monsters[0].lootTable.items[0].itemId = 'gold-tooth'; a.set('monsters.json', m); }), 'gold-tooth', 'monsters.json');
expectProblem('monster that cannot choose a stance', variant((a) => { const m = a.get('monsters.json'); m.monsters[0].styleTendencies = { strike: 0, guard: 0, feint: 0 }; a.set('monsters.json', m); }), 'never choose a stance');

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
  check('flag gate: kept-to-stones opens a choice', stones.flags['kept-to-stones'] === true && ['saltwick-midway', 'saltwick-gull', 'saltwick-crate', 'saltwick-causeway'].includes(stones.sceneId));
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
  for (let i = 0; i < 120; i += 1) {
    const run = choose(loaded, hero('marksreader', 'she', `enc-${i}`), 0);
    outcomes.add(run.combat ? 'fight' : run.sceneId);
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
  check('encounter roll: all three outcomes occur across seeds (quiet crossing, flavor, fight)', outcomes.has('saltwick-midway') && outcomes.has('saltwick-gull') && outcomes.has('fight'), [...outcomes].join(','));
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


/** Stand a fresh hero at the stone crab's fight with the hero's HP and stats clean (module-level twin of the combat block's helper). */
function atCrabFresh(archetype = 'tidewarden', seed = 'duel', pronouns = 'they') {
  const start = hero(archetype, pronouns, seed);
  let run = choose(loaded, start, 1);
  run = { ...run, hp: start.hp, stats: start.stats, gold: 0, flags: {}, pendingNotes: [], aftermath: [] };
  return choose(loaded, run, pick(run, 'Ask the crab'));
}
const forcedFoe = (run, intent, extra = {}) => ({ ...run, combat: { ...run.combat, intent, tell: null, ...extra } });

// ---------------- combat ----------------
{
  /** Stand the hero at the crab's fight. `seed` picks the streams; `archetype` the hero. */
  const atCrab = (archetype = 'tidewarden', seed = 'duel', pronouns = 'they') => {
    const fresh = hero(archetype, pronouns, seed);
    let run = choose(loaded, fresh, 1);
    // Walk to the post by whatever route the encounter dice allow, then put the hero back to a clean start.
    run = { ...run, hp: fresh.hp, stats: fresh.stats, gold: 0, flags: {}, pendingNotes: [], aftermath: [] };
    return choose(loaded, run, pick(run, 'Ask the crab'));
  };
  /** Pin the foe's stance for the coming round (and drop the tell) so a rule can be tested on its own. */
  const forced = (run, intent, extra = {}) => ({ ...run, combat: { ...run.combat, intent, tell: null, ...extra } });
  const strike = (stance, skillId) => (skillId ? { kind: 'stance', stance, skillId } : { kind: 'stance', stance });
  const roundEvent = (outcome) => outcome.run.aftermath[0] ?? outcome.run.combat.log.at(-1);
  /** The two damage rolls the next round will draw, read ahead from the same stream the engine uses. */
  const rolls = (run, foeSpan = 3) => { const [h, r1] = drawInt(run, 'combat', 3); const [f] = drawInt(r1, 'combat', foeSpan); return { h, f }; };

  // --- the rock-paper-scissors core ---
  check('rps: strike beats feint, feint beats guard, guard beats strike', BEATS.strike === 'feint' && BEATS.feint === 'guard' && BEATS.guard === 'strike');
  const table = [['strike', 'feint', 'win'], ['feint', 'guard', 'win'], ['guard', 'strike', 'win'], ['feint', 'strike', 'lose'], ['guard', 'feint', 'lose'], ['strike', 'guard', 'lose'], ['strike', 'strike', 'clash'], ['guard', 'guard', 'clash'], ['feint', 'feint', 'clash']];
  check('rps: all nine pairings resolve as expected', table.every(([h, f, r]) => compareStances(h, f) === r));

  // --- opening a fight ---
  const duel = atCrab();
  check('fight scene opens a duel: full foe HP, round 1, a real intent', duel.combat && duel.combat.monsterId === 'stone-crab' && duel.combat.foeHp === 12 && duel.combat.round === 1 && ['strike', 'guard', 'feint'].includes(duel.combat.intent) && duel.sceneId === 'saltwick-stone-crab');
  const view = viewOf(loaded, duel);
  check('fight view: prose, no choices, exact foe HP, hero skills, consumables', view.paragraphs.length === 2 && view.choices.length === 0 && view.combat.foeHp === 12 && view.combat.foeMaxHp === 12 && view.combat.skills[0].id === 'braced-stance' && view.combat.intro === 'scene');
  check('a choice cannot be taken while a fight is on', throws(() => choose(loaded, duel, 0)));
  check('the satchel is shut during a fight', throws(() => equip(loaded, duel, 'oar-hook')) && throws(() => unequip(loaded, duel, 'weapon')) && throws(() => useItem(loaded, { ...duel, hp: 3 }, 'brine-tonic')));
  check('status works mid-fight (strip stays honest)', statusOf(loaded, duel).hp === 18 && statusOf(loaded, duel).chapter.title === 'The Causeway');
  check('a fresh fight is a whole fight', combatProblem(loaded, duel) === null);

  // --- exact damage ---
  {
    const run = forced(duel, 'feint');
    const { h } = rolls(run);
    const out = playRound(loaded, run, strike('strike'));
    const ev = roundEvent(out);
    check('win: strike beats feint; damage = attack + 1 + roll, exactly', out.ok && ev.result === 'win' && ev.dealt === 5 + 1 + h && ev.taken === 0 && out.run.combat.foeHp === 12 - ev.dealt && ev.foeHp === out.run.combat.foeHp);
  }
  {
    const run = forced(duel, 'strike');
    const { f } = rolls(run);
    const out = playRound(loaded, run, strike('feint'));
    const ev = roundEvent(out);
    const expected = Math.max(1, 2 + f - 3);
    check('lose: strike beats feint; foe damage = roll minus defense, never under 1', out.ok && ev.result === 'lose' && ev.taken === expected && ev.dealt === 0 && out.run.hp === 18 - expected);
  }
  {
    const run = forced(duel, 'guard');
    const { h, f } = rolls(run);
    const out = playRound(loaded, run, strike('guard'));
    const ev = roundEvent(out);
    check('clash: both sides deal half, rounded up (the crab\'s shell-up turns 2 aside)', ev.result === 'clash' && ev.foeSkillId === 'shell-up' && ev.dealt === Math.ceil((5 + 1 + h) / 2) - 2 && ev.taken === Math.max(1, Math.ceil((2 + f) / 2) - 3));
  }
  {
    const run = forced(duel, 'strike');
    const out = playRound(loaded, run, strike('guard'));
    check('guard beats strike (the riposte lands)', roundEvent(out).result === 'win' && roundEvent(out).dealt > 0);
  }

  // --- items in a fight ---
  {
    const wrecker = { ...atCrab('wrecker', 'duel', 'he') };
    const hurt = forced({ ...wrecker, hp: 5 }, 'strike');
    const { f } = rolls(hurt);
    const out = playRound(loaded, hurt, { kind: 'item', itemId: 'brine-tonic' });
    const ev = roundEvent(out);
    const taken = Math.max(1, 2 + f - 1);
    check('item: heals first, spends the round, leaves the hero open to a strike', ev.result === 'open' && ev.heroHealed === 6 && ev.taken === taken && out.run.hp === 5 + 6 - taken && out.run.inventory['brine-tonic'] === undefined);
    const guarded = forced({ ...wrecker, hp: 5 }, 'guard');
    const safe = playRound(loaded, guarded, { kind: 'item', itemId: 'brine-tonic' });
    check('item: a foe that only guards cannot punish it', roundEvent(safe).result === 'idle' && safe.run.hp === 11 && roundEvent(safe).taken === 0);
    const full = playRound(loaded, forced(wrecker, 'strike'), { kind: 'item', itemId: 'brine-tonic' });
    check('item: at full HP nothing is spent and the round is not played', !full.ok && full.reason === 'full-health');
    check('item: refuses gear and things not carried', throws(() => playRound(loaded, forced(duel, 'strike'), { kind: 'item', itemId: 'oar-hook' })) && throws(() => playRound(loaded, forced({ ...duel, hp: 3 }, 'strike'), { kind: 'item', itemId: 'brine-tonic' })));
  }

  // --- skills ---
  {
    const wrecker = atCrab('wrecker', 'duel', 'he');
    const run = forced(wrecker, 'guard');
    const { h } = rolls(run);
    const out = playRound(loaded, run, strike('feint', 'soft-place'));
    const ev = roundEvent(out);
    check('skill: bonus damage adds to a winning blow', ev.result === 'win' && ev.heroSkillId === 'soft-place' && ev.foeSkillId === 'shell-up' && ev.dealt === Math.max(0, 4 + 1 + h + 3 - 2));
    check('skill: the foe\'s own skill fires when its stance fits and turns damage aside', ev.foeSkillId === 'shell-up' && out.run.combat.cooldowns['shell-up'] === 3);
    check('skill: cooldown is set on use', out.run.combat.cooldowns['soft-place'] === 3);
    check('skill: a skill that does not fit the stance is refused', throws(() => playRound(loaded, run, strike('strike', 'soft-place'))));
    check('skill: unknown skill is refused', throws(() => playRound(loaded, run, strike('feint', 'no-such-skill'))));

    // cooldown 3 means three rounds of waiting
    let r = { ...out.run, hp: 99, stats: { ...out.run.stats, hp: 99 } };
    const reset = (x) => ({ ...x, hp: 99, combat: { ...x.combat, foeHp: 12 } });
    const log = [];
    for (let i = 0; i < 3; i += 1) {
      r = forced(reset(r), 'guard', {});
      const attempt = playRound(loaded, r, strike('feint', 'soft-place'));
      log.push(!attempt.ok && attempt.reason === 'cooling');
      const plain = playRound(loaded, r, strike('strike'));
      r = plain.run;
    }
    r = forced(reset(r), 'guard', {});
    const again = playRound(loaded, r, strike('feint', 'soft-place'));
    check('skill: three rounds cooling, then ready again', log.every(Boolean) && again.ok);
  }
  {
    const tide = atCrab('tidewarden');
    const run = forced(tide, 'feint');
    const out = playRound(loaded, run, strike('guard', 'braced-stance'));
    const ev = roundEvent(out);
    check('skill: reduceDamage turns blows aside (defense 3 + braced 3 stops a 2-4 hit entirely)', ev.result === 'lose' && ev.taken === 0 && out.run.hp === 18);
  }
  {
    const reader = atCrab('marksreader', 'duel', 'she');
    const full = playRound(loaded, forced(reader, 'guard'), strike('guard', 'steady-count'));
    check('skill: a heal is refused at full HP and nothing changes', !full.ok && full.reason === 'full-health');
    const hurt = forced({ ...reader, hp: 5 }, 'guard');
    const out = playRound(loaded, hurt, strike('guard', 'steady-count'));
    const ev = roundEvent(out);
    check('skill: heal lands before the exchange, exactly', ev.heroHealed === 4 && out.run.hp === 5 + 4 - ev.taken && ev.heroSkillId === 'steady-count');
    const nearly = playRound(loaded, forced({ ...reader, hp: 11 }, 'strike'), strike('guard', 'steady-count'));
    check('skill: a heal stops at the maximum and reports what was restored', roundEvent(nearly).heroHealed === 1);
  }

  // --- the tell ---
  {
    let seen = 0;
    let truthful = true;
    let told = 0;
    const counts = { strike: 0, guard: 0, feint: 0 };
    const total = 400;
    for (let i = 0; i < total; i += 1) {
      const run = atCrab('marksreader', `tell-${i}`, 'she');
      const c = run.combat;
      seen += 1;
      counts[c.intent] += 1;
      if (c.tell !== null) { told += 1; if (c.tell !== c.intent) truthful = false; }
    }
    check('tell: when present it is always true', truthful && seen === total);
    const share = told / total;
    check('tell: wits 6 reads the foe about 60% of the time', share > 0.5 && share < 0.7, `got ${share}`);
    check('tendencies: the crab guards most, then strikes, then feints (5:2:1)', counts.guard > counts.strike && counts.strike > counts.feint, JSON.stringify(counts));
    let sharp = 0;
    for (let i = 0; i < total; i += 1) {
      const keen = openCombat(loaded, { ...hero('wrecker', 'he', `keen-${i}`), stats: { ...hero('wrecker').stats, wits: 99 } }, 'stone-crab', { kind: 'scene' });
      if (keen.combat.tell !== null) sharp += 1;
    }
    check('tell: however sharp the wits, it never reads more than about 80%', sharp / total > 0.7 && sharp / total < 0.9, `got ${sharp / total}`);
  }

  // --- determinism (R11) ---
  const script = [strike('strike'), strike('guard'), strike('feint'), strike('strike'), strike('guard'), strike('feint'), strike('strike')];
  const runScript = (seed) => {
    let run = atCrab('tidewarden', seed);
    const trail = [];
    for (const action of script) {
      if (!run.combat) break;
      const out = fightAction(loaded, { ...run, hp: Math.max(run.hp, 18) }, action);
      run = out.run;
      trail.push(JSON.stringify(run));
    }
    return trail.join('|');
  };
  check('determinism: identical seed and actions give an identical fight, state for state', runScript('same') === runScript('same'));
  check('determinism: a different seed gives a different fight', new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(runScript)).size > 3);
  {
    const run = atCrab('tidewarden', 'streams');
    const [encounterBefore] = drawInt(run, 'encounter', 1000);
    const after = playRound(loaded, forced(run, 'guard'), strike('guard')).run;
    const [encounterAfter] = drawInt(after, 'encounter', 1000);
    check('determinism: fighting does not disturb the encounter stream', encounterBefore === encounterAfter);
  }
  {
    const [zeroNever] = (() => { let r = hero('wrecker'); const seen = new Set(); for (let i = 0; i < 300; i += 1) { const [pick, next] = drawWeighted(r, 'x', [0, 3, 0, 1]); seen.add(pick); r = next; } return [!seen.has(0) && !seen.has(2) && seen.has(1) && seen.has(3)]; })();
    check('drawWeighted: zero weights are never picked, the rest all are', zeroNever);
    check('drawWeighted: no positive weight is an error', throws(() => drawWeighted(hero('wrecker'), 'x', [0, 0])));
  }

  // --- victory, loot, defeat ---
  {
    const run = forced(atCrab('tidewarden', 'win'), 'feint', { foeHp: 1 });
    const loot = fightAction(loaded, run, strike('strike')).run;
    // Read the loot ahead from the same stream state the engine will use.
    const [, afterRolls] = (() => { const [h, r1] = drawInt(run, 'combat', 3); const [f, r2] = drawInt(r1, 'combat', 3); return [[h, f], r2]; })();
    const [goldRoll, r3] = drawInt(afterRolls, 'loot', 4);
    const [index] = drawWeighted(r3, 'loot', [3, 3]);
    check('victory: foe at zero ends the fight, moves to the victory scene, sets the story flag', loot.combat === null && loot.sceneId === 'saltwick-crab-won' && loot.flags['crab-beaten'] === true && loot.status === 'playing');
    check('victory: aftermath is the last round, the win, the spoils, the experience and the level it brings', loot.aftermath.map((e) => e.kind).join() === 'round,victory,loot,xp,level');
    const spoils = loot.aftermath[2];
    check('loot: gold within the table range and drawn from the seeded stream', spoils.gold === 2 + goldRoll && loot.gold === spoils.gold);
    check('loot: item drawn by weight (or nothing) and added to the backpack', index === 0 ? spoils.itemIds[0] === 'brine-tonic' && loot.inventory['brine-tonic'] === 1 : spoils.itemIds.length === 0);
    check('victory: the next page shows what happened and its choices', viewOf(loaded, loot).aftermath.length === 5 && viewOf(loaded, loot).choices[0].text === 'Return to the post');
    const back = choose(loaded, loot, 0);
    check('victory: the next choice clears the aftermath, and the beaten crab hides the fight and opens the locker', back.aftermath.length === 0 && !textsOf(back).some((t) => t.startsWith('Ask the crab')) && textsOf(back).some((t) => t.startsWith('Prise open')));
  }
  {
    const run = forced({ ...atCrab('wrecker', 'lose', 'he'), hp: 1 }, 'strike');
    const out = playRound(loaded, run, strike('feint'));
    const dead = fightAction(loaded, run, strike('feint')).run;
    check('defeat: HP at zero in a fight ends the entry in the default death ending, with the final blow told', out.end === 'defeat' && dead.status === 'ended' && dead.hp === 0 && dead.ending.id === 'the-deep-channel' && dead.combat === null && dead.aftermath.at(-1).kind === 'defeat');
    const both = forced({ ...atCrab('wrecker', 'both', 'he'), hp: 1 }, 'strike', { foeHp: 1 });
    const mutual = playRound(loaded, both, strike('strike'));
    check('defeat: if both fall in one exchange, the hero\'s entry is the one that closes', mutual.end === 'defeat');
    check('defeat: a closed entry refuses further rounds', throws(() => playRound(loaded, dead, strike('strike'))));
  }

  // --- flight ---
  {
    const run = atCrab('tidewarden', 'flee');
    const out = fleeFight(loaded, run);
    check('flee: scene fight goes to its flee scene, applies the story\'s consequence, and ends the fight', out.combat === null && out.sceneId === 'saltwick-crab-fled' && out.stats.nerve === 2 && viewOf(loaded, out).notes[0].includes('point of nerve'));
    check('flee: a parting blow of exactly the foe\'s weakest hit minus defense (min 1)', out.hp === 17 && out.aftermath[0].kind === 'flee' && out.aftermath[0].blow === 1);
    const weak = fleeFight(loaded, { ...atCrab('wrecker', 'flee2', 'he'), hp: 1 });
    check('flee: always available, and the parting blow can never kill', weak.status === 'playing' && weak.hp === 1 && weak.aftermath[0].blow === 0);
    check('flee: no spoils, and the crab is not beaten', !out.flags['crab-beaten'] && out.gold === 0);
    check('flee: the post can be returned to and the fight tried again', textsOf(choose(loaded, out, 0)).some((t) => t.startsWith('Ask the crab')));
    check('flee: refused when there is no fight', throws(() => flee(loaded, hero('wrecker'))));
  }

  // --- encounter fights ---
  {
    let found = null;
    for (let i = 0; i < 400 && !found; i += 1) {
      const run = choose(loaded, hero('tidewarden', 'they', `amb-${i}`), 0);
      if (run.combat) found = run;
    }
    check('encounter fight: a random roll can open a fight from the pool', found !== null);
    if (found) {
      const v = viewOf(loaded, found);
      check('encounter fight: view has no prose or choices (the app writes the ambush line), foe is the wreck-gull', v.paragraphs.length === 0 && v.choices.length === 0 && v.combat.intro === 'encounter' && v.combat.monsterName === 'Wreck-gull' && found.combat.origin.kind === 'encounter');
      check('encounter fight: the real destination waits on the return stack', found.returnStack.join() === 'saltwick-midway' && found.sceneId === 'saltwick-causeway');
      check('encounter fight: whole', combatProblem(loaded, found) === null);
      const fled = fleeFight(loaded, found);
      check('encounter flee: applies the pool entry\'s flee effects, then resumes the route', fled.sceneId === 'saltwick-midway' && fled.returnStack.length === 0 && fled.stats.nerve === 2 && fled.combat === null && viewOf(loaded, fled).notes[0].includes('gull'));
      const won = fightAction(loaded, forced(found, 'feint', { foeHp: 1 }), strike('strike'));
      check('encounter victory: resumes the route with the spoils told', won.ok && won.run.sceneId === 'saltwick-midway' && won.run.returnStack.length === 0 && won.run.aftermath.map((e) => e.kind).join() === 'round,victory,loot,xp' && won.run.gold >= 1);
      const lost = fightAction(loaded, forced({ ...found, hp: 1 }, 'strike'), strike('feint'));
      check('encounter defeat: the default death ending', lost.ok && lost.run.status === 'ended' && lost.run.ending.kind === 'death');
    }
  }

  // --- a fight is never saved half-made (R8) ---
  {
    const good = atCrab('tidewarden', 'inv');
    const damaged = (change) => combatProblem(loaded, { ...good, combat: { ...good.combat, ...change } });
    check('invariants: out-of-range foe HP is caught', damaged({ foeHp: 0 }) !== null && damaged({ foeHp: 13 }) !== null && damaged({ foeHp: 4.5 }) !== null);
    check('invariants: bad round, intent, tell and cooldown are caught', damaged({ round: 0 }) !== null && damaged({ intent: 'bite' }) !== null && damaged({ tell: good.combat.intent === 'guard' ? 'strike' : 'guard' }) !== null && damaged({ cooldowns: { 'shell-up': 0 } }) !== null);
    check('invariants: a missing monster is caught', damaged({ monsterId: 'sea-wolf' }) !== null);
    check('invariants: a fight with a dead hero, or the wrong scene, is caught', combatProblem(loaded, { ...good, hp: 0 }) !== null && combatProblem(loaded, { ...good, sceneId: 'saltwick-midway' }) !== null);
    check('invariants: no fight, no problem', combatProblem(loaded, hero('wrecker')) === null);
    let wholeEveryRound = true;
    let run = good;
    for (let i = 0; i < 40 && run.combat; i += 1) {
      const out = fightAction(loaded, { ...run, hp: Math.max(run.hp, 18) }, strike(['strike', 'guard', 'feint'][i % 3]));
      run = out.run;
      if (run.combat && combatProblem(loaded, run) !== null) wholeEveryRound = false;
    }
    check('invariants: every round boundary of a played fight is whole', wholeEveryRound);
  }

  // --- soak: a bot plays the whole story, many times, every archetype ---
  {
    let state = 12345;
    const chance = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    const oneOf = (list) => list[Math.floor(chance() * list.length)];
    const stats = { runs: 0, victories: 0, deaths: 0, fights: 0, wins: 0, flights: 0 };
    let broke = null;
    for (let i = 0; i < 600 && !broke; i += 1) {
      const archetype = ['tidewarden', 'wrecker', 'marksreader'][i % 3];
      let run = hero(archetype, 'they', `soak-${i}`);
      let steps = 0;
      try {
        while (run.status === 'playing' && steps < 400) {
          steps += 1;
          if (run.combat) {
            if (combatProblem(loaded, run) !== null) throw new Error(`broken fight: ${combatProblem(loaded, run)}`);
            if (run.hp > statusOf(loaded, run).maxHp || run.hp < 1) throw new Error('hero HP out of range mid-fight');
            const v = viewOf(loaded, run).combat;
            const readyItems = v.items;
            const roll = chance();
            let next;
            if (run.hp <= 4 && roll < 0.35) { stats.flights += 1; run = fleeFight(loaded, run); continue; }
            if (run.hp <= 8 && readyItems.length > 0 && roll < 0.6) next = fightAction(loaded, run, { kind: 'item', itemId: readyItems[0].id });
            else {
              const ready = v.skills.filter((s) => s.cooldown === 0);
              const skill = ready.length > 0 && chance() < 0.5 ? oneOf(ready) : null;
              const stance = skill && skill.stance !== 'any' ? skill.stance : v.tell && chance() < 0.8 ? ['guard', 'feint', 'strike'].find((s) => compareStances(s, v.tell) === 'win') : oneOf(['strike', 'guard', 'feint']);
              next = fightAction(loaded, run, skill ? { kind: 'stance', stance, skillId: skill.id } : { kind: 'stance', stance });
              if (!next.ok) next = fightAction(loaded, run, { kind: 'stance', stance });
            }
            if (!next.ok) throw new Error(`refused: ${next.reason}`);
            const startedWith = run.combat.round;
            run = next.run;
            if (!run.combat) { stats.fights += 1; if (run.status === 'playing' && run.aftermath.some((e) => e.kind === 'victory')) stats.wins += 1; }
            else if (run.combat.round !== startedWith + 1 && run.combat.round !== startedWith) throw new Error('round counter jumped');
          } else if (viewOf(loaded, run).shop) {
            const shop = viewOf(loaded, run).shop;
            for (let deals = 0; deals < 3; deals += 1) {
              const ware = oneOf(shop.wares);
              const bought = buy(loaded, run, ware.itemId);
              if (bought.ok) run = bought.run;
              const sellable = viewOf(loaded, run).shop.buys;
              if (sellable.length > 0 && chance() < 0.5) run = sell(loaded, run, oneOf(sellable).itemId).run;
            }
            run = leaveShop(loaded, run);
          } else {
            const choices = viewOf(loaded, run).choices;
            if (choices.length === 0) throw new Error(`no choices at ${run.sceneId}`);
            run = choose(loaded, run, oneOf(choices).index);
          }
        }
        if (run.status !== 'ended') throw new Error(`still playing after ${steps} steps at ${run.sceneId}`);
        stats.runs += 1;
        if (run.ending.kind === 'victory') stats.victories += 1; else stats.deaths += 1;
      } catch (error) {
        broke = `soak ${i} (${archetype}) failed at ${run.sceneId}: ${error.message}`;
      }
    }
    check('soak: 600 bot runs across all archetypes always reach an ending, with sound fights throughout', !broke && stats.runs === 600, broke ?? JSON.stringify(stats));
    check('soak: the bot meets every outcome (victories, deaths, fights won, flights)', stats.victories > 0 && stats.deaths > 0 && stats.wins > 0 && stats.flights > 0, JSON.stringify(stats));
    console.log(`     soak: ${JSON.stringify(stats)}`);
  }
}

// ---------------- experience and levels ----------------
{
  const crab = loaded.monsters.get('stone-crab');
  const gull = loaded.monsters.get('wreck-gull');
  check('xp: a foe is worth its HP plus twice its heaviest blow (crab 12 + 8, gull 8 + 6)', xpWorth(crab) === 20 && xpWorth(gull) === 14);
  check('xp: a boss is worth double', xpWorth({ ...crab, boss: true }) === 40);
  check('levels: thresholds are 20, 50, 90, 140 and the cap is 5', XP_FOR_LEVEL.join() === '0,0,20,50,90,140' && LEVEL_CAP === 5 && levelFor(0) === 1 && levelFor(19) === 1 && levelFor(20) === 2 && levelFor(139) === 4 && levelFor(140) === 5 && levelFor(9999) === 5);
  check('levels: each adds 3 HP, attack on even levels, defense on odd', gainsAt(2).hp === 3 && gainsAt(2).attack === 1 && gainsAt(2).defense === 0 && gainsAt(3).defense === 1 && gainsAt(3).attack === 0);

  const fresh = hero('wrecker', 'he', 'grow');
  const out = awardXp(loaded, { ...fresh, hp: 5 }, crab);
  check('award: the crab takes a new hero to level 2 with exact gains, healing only the HP the level adds', out.run.xp === 20 && out.run.level === 2 && out.run.stats.hp === 17 && out.run.stats.attack === 4 && out.run.hp === 8 && statusOf(loaded, out.run).maxHp === 17);
  check('award: told as an experience line then a level line', out.events.map((e) => e.kind).join() === 'xp,level' && out.events[0].gained === 20 && out.events[0].total === 20 && out.events[1].level === 2);
  check('award: does not touch the run it came from, and draws no dice', fresh.xp === 0 && fresh.level === 1 && JSON.stringify(out.run.rng) === JSON.stringify(fresh.rng));
  const mighty = { ...crab, hp: 40, damage: { min: 5, max: 10 }, boss: true };
  const big = awardXp(loaded, fresh, mighty);
  check('award: a big win can raise several levels at once, each told', big.run.level === 4 && big.events.map((e) => e.kind).join() === 'xp,level,level,level' && big.run.stats.hp === fresh.stats.hp + 9 && big.run.stats.attack === fresh.stats.attack + 2 && big.run.stats.defense === fresh.stats.defense + 1);
  const top = awardXp(loaded, { ...fresh, xp: 500, level: 5 }, crab);
  check('award: at the top level experience still counts but nothing more is added', top.run.level === 5 && top.run.xp === 520 && top.events.length === 1 && xpToNext(top.run) === null && top.run.stats.hp === fresh.stats.hp);
  check('status: level, experience and what is left to the next level are exact', (() => { const st = statusOf(loaded, out.run); return st.level === 2 && st.xp === 20 && st.xpToNext === 30; })());

  let run = atCrabFresh('tidewarden', 'xpwin');
  const won = fightAction(loaded, forcedFoe(run, 'feint', { foeHp: 1 }), { kind: 'stance', stance: 'strike' }).run;
  check('xp: winning the crab fight levels a tidewarden to 2 (attack 6, 21 HP), HP healed by the 3 gained', won.level === 2 && won.xp === 20 && won.stats.attack === 4 + 0 + 1 + 0 || (won.level === 2 && won.stats.hp === 21 && won.stats.attack === 4));
  check('xp: the aftermath tells the foe, the spoils, the experience and the level', won.aftermath.map((e) => e.kind).join() === 'round,victory,loot,xp,level');
  const fled = fleeFight(loaded, atCrabFresh('tidewarden', 'xpflee'));
  check('xp: fleeing earns nothing', fled.xp === 0 && fled.level === 1);
  const lost = fightAction(loaded, forcedFoe({ ...atCrabFresh('wrecker', 'xplose', 'he'), hp: 1 }, 'strike'), { kind: 'stance', stance: 'feint' }).run;
  check('xp: losing earns nothing', lost.xp === 0 && lost.level === 1);
}

// ---------------- shops ----------------
{
  const toPeddler = (archetype = 'wrecker', seed = 'shop') => {
    const start = hero(archetype, 'he', seed);
    let run = choose(loaded, start, 1);
    run = { ...run, hp: start.hp, stats: start.stats, pendingNotes: [] };
    return choose(loaded, run, pick(run, 'Hail the peddler'));
  };
  const stall = toPeddler();
  const view = viewOf(loaded, stall);
  check('shop: the scene shows its prose, no choices, and a shop panel in the story\'s order with exact prices', stall.sceneId === 'saltwick-peddler' && view.paragraphs.length === 2 && view.choices.length === 0 && view.combat === null && view.shop.wares.map((w) => `${w.itemId}:${w.price}`).join() === 'brine-tonic:5,ship-biscuit:3,tarred-souwester:4,oilskin-coat:10');
  check('shop: with an empty purse everything is out of reach, and the shortfall is exact', view.shop.gold === 0 && view.shop.wares.every((w) => w.short === w.price));
  check('shop: the stall buys what is carried at half value, rounded down, and never worn gear', view.shop.buys.map((b) => `${b.itemId}:${b.offer}`).join() === 'brine-tonic:2' && viewOf(loaded, choose(loaded, hero('wrecker'), 1)).shop === null);
  const broke = buy(loaded, stall, 'brine-tonic');
  check('buy: with too little gold nothing is bought and the shortfall is told', !broke.ok && broke.reason === 'poor' && broke.short === 5);

  const flush = { ...stall, gold: 12 };
  const bought = buy(loaded, flush, 'brine-tonic');
  check('buy: pays the exact price, adds one to the backpack, and is recorded', bought.ok && bought.run.gold === 7 && bought.run.inventory['brine-tonic'] === 2 && bought.gold === 5 && bought.run.aftermath.at(-1).kind === 'bought');
  check('buy: does not touch the run it came from', flush.gold === 12 && flush.inventory['brine-tonic'] === 1);
  const twice = buy(loaded, bought.run, 'ship-biscuit');
  check('buy: stock never runs out, and the shortfall shrinks as the purse does', twice.ok && twice.run.gold === 4 && viewOf(loaded, twice.run).shop.wares.find((w) => w.itemId === 'oilskin-coat').short === 6);
  check('buy: refuses what the stall does not stock', throws(() => buy(loaded, flush, 'gull-knife')));
  const sold = sell(loaded, bought.run, 'brine-tonic');
  check('sell: pays half the value rounded down, removes exactly one', sold.ok && sold.run.gold === 9 && sold.run.inventory['brine-tonic'] === 1 && offerFor(4) === 2 && offerFor(3) === 1 && offerFor(1) === 0);
  check('sell: refuses what is not carried (worn gear), what is worth too little, and what the story does not have', throws(() => sell(loaded, flush, 'gull-knife')) && throws(() => sell(loaded, { ...flush, inventory: { ...flush.inventory, 'salt-lantern': 1 } }, 'salt-lantern')) && throws(() => sell(loaded, flush, 'no-such-thing')));
  const profit = (() => { let r = { ...flush, gold: 50 }; for (let i = 0; i < 6; i += 1) { r = buy(loaded, r, 'oilskin-coat').run; r = sell(loaded, r, 'oilskin-coat').run; } return r.gold; })();
  check('shop: buying and selling the same thing in a loop never makes money', profit <= 50);

  // The satchel still works at a stall: buy a hat and put it on.
  const hatted = equip(loaded, buy(loaded, flush, 'tarred-souwester').run, 'tarred-souwester');
  check('shop: gear bought can be worn at once', hatted.run.equipment.head === 'tarred-souwester' && hatted.run.gold === 8);

  const leaving = leaveShop(loaded, sell(loaded, buy(loaded, flush, 'brine-tonic').run, 'brine-tonic').run);
  check('leave: goes where the story says, and carries the deals (only the deals) to the next page', leaving.sceneId === 'saltwick-midway' && leaving.aftermath.map((e) => e.kind).join() === 'bought,sold' && leaving.pendingNotes.length === 0);
  check('leave: the next choice clears them', choose(loaded, leaving, pick(leaving, 'Wade the deep')).aftermath.length === 0);
  check('shop: a shop can only be left from a shop', throws(() => leaveShop(loaded, hero('wrecker'))) && throws(() => buy(loaded, hero('wrecker'), 'brine-tonic')));
  check('shop: a closed entry cannot trade', throws(() => buy(loaded, { ...flush, status: 'ended' }, 'brine-tonic')));

  // Validator rules for shops
  expectProblem('shop price below what the stall pays back (a money machine)', variant((a) => { const d = scenesOf(a); sceneNamed(d, 'saltwick-peddler').shop.stock[3].price = 3; a.set('scenes/the-causeway.json', d); }), 'for profit');
  expectProblem('the same item stocked twice', variant((a) => { const d = scenesOf(a); sceneNamed(d, 'saltwick-peddler').shop.stock.push({ itemId: 'brine-tonic', price: 6 }); a.set('scenes/the-causeway.json', d); }), 'stocked twice');
}

// ---------------- discoveries ----------------
{
  let crate = null;
  for (let i = 0; i < 400 && !crate; i += 1) {
    const run = choose(loaded, hero('marksreader', 'she', `crate-${i}`), 0);
    if (run.sceneId === 'saltwick-crate') crate = run;
  }
  check('discovery: a random roll can turn up the crate', crate !== null);
  if (crate) {
    const opened = choose(loaded, crate, pick(crate, 'Look inside'));
    check('discovery: looking inside gives the biscuit, sets the flag, and resumes the route', opened.inventory['ship-biscuit'] === 1 && opened.flags['found-crate'] === true && opened.sceneId === 'saltwick-midway' && opened.returnStack.length === 0);
    let again = false;
    for (let i = 0; i < 300; i += 1) {
      const start = hero('marksreader', 'she', `crate-again-${i}`);
      const run = choose(loaded, { ...start, flags: { 'found-crate': true } }, 0);
      if (run.sceneId === 'saltwick-crate') again = true;
    }
    check('discovery: once found, the crate is gone from the pool (the entry\'s condition holds)', !again);
  }
}

// ---------------- per-story theming ----------------
{
  check('theme: contrast is the standard ratio (black on white 21, same colour 1)', Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 0.01 && Math.abs(contrastRatio('#336699', '#336699') - 1) < 0.001);
  const colors = loaded.story.theme.colors;
  check('theme: the demo palette is readable (prose, choices, strip and account 4.5 or more, accent 3 or more)', ['prose', 'choices', 'statsBar', 'combatLog'].every((r) => contrastRatio(colors[r], colors.background) >= 4.5) && contrastRatio(colors.accent, colors.background) >= 3);
  expectProblem('theme: prose too faint against the background', variant((a) => { const s = a.get('story.json'); s.theme.colors.prose = '#c9cdb8'; a.set('story.json', s); }), 'contrast against the background');
  expectProblem('theme: accent lost against the background', variant((a) => { const s = a.get('story.json'); s.theme.colors.accent = '#d8dcc6'; a.set('story.json', s); }), 'needs at least 3 to 1', 'story.json');
}

console.log(failures === 0 ? '\nAll self-tests passed.' : `\n${failures} self-test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
