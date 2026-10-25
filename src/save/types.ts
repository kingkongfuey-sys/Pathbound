// The shapes the record book speaks in. A run is kept in three places at once, always changed together in one
// transaction: the open entry (the whole run, as saved), the history row (a few exact numbers about it, so the ledger
// can list runs without loading stories), and the codex unlocks (what has been met, which outlives the run).
// Pure types only; nothing here touches the database, the DOM or Capacitor.

export type SqlValue = string | number | null;

export interface SqlStatement {
  sql: string;
  params?: SqlValue[];
}

/**
 * The only thing the SQL store needs from a database. `script` runs plain statements (schema work) as one
 * transaction; `batch` runs parameterised statements as one transaction, all or nothing; `rows` reads.
 */
export interface SqlDriver {
  script(sql: string): Promise<void>;
  batch(statements: SqlStatement[]): Promise<void>;
  rows(sql: string, params?: SqlValue[]): Promise<Array<Record<string, SqlValue>>>;
}

/** How an entry stands. `open` is still being played (or its closing account not yet read). */
export type EntryOutcome = 'open' | 'victory' | 'death' | 'abandoned' | 'lost';

export type UnlockKind = 'story' | 'monster' | 'item' | 'lore';

export interface Unlock {
  storyId: string;
  kind: UnlockKind;
  entryId: string;
}

export type UnlockCounts = Record<UnlockKind, number>;

/** One line of run history. Every number is exact. */
export interface EntryRecord {
  id: string;
  storyId: string;
  storyTitle: string;
  heroName: string;
  archetypeName: string;
  seed: string;
  startedAt: string;
  endedAt: string | null;
  outcome: EntryOutcome;
  endingTitle: string | null;
  /** Counts from zero, like the strip. */
  chapterIndex: number;
  chapterCount: number;
  choices: number;
  rounds: number;
  felled: number;
  fled: number;
  gold: number;
  /** The level the hero stood at. */
  level: number;
}

/** The open entry as stored: a few columns to judge it by without parsing, and the body. */
export interface ActiveRow {
  runId: string;
  storyId: string;
  format: number;
  appVersion: string;
  contentVersion: number;
  savedAt: string;
  body: string;
}

/** Everything one save changes. The store applies it in a single transaction. */
export interface SaveWrite {
  active: ActiveRow;
  entry: EntryRecord;
  unlocks: Unlock[];
  /** An earlier entry still open that this save closes unfinished (beginning a new entry over an old one). */
  closes: { runId: string; at: string } | null;
}

export interface Store {
  readonly kind: 'sqlite' | 'document';
  readActive(): Promise<ActiveRow | null>;
  save(write: SaveWrite): Promise<void>;
  /** Remove the open entry once it has been dealt with. The history row is untouched. */
  clearActive(runId: string): Promise<void>;
  /** Close an open entry unfinished and remove it. */
  abandon(runId: string, at: string): Promise<void>;
  /** Move an unreadable open entry to the drawer (kept, never deleted), mark it lost, and clear the slot. */
  setAside(reason: string, at: string): Promise<void>;
  /** Newest first. */
  entries(): Promise<EntryRecord[]>;
  entry(runId: string): Promise<EntryRecord | null>;
  /** Everything unlocked so far, for the codex. */
  unlocks(): Promise<Unlock[]>;
  /** Settings as stored: plain text under a key. Reading them back is `settingsFrom`'s job. */
  settings(): Promise<Record<string, string>>;
  setSetting(key: string, value: string): Promise<void>;
  /** Everything unlocked so far, or only what the given run was the first to meet. */
  unlockCounts(firstRunId?: string): Promise<UnlockCounts>;
}

/** Thrown when the book on disk was made by a newer Pathbound than this one. Nothing is changed or deleted. */
export class BookTooNewError extends Error {
  constructor(found: number, known: number) {
    super(`The record book is schema ${found}, and this build only knows schema ${known}.`);
  }
}
