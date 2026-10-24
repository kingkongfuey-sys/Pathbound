// Self-test for the record book: the SQL (run for real through Node's built-in SQLite), the browser fallback store,
// the save envelope and its integrity gates, and a soak that saves and reloads at every step of whole runs.
// The Capacitor glue is the one thing this cannot exercise; it needs a device.
import { DatabaseSync } from 'node:sqlite';
import { makeValidators, readStories, validateStory } from './content.mjs';
import { choose, fightAction, fleeFight, leaveShop, startRun, viewOf } from '../src/engine/play.ts';
import { buy, sell } from '../src/engine/shop.ts';
import { buildSaveWrite } from '../src/save/record.ts';
import { codexOf } from '../src/app/codex.ts';
import { DEFAULT_SETTINGS, SPEEDS, settingsFrom, speedCps } from '../src/app/settings.ts';
import { migrateRun, openSave, packSave, runProblem, SAVE_FORMAT, shapeProblem } from '../src/save/snapshot.ts';
import { createSqlStore } from '../src/save/sqliteStore.ts';
import { createDocumentStore } from '../src/save/documentStore.ts';
import { BookTooNewError } from '../src/save/types.ts';

const validators = makeValidators();
const raw = readStories().find((s) => s.folder === 'saltwick');
const { loaded } = validateStory(raw, validators);
if (!loaded) throw new Error('The saltwick demo story is not valid.');

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failures += 1;
}

/** A SqlDriver over node:sqlite with the same all-or-nothing batches the plugin gives. */
function nodeDriver(db = new DatabaseSync(':memory:')) {
  const inTransaction = (work) => {
    db.exec('BEGIN');
    try { work(); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  return {
    db,
    async script(sql) { inTransaction(() => db.exec(sql)); },
    async batch(statements) { inTransaction(() => { for (const s of statements) db.prepare(s.sql).run(...(s.params ?? [])); }); },
    async rows(sql, params = []) { return db.prepare(sql).all(...params).map((r) => ({ ...r })); },
  };
}
function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
}

const NOW = '2026-10-23T10:00:00.000Z';
const hero = (archetype = 'marksreader', seed = 'save-1') => startRun(loaded, { archetypeId: archetype, name: 'Wen', pronouns: 'they', seed });
const who = (id) => ({ runId: id, startedAt: NOW, appVersion: '0.6.0' });
const writeOf = (run, id = 'run-a', closes = null, at = NOW) => {
  const made = buildSaveWrite(loaded, run, who(id), closes, at);
  if ('problem' in made) throw new Error(`unexpected refusal: ${made.problem}`);
  return made.write;
};
const plain = (value) => JSON.parse(JSON.stringify(value));

/** A short visit to a shop: a few purchases and sales decided by `chance`, then out the door. */
function shopTrip(run, chance) {
  let now = run;
  for (let deals = 0; deals < 3; deals += 1) {
    const view = viewOf(loaded, now).shop;
    const ware = view.wares[Math.floor(chance() * view.wares.length)];
    const bought = buy(loaded, now, ware.itemId);
    if (bought.ok) now = bought.run;
    const sellable = viewOf(loaded, now).shop.buys;
    if (sellable.length > 0 && chance() < 0.5) now = sell(loaded, now, sellable[Math.floor(chance() * sellable.length)].itemId).run;
  }
  return leaveShop(loaded, now);
}

/** Take any run to its ending with a simple bot, calling `each` with every state along the way. */
function playOut(start, seedNumber, each) {
  let state = seedNumber;
  const chance = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  let run = start;
  for (let steps = 0; run.status === 'playing' && steps < 400; steps += 1) {
    if (run.combat) {
      if (run.hp <= 4 && chance() < 0.35) run = fleeFight(loaded, run);
      else {
        const stance = ['strike', 'guard', 'feint'][Math.floor(chance() * 3)];
        const out = fightAction(loaded, run, { kind: 'stance', stance });
        run = out.ok ? out.run : run;
      }
    } else if (viewOf(loaded, run).shop) {
      run = shopTrip(run, chance);
    } else {
      const choices = viewOf(loaded, run).choices;
      run = choose(loaded, run, choices[Math.floor(chance() * choices.length)].index);
    }
    each?.(run);
  }
  return run;
}

// ---------------- the shared book behaviour, run against both stores ----------------
async function bookSuite(label, makeStore) {
  const store = await makeStore();
  check(`${label}: an empty book has no open entry, history or unlocks`, (await store.readActive()) === null && (await store.entries()).length === 0 && (await store.unlockCounts()).item === 0);

  let run = hero();
  await store.save(writeOf(run));
  let row = await store.readActive();
  const opened = openSave(row, loaded);
  check(`${label}: the first page is saved and reads back whole`, opened.kind === 'ok' && JSON.stringify(opened.run) === JSON.stringify(run) && row.format === SAVE_FORMAT && row.contentVersion === 1);
  check(`${label}: a history row opens with the run`, (await store.entry('run-a'))?.outcome === 'open' && (await store.entries()).length === 1);
  const startCounts = await store.unlockCounts('run-a');
  check(`${label}: the tale and the starting gear are unlocked at once`, startCounts.story === 1 && startCounts.item >= 1 && startCounts.lore === 1, JSON.stringify(startCounts));

  // Play to a death or victory, saving every step.
  let last = run;
  const saved = [];
  playOut(run, 7, (r) => { saved.push(r); last = r; });
  for (const r of saved) await store.save(writeOf(r));
  const ended = await store.entry('run-a');
  check(`${label}: the last page closes the history row with an exact outcome`, ['victory', 'death'].includes(ended.outcome) && ended.endedAt === NOW && ended.endingTitle === last.ending.title && ended.choices === last.tally.choices && ended.rounds === last.tally.rounds && ended.gold === last.gold);
  check(`${label}: a closed entry is still resumable until it is dismissed`, (await store.readActive())?.runId === 'run-a');
  const before = await store.unlockCounts();
  await store.clearActive('run-a');
  const after = await store.unlockCounts();
  check(`${label}: dismissing keeps history and every unlock`, (await store.readActive()) === null && (await store.entry('run-a'))?.outcome === ended.outcome && JSON.stringify(before) === JSON.stringify(after) && after.monster >= 0);

  // A new entry over an open one closes the old one unfinished.
  await store.save(writeOf(hero('wrecker', 'b'), 'run-b', null, '2026-10-23T11:00:00.000Z'));
  await store.save(writeOf(hero('tidewarden', 'c'), 'run-c', { runId: 'run-b', at: '2026-10-23T12:00:00.000Z' }, '2026-10-23T12:00:00.000Z'));
  check(`${label}: beginning over an open entry abandons the old one and keeps one open slot`, (await store.entry('run-b'))?.outcome === 'abandoned' && (await store.readActive())?.runId === 'run-c');

  await store.abandon('run-c', NOW);
  check(`${label}: abandoning closes the row and frees the slot`, (await store.entry('run-c'))?.outcome === 'abandoned' && (await store.readActive()) === null);

  await store.save(writeOf(hero('wrecker', 'd'), 'run-d', null, '2026-10-23T13:00:00.000Z'));
  await store.setAside('test reason', NOW);
  check(`${label}: setting aside marks the entry lost and frees the slot`, (await store.entry('run-d'))?.outcome === 'lost' && (await store.readActive()) === null);

  // Unlocks and house rules.
  const all = await store.unlocks();
  check(`${label}: the codex can list every unlock, sorted, and it matches the counts`, all.length > 0 && all.every((u) => u.storyId === 'saltwick') && all.length === Object.values(await store.unlockCounts()).reduce((a, b) => a + b, 0) && all.some((u) => u.kind === 'story'));
  check(`${label}: a book with no rules set has none stored`, Object.keys(await store.settings()).length === 0);
  await store.setSetting('typewriter', 'quick');
  await store.setSetting('typewriter', 'slow');
  await store.setSetting('other', 'x');
  const rules = await store.settings();
  check(`${label}: a rule is kept, and changing it replaces it`, rules.typewriter === 'slow' && rules.other === 'x' && Object.keys(rules).length === 2);

  const list = await store.entries();
  check(`${label}: history lists newest first`, list.map((e) => e.id).join() === 'run-d,run-c,run-b,run-a', list.map((e) => e.id).join());
}

const sqlDriver = nodeDriver();
await bookSuite('sqlite', () => createSqlStore(sqlDriver));
await bookSuite('document', async () => createDocumentStore(memoryStorage()));
check('sqlite: the drawer holds the set-aside body', (await sqlDriver.rows('SELECT run_id, reason FROM damaged_saves')).some((r) => r.run_id === 'run-d' && r.reason === 'test reason'));

// ---------------- the database itself ----------------
{
  const driver = nodeDriver();
  await createSqlStore(driver);
  const again = await createSqlStore(driver);
  check('sqlite: opening an already-made book twice is harmless', (await again.entries()).length === 0 && (await driver.rows("SELECT value FROM meta WHERE key = 'schema'"))[0].value === '3');

  const store = await createSqlStore(driver);
  await store.save(writeOf(hero(), 'keep'));
  const good = (await store.readActive()).body;
  let refused = false;
  try {
    // The second statement breaks a CHECK constraint, so the first must not survive either.
    await driver.batch([
      { sql: "UPDATE active_run SET body = 'overwritten' WHERE slot = 1" },
      { sql: "INSERT INTO runs (id, story_id, story_title, hero_name, archetype_name, seed, started_at, outcome, chapter_index, chapter_count, choices, rounds, felled, fled, gold) VALUES ('x','s','t','h','a','s','n','nonsense',0,1,0,0,0,0,0)" },
    ]);
  } catch { refused = true; }
  check('sqlite: a failing statement rolls the whole save back', refused && (await store.readActive()).body === good);

  const newer = nodeDriver();
  newer.db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO meta VALUES ('schema', '99');");
  const objects = () => newer.db.prepare('SELECT COUNT(*) AS n FROM sqlite_master').get().n;
  const before = objects();
  let tooNew = false;
  try { await createSqlStore(newer); } catch (e) { tooNew = e instanceof BookTooNewError; }
  check('sqlite: a book from a newer build is refused, untouched', tooNew && objects() === before && newer.db.prepare("SELECT value FROM meta WHERE key = 'schema'").get().value === '99');
}

// ---------------- reading saves back: the gates ----------------
{
  const run = hero();
  const row = writeOf(run).active;
  const mutate = (change) => { const copy = plain(run); change(copy); return { ...row, body: packSave('0.5.0', row.runId, NOW, copy) }; };
  const verdict = (r) => openSave(r, loaded).kind;

  check('gate: a sound save opens', verdict(row) === 'ok');
  check('gate: a truncated save is damaged, not a crash', verdict({ ...row, body: row.body.slice(0, 40) }) === 'damaged');
  check('gate: text that is not an entry is damaged', verdict({ ...row, body: '[1,2,3]' }) === 'damaged' && verdict({ ...row, body: '' }) === 'damaged');
  check('gate: a newer save format is "newer", not "damaged"', verdict({ ...row, format: SAVE_FORMAT + 1 }) === 'newer');
  check('gate: a save made against newer story content is "newer"', verdict(mutate((r) => { r.contentVersion = 2; })) === 'newer');
  check('gate: a header that disagrees with the book is damaged', verdict({ ...row, runId: 'someone-else' }) === 'damaged');
  check('gate: a missing field is damaged', verdict(mutate((r) => { delete r.tally; })) === 'damaged' && shapeProblem({}) !== null);
  check('gate: a wrong type is damaged', verdict(mutate((r) => { r.hp = '12'; })) === 'damaged' && verdict(mutate((r) => { r.gold = -1; })) === 'damaged');
  check('gate: an unknown scene is damaged', verdict(mutate((r) => { r.sceneId = 'nowhere'; })) === 'damaged');
  check('gate: an unknown item or one in the wrong slot is damaged', verdict(mutate((r) => { r.inventory = { ghost: 1 }; })) === 'damaged' && verdict(mutate((r) => { r.equipment.head = r.equipment.weapon; })) === 'damaged');
  check('gate: HP above the maximum is damaged', verdict(mutate((r) => { r.hp = 999; })) === 'damaged');
  check('gate: a closed entry with no ending, or a live one with an ending, is damaged', verdict(mutate((r) => { r.status = 'ended'; })) === 'damaged' && verdict(mutate((r) => { r.ending = { id: 'x', kind: 'death', title: 't' }; })) === 'damaged');
  check('gate: a broken random stream is damaged', verdict(mutate((r) => { r.rng = { combat: [1, 2] }; })) === 'damaged');

  // Older content that still fits carries forward.
  const olderStory = { ...loaded, story: { ...loaded.story, version: 2 } };
  const carried = openSave(row, olderStory);
  check('gate: older content that still fits is carried forward', carried.kind === 'ok' && carried.run.contentVersion === 2);
}

// ---------------- Stage 5 books and saves carry forward ----------------
{
  // A format-1 entry (made before experience existed) opens at level 1 with no experience.
  const run = hero();
  const old = plain(run); delete old.xp; delete old.level;
  const row = { ...writeOf(run).active, format: 1, body: packSave('0.5.0', 'run-a', NOW, old).replace('"format":2', '"format":1') };
  const opened = openSave(row, loaded);
  check('migrate: a Stage 5 save opens, at level 1 with no experience', opened.kind === 'ok' && opened.run.level === 1 && opened.run.xp === 0);
  check('migrate: migrateRun adds the fields and leaves the original alone', (() => { const m = migrateRun(1, old); return m.level === 1 && m.xp === 0 && old.level === undefined; })());
  check('migrate: a format-2 run passes through unchanged', JSON.stringify(migrateRun(2, plain(run))) === JSON.stringify(plain(run)));
  check('gate: a current-format save missing its level is damaged', (() => { const bad = plain(run); delete bad.level; return openSave({ ...writeOf(run).active, body: packSave('0.6.0', 'run-a', NOW, bad) }, loaded).kind === 'damaged'; })());
  check('gate: a level that disagrees with experience is damaged', (() => { const bad = plain(run); bad.level = 3; return openSave({ ...writeOf(run).active, body: packSave('0.6.0', 'run-a', NOW, bad) }, loaded).kind === 'damaged'; })());

  // A schema-1 book (no level column) gains one, keeping its history.
  const driver = nodeDriver();
  await createSqlStore(driver);
  const store0 = await createSqlStore(driver);
  await store0.save(writeOf(hero(), 'old-run'));
  driver.db.exec('ALTER TABLE runs DROP COLUMN level; DROP TABLE settings;');
  driver.db.exec("UPDATE meta SET value = '1' WHERE key = 'schema';");
  const store1 = await createSqlStore(driver);
  const history = await store1.entries();
  check('migrate: a schema-1 book gains the level column and the settings table, keeps its history, and reads it as level 1', (await driver.rows("SELECT value FROM meta WHERE key = 'schema'"))[0].value === '3' && history.length === 1 && history[0].level === 1);

  // The browser document store defaults a missing level.
  const storage = memoryStorage();
  const docs = await createDocumentStore(storage);
  await docs.save(writeOf(hero(), 'doc-run'));
  check('migrate: document store history carries the level', (await docs.entries())[0].level === 1);
}

// ---------------- never saving a broken mid-fight state ----------------
{
  let run = hero('wrecker');
  for (let i = 0; i < 20 && !run.combat; i += 1) {
    if (viewOf(loaded, run).shop) { run = leaveShop(loaded, run); continue; }
    const choices = viewOf(loaded, run).choices;
    run = choose(loaded, run, choices[i % choices.length].index);
  }
  check('guard: the soak found a fight to test against', run.combat !== null || run.status === 'ended');
  if (run.combat) {
    check('guard: a whole mid-fight state saves and resumes with the foe\'s stance intact', (() => {
      const w = writeOf(run);
      const back = openSave(w.active, loaded);
      return back.kind === 'ok' && back.run.combat.intent === run.combat.intent && back.run.combat.foeHp === run.combat.foeHp;
    })());
    const broken = { ...run, combat: { ...run.combat, foeHp: 0 } };
    const made = buildSaveWrite(loaded, broken, who('x'), null, NOW);
    check('guard: a corrupt mid-fight state is refused before it is written', 'problem' in made && runProblem(loaded, broken) !== null);
    const dead = { ...run, hp: 0 };
    check('guard: a fight with a dead hero is refused', 'problem' in buildSaveWrite(loaded, dead, who('x'), null, NOW));
  }
}

// ---------------- soak: save and reload at every step; a death keeps everything ----------------
{
  let problems = null;
  let deaths = 0;
  let victories = 0;
  const totals = { choices: 0, rounds: 0, felled: 0, fled: 0 };
  for (let i = 0; i < 150 && !problems; i += 1) {
    const archetype = ['tidewarden', 'wrecker', 'marksreader'][i % 3];
    const store = await createSqlStore(nodeDriver());
    const id = `soak-${i}`;
    const start = hero(archetype, `soak-${i}`);
    const straight = playOut(start, 1000 + i);

    // Same choices, but the run is written to the book and read back after every single step.
    let run = start;
    await store.save(writeOf(run, id));
    let state = 1000 + i;
    const chance = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    for (let steps = 0; run.status === 'playing' && steps < 400 && !problems; steps += 1) {
      if (run.combat) {
        if (run.hp <= 4 && chance() < 0.35) run = fleeFight(loaded, run);
        else {
          const stance = ['strike', 'guard', 'feint'][Math.floor(chance() * 3)];
          const out = fightAction(loaded, run, { kind: 'stance', stance });
          run = out.ok ? out.run : run;
        }
      } else if (viewOf(loaded, run).shop) {
        run = shopTrip(run, chance);
      } else {
        const choices = viewOf(loaded, run).choices;
        run = choose(loaded, run, choices[Math.floor(chance() * choices.length)].index);
      }
      await store.save(writeOf(run, id));
      const back = openSave(await store.readActive(), loaded);
      if (back.kind !== 'ok') problems = `step ${steps} of soak ${i} did not read back: ${back.reason}`;
      else if (JSON.stringify(back.run) !== JSON.stringify(run)) problems = `step ${steps} of soak ${i} read back differently`;
      else run = back.run;
    }
    if (!problems && JSON.stringify(run) !== JSON.stringify(straight)) problems = `soak ${i}: reloading every step changed the outcome`;
    if (!problems) {
      const entry = await store.entry(id);
      if (entry.outcome !== run.ending.kind || entry.endedAt === null) problems = `soak ${i}: history row doesn't match the ending`;
      const fresh = await store.unlockCounts(id);
      if (!problems && (fresh.story !== 1 || fresh.item < 1)) problems = `soak ${i}: unlocks missing at the end`;
      for (const k of Object.keys(totals)) totals[k] += run.tally[k];
      if (run.ending.kind === 'death') deaths += 1; else victories += 1;
    }
  }
check('tally: choices, rounds, foes brought down and flights are all counted', totals.choices > 150 && totals.rounds > 0 && totals.felled > 0 && totals.fled >= 0 && totals.rounds >= totals.felled, JSON.stringify(totals));
  check('soak: 150 runs saved and reloaded at every step replay identically, history and unlocks intact', !problems && deaths > 0 && victories > 0, problems ?? `deaths ${deaths}, victories ${victories}`);
}

// ---------------- house rules and the codex, pure parts ----------------
{
  check('rules: nothing stored gives the defaults', JSON.stringify(settingsFrom({})) === JSON.stringify(DEFAULT_SETTINGS));
  check('rules: a value this build does not know falls back, never breaks', settingsFrom({ typewriter: 'ludicrous' }).typewriter === 'steady' && settingsFrom({ typewriter: '' }).typewriter === 'steady');
  check('rules: every speed round-trips, slowest to fastest, and instant is zero', SPEEDS.every((sp) => settingsFrom({ typewriter: sp }).typewriter === sp) && speedCps('slow') < speedCps('steady') && speedCps('steady') < speedCps('quick') && speedCps('instant') === 0);

  const none = codexOf(loaded, []);
  check('codex: with nothing unlocked, nothing is listed, and the totals are the story\'s own', none.foes.length === 0 && none.items.length === 0 && none.lore.length === 0 && !none.taleMet && none.foesTotal === loaded.monsters.size && none.itemsTotal === loaded.items.size && none.loreTotal === loaded.story.loreEntries.length);
  const some = codexOf(loaded, [
    { storyId: 'saltwick', kind: 'story', entryId: 'saltwick' },
    { storyId: 'saltwick', kind: 'monster', entryId: [...loaded.monsters.keys()][1] },
    { storyId: 'saltwick', kind: 'item', entryId: 'not-an-item' },
    { storyId: 'elsewhere', kind: 'monster', entryId: [...loaded.monsters.keys()][0] },
  ]);
  check('codex: only this story\'s unlocks count, unknown ids are left out, and the tale is met', some.taleMet && some.foes.length === 1 && some.foes[0].id === [...loaded.monsters.keys()][1] && some.items.length === 0);

  // After whole runs, everything unlocked is a thing the story defines, and the codex lists all of it.
  let stray = null;
  for (let i = 0; i < 40 && !stray; i += 1) {
    const store = await createSqlStore(nodeDriver());
    let run = hero(['tidewarden', 'wrecker', 'marksreader'][i % 3], `codex-${i}`);
    await store.save(writeOf(run, `c-${i}`));
    playOut(run, 500 + i, () => undefined);
    const saved = [];
    playOut(run, 500 + i, (r) => saved.push(r));
    for (const r of saved) await store.save(writeOf(r, `c-${i}`));
    const unlocked = await store.unlocks();
    const view = codexOf(loaded, unlocked);
    const count = (k) => unlocked.filter((u) => u.kind === k).length;
    if (view.foes.length !== count('monster') || view.items.length !== count('item') || view.lore.length !== count('lore')) stray = `run ${i}: the codex lists ${view.foes.length}/${view.items.length}/${view.lore.length} but the book holds ${count('monster')}/${count('item')}/${count('lore')}`;
  }
  check('codex: across 40 played runs, every unlock is something the story defines, and the codex lists all of it', stray === null, stray ?? '');
}

console.log(failures === 0 ? '\nAll save tests passed.' : `\n${failures} save test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
