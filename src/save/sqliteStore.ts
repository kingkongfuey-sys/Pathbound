// The record book on SQLite. All of its SQL lives in this one file, written against the tiny SqlDriver interface so
// the same statements run on the phone (through Capacitor) and in the self-test (through Node's built-in SQLite).
// Design: one table for the open entry (a single slot, so there is never any doubt which run resumes), one for run
// history, one for codex unlocks, one drawer for saves that could not be read. Every save is one transaction that
// touches all of them, so a crash can leave the book at the old state or the new one and nothing in between.
// Schema changes are numbered migrations applied in order; a book newer than this build is refused untouched.
import { BookTooNewError } from './types.ts';
import type { ActiveRow, EntryOutcome, EntryRecord, SaveWrite, SqlDriver, SqlStatement, SqlValue, Store, UnlockCounts, UnlockKind } from './types.ts';

/** Each entry takes the book from schema n to n + 1. Never edit one that has shipped; add another. */
const MIGRATIONS: string[] = [
  `CREATE TABLE active_run (
    slot INTEGER PRIMARY KEY CHECK (slot = 1),
    run_id TEXT NOT NULL,
    story_id TEXT NOT NULL,
    format INTEGER NOT NULL,
    app_version TEXT NOT NULL,
    content_version INTEGER NOT NULL,
    saved_at TEXT NOT NULL,
    body TEXT NOT NULL
  );
  CREATE TABLE runs (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    story_title TEXT NOT NULL,
    hero_name TEXT NOT NULL,
    archetype_name TEXT NOT NULL,
    seed TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    outcome TEXT NOT NULL CHECK (outcome IN ('open', 'victory', 'death', 'abandoned', 'lost')),
    ending_title TEXT,
    chapter_index INTEGER NOT NULL,
    chapter_count INTEGER NOT NULL,
    choices INTEGER NOT NULL,
    rounds INTEGER NOT NULL,
    felled INTEGER NOT NULL,
    fled INTEGER NOT NULL,
    gold INTEGER NOT NULL
  );
  CREATE TABLE codex_unlocks (
    story_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    entry_id TEXT NOT NULL,
    first_run_id TEXT NOT NULL,
    unlocked_at TEXT NOT NULL,
    PRIMARY KEY (story_id, kind, entry_id)
  );
  CREATE TABLE damaged_saves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    set_aside_at TEXT NOT NULL,
    reason TEXT NOT NULL,
    run_id TEXT NOT NULL,
    body TEXT NOT NULL
  );`,
  // Schema 2 (Stage 6): the level the hero stood at. Entries kept before levels existed stand at level 1.
  'ALTER TABLE runs ADD COLUMN level INTEGER NOT NULL DEFAULT 1;',
  // Schema 3 (Stage 7): house rules, one row per setting.
  'CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);',
];

const META = 'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)';

function text(row: Record<string, SqlValue>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new Error(`The record book returned no text for "${key}".`);
  return value;
}
function whole(row: Record<string, SqlValue>, key: string): number {
  const value = row[key];
  if (typeof value !== 'number') throw new Error(`The record book returned no number for "${key}".`);
  return value;
}
function maybeText(row: Record<string, SqlValue>, key: string): string | null {
  const value = row[key];
  return typeof value === 'string' ? value : null;
}

function entryFrom(row: Record<string, SqlValue>): EntryRecord {
  return {
    id: text(row, 'id'),
    storyId: text(row, 'story_id'),
    storyTitle: text(row, 'story_title'),
    heroName: text(row, 'hero_name'),
    archetypeName: text(row, 'archetype_name'),
    seed: text(row, 'seed'),
    startedAt: text(row, 'started_at'),
    endedAt: maybeText(row, 'ended_at'),
    outcome: text(row, 'outcome') as EntryOutcome,
    endingTitle: maybeText(row, 'ending_title'),
    chapterIndex: whole(row, 'chapter_index'),
    chapterCount: whole(row, 'chapter_count'),
    choices: whole(row, 'choices'),
    rounds: whole(row, 'rounds'),
    felled: whole(row, 'felled'),
    fled: whole(row, 'fled'),
    gold: whole(row, 'gold'),
    level: whole(row, 'level'),
  };
}

/** Open the book on `driver`, creating or migrating the schema first. */
export async function createSqlStore(driver: SqlDriver): Promise<Store> {
  await driver.script(META);
  const found = await driver.rows('SELECT value FROM meta WHERE key = ?', ['schema']);
  const first = found[0];
  const version = first ? Number(first['value']) : 0;
  if (!Number.isInteger(version) || version < 0) throw new Error('The record book has a schema number that makes no sense.');
  if (version > MIGRATIONS.length) throw new BookTooNewError(version, MIGRATIONS.length);
  for (let next = version; next < MIGRATIONS.length; next += 1) {
    // The version bump rides in the same script as the change, so they land together or not at all.
    await driver.script(`${MIGRATIONS[next]}\nINSERT OR REPLACE INTO meta (key, value) VALUES ('schema', '${next + 1}');`);
  }

  return {
    kind: 'sqlite',

    async readActive() {
      const rows = await driver.rows('SELECT run_id, story_id, format, app_version, content_version, saved_at, body FROM active_run WHERE slot = 1');
      const row = rows[0];
      if (!row) return null;
      const active: ActiveRow = {
        runId: text(row, 'run_id'),
        storyId: text(row, 'story_id'),
        format: whole(row, 'format'),
        appVersion: text(row, 'app_version'),
        contentVersion: whole(row, 'content_version'),
        savedAt: text(row, 'saved_at'),
        body: text(row, 'body'),
      };
      return active;
    },

    async save({ active, entry, unlocks, closes }: SaveWrite) {
      const set: SqlStatement[] = [];
      if (closes) {
        set.push({
          sql: "UPDATE runs SET outcome = 'abandoned', ended_at = ? WHERE id = ? AND outcome = 'open'",
          params: [closes.at, closes.runId],
        });
      }
      set.push({
        sql: `INSERT INTO active_run (slot, run_id, story_id, format, app_version, content_version, saved_at, body)
              VALUES (1, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(slot) DO UPDATE SET run_id = excluded.run_id, story_id = excluded.story_id, format = excluded.format,
                app_version = excluded.app_version, content_version = excluded.content_version, saved_at = excluded.saved_at, body = excluded.body`,
        params: [active.runId, active.storyId, active.format, active.appVersion, active.contentVersion, active.savedAt, active.body],
      });
      set.push({
        sql: `INSERT INTO runs (id, story_id, story_title, hero_name, archetype_name, seed, started_at, ended_at, outcome, ending_title,
                chapter_index, chapter_count, choices, rounds, felled, fled, gold, level)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET ended_at = excluded.ended_at, outcome = excluded.outcome, ending_title = excluded.ending_title,
                chapter_index = excluded.chapter_index, chapter_count = excluded.chapter_count, choices = excluded.choices,
                rounds = excluded.rounds, felled = excluded.felled, fled = excluded.fled, gold = excluded.gold, level = excluded.level`,
        params: [
          entry.id, entry.storyId, entry.storyTitle, entry.heroName, entry.archetypeName, entry.seed, entry.startedAt, entry.endedAt,
          entry.outcome, entry.endingTitle, entry.chapterIndex, entry.chapterCount, entry.choices, entry.rounds, entry.felled, entry.fled, entry.gold, entry.level,
        ],
      });
      for (const unlock of unlocks) {
        set.push({
          sql: 'INSERT OR IGNORE INTO codex_unlocks (story_id, kind, entry_id, first_run_id, unlocked_at) VALUES (?, ?, ?, ?, ?)',
          params: [unlock.storyId, unlock.kind, unlock.entryId, entry.id, active.savedAt],
        });
      }
      await driver.batch(set);
    },

    async clearActive(runId) {
      await driver.batch([{ sql: 'DELETE FROM active_run WHERE run_id = ?', params: [runId] }]);
    },

    async abandon(runId, at) {
      await driver.batch([
        { sql: "UPDATE runs SET outcome = 'abandoned', ended_at = ? WHERE id = ? AND outcome = 'open'", params: [at, runId] },
        { sql: 'DELETE FROM active_run WHERE run_id = ?', params: [runId] },
      ]);
    },

    async setAside(reason, at) {
      await driver.batch([
        { sql: 'INSERT INTO damaged_saves (set_aside_at, reason, run_id, body) SELECT ?, ?, run_id, body FROM active_run WHERE slot = 1', params: [at, reason] },
        { sql: "UPDATE runs SET outcome = 'lost', ended_at = ? WHERE outcome = 'open' AND id IN (SELECT run_id FROM active_run WHERE slot = 1)", params: [at] },
        { sql: 'DELETE FROM active_run WHERE slot = 1' },
      ]);
    },

    async entries() {
      const rows = await driver.rows('SELECT * FROM runs ORDER BY started_at DESC, id DESC');
      return rows.map(entryFrom);
    },

    async entry(runId) {
      const rows = await driver.rows('SELECT * FROM runs WHERE id = ?', [runId]);
      const row = rows[0];
      return row ? entryFrom(row) : null;
    },

    async unlocks() {
      const rows = await driver.rows('SELECT story_id, kind, entry_id FROM codex_unlocks ORDER BY story_id, kind, entry_id');
      return rows.map((row) => ({ storyId: text(row, 'story_id'), kind: text(row, 'kind') as UnlockKind, entryId: text(row, 'entry_id') }));
    },

    async settings() {
      const rows = await driver.rows('SELECT key, value FROM settings');
      const found: Record<string, string> = {};
      for (const row of rows) found[text(row, 'key')] = text(row, 'value');
      return found;
    },

    async setSetting(key, value) {
      await driver.batch([{ sql: 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', params: [key, value] }]);
    },

    async unlockCounts(firstRunId) {
      const rows =
        firstRunId === undefined
          ? await driver.rows('SELECT kind, COUNT(*) AS n FROM codex_unlocks GROUP BY kind')
          : await driver.rows('SELECT kind, COUNT(*) AS n FROM codex_unlocks WHERE first_run_id = ? GROUP BY kind', [firstRunId]);
      const counts: UnlockCounts = { story: 0, monster: 0, item: 0, lore: 0 };
      for (const row of rows) counts[text(row, 'kind') as UnlockKind] = whole(row, 'n');
      return counts;
    },
  };
}
