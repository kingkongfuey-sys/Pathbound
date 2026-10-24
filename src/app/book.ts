// The record book as the rest of the app sees it: one place that owns the store, the order of writes, and the
// small cache the home screen reads. Design: saves are write-behind but strictly ordered. A screen changes the run,
// calls `commit`, and carries on; the write joins a single queue, so two saves can never land out of order and the
// UI never waits on the disk. Anything that needs the disk to be up to date (resuming, the ledger, the closing
// account) first waits for the queue to drain. Every write is checked with `runProblem` before it is queued, so a
// broken run is refused here and the last good save stays untouched. Choosing the store by platform happens once,
// in `openBook`: SQLite on the phone, a JSON document in a desktop browser.
import { Capacitor } from '@capacitor/core';
import { ContentError, loadStory } from '../content/loader.ts';
import type { LoadedStory } from '../content/types.ts';
import { voice } from '../copy/voice.ts';
import { buildSaveWrite } from '../save/record.ts';
import { destroyCapacitorBook, openCapacitorDriver } from '../save/capacitorDriver.ts';
import { createDocumentStore } from '../save/documentStore.ts';
import { openSave } from '../save/snapshot.ts';
import { createSqlStore } from '../save/sqliteStore.ts';
import { BookTooNewError } from '../save/types.ts';
import type { EntryRecord, SaveWrite, Store, UnlockCounts } from '../save/types.ts';
import { codexOf } from './codex.ts';
import type { CodexStory } from './codex.ts';
import { DEFAULT_SETTINGS, settingsFrom } from './settings.ts';
import type { Settings } from './settings.ts';
import { resumedSession } from './session.ts';
import type { Session } from './session.ts';

/** The book could not be opened. `tooNew` means it is fine but newer than this build, so nothing should touch it. */
export class BookError extends Error {
  readonly tooNew: boolean;
  constructor(message: string, tooNew: boolean) {
    super(message);
    this.tooNew = tooNew;
  }
}

/** What the home screen needs to know about the open entry, without touching the disk. */
export interface OpenEntry {
  runId: string;
  entry: EntryRecord | null;
  /** The entry has ended (victory or death) but its closing account hasn't been read yet. */
  closed: boolean;
}

export type Resumed =
  | { kind: 'none' }
  | { kind: 'ok'; loaded: LoadedStory; session: Session }
  | { kind: 'damaged' | 'newer' | 'unplayable'; reason: string };

let store: Store | null = null;
let queue: Promise<void> = Promise.resolve();
let openEntry: OpenEntry | null = null;
let settings: Settings = DEFAULT_SETTINGS;

const BROWSER_KEY = 'pathbound.book';

function reasonText(reason: unknown): string {
  if (reason instanceof Error && reason.message.trim() !== '') return reason.message;
  if (typeof reason === 'string' && reason.trim() !== '') return reason;
  return voice.fatal.unknown;
}

function theStore(): Store {
  if (!store) throw new Error('The record book has not been opened yet.');
  return store;
}

/** Run `job` after every earlier write has finished. A failure reaches the caller and does not jam the queue. */
function serial<T>(job: (s: Store) => Promise<T>): Promise<T> {
  const result = queue.then(() => job(theStore()));
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** Wait until everything queued so far has been written (or has failed). */
export function settled(): Promise<void> {
  return queue;
}

async function refreshOpenEntry(): Promise<void> {
  const s = theStore();
  const row = await s.readActive();
  if (!row) {
    openEntry = null;
    return;
  }
  const entry = await s.entry(row.runId);
  openEntry = { runId: row.runId, entry, closed: entry !== null && (entry.outcome === 'victory' || entry.outcome === 'death') };
}

export async function openBook(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) store = await createSqlStore(await openCapacitorDriver());
    else store = createDocumentStore(window.localStorage);
    settings = settingsFrom(await store.settings());
    await refreshOpenEntry();
  } catch (reason) {
    store = null;
    throw new BookError(reasonText(reason), reason instanceof BookTooNewError);
  }
}

/** The last resort when the book itself cannot be opened: empty it and start again. Never called without asking. */
export async function freshBook(): Promise<void> {
  if (Capacitor.isNativePlatform()) await destroyCapacitorBook();
  else window.localStorage.removeItem(BROWSER_KEY);
  queue = Promise.resolve();
  openEntry = null;
  settings = DEFAULT_SETTINGS;
  await openBook();
}

/** The open entry as of the last change this page made or read. Synchronous, for building the home screen. */
export function currentEntry(): OpenEntry | null {
  return openEntry;
}

function queueSave(loaded: LoadedStory, session: Session, closes: SaveWrite['closes']): void {
  const made = buildSaveWrite(loaded, session.run, { runId: session.runId, startedAt: session.startedAt, appVersion: __APP_VERSION__ }, closes, new Date().toISOString());
  if ('problem' in made) {
    session.saveTrouble = voice.book.refused(made.problem);
    return;
  }
  const { write } = made;
  openEntry = { runId: write.entry.id, entry: write.entry, closed: write.entry.outcome === 'victory' || write.entry.outcome === 'death' };
  serial((s) => s.save(write)).then(
    () => {
      session.saveTrouble = null;
    },
    (reason: unknown) => {
      session.saveTrouble = voice.book.notSaved(reasonText(reason));
    },
  );
}

/** Save the session's run. Call after every change to it; the write is queued and the caller carries on. */
export function commit(loaded: LoadedStory, session: Session): void {
  queueSave(loaded, session, null);
}

/** The first save of a new entry. Closes any entry still open, unfinished: the caller has already asked. */
export function startEntry(loaded: LoadedStory, session: Session): void {
  const stale = openEntry && !openEntry.closed ? openEntry.runId : null;
  queueSave(loaded, session, stale === null ? null : { runId: stale, at: new Date().toISOString() });
}

/** Read the open entry back from the book and judge it. Never throws for a bad save; it says what is wrong. */
export async function resume(): Promise<Resumed> {
  await settled();
  const s = theStore();
  const row = await s.readActive();
  if (!row) {
    openEntry = null;
    return { kind: 'none' };
  }
  let loaded: LoadedStory;
  try {
    loaded = await loadStory(row.storyId);
  } catch (reason) {
    const why = reason instanceof ContentError ? `its pages need mending (${reason.problems.length} problem${reason.problems.length === 1 ? '' : 's'})` : reasonText(reason);
    return { kind: 'unplayable', reason: why };
  }
  const opened = openSave(row, loaded);
  if (opened.kind !== 'ok') return opened;
  return { kind: 'ok', loaded, session: resumedSession(opened.run, opened.runId, opened.startedAt) };
}

/** Before beginning a new entry: if the open one is unreadable, put it in the drawer first so it isn't overwritten. */
export async function keepUnreadable(): Promise<void> {
  const found = await resume();
  if (found.kind === 'damaged' || found.kind === 'newer' || found.kind === 'unplayable') await setAsideEntry(found.reason);
}

export async function abandonEntry(runId: string): Promise<void> {
  await serial((s) => s.abandon(runId, new Date().toISOString()));
  await refreshOpenEntry();
}

/** The reader has seen the closing account; the entry no longer needs to be resumable. History and unlocks stay. */
export async function closeEntry(runId: string): Promise<void> {
  await serial((s) => s.clearActive(runId));
  await refreshOpenEntry();
}

export async function setAsideEntry(reason: string): Promise<void> {
  await serial((s) => s.setAside(reason, new Date().toISOString()));
  await refreshOpenEntry();
}

export async function ledgerView(): Promise<{ entries: EntryRecord[]; counts: UnlockCounts }> {
  await settled();
  const s = theStore();
  return { entries: await s.entries(), counts: await s.unlockCounts() };
}

/** What the closing account needs from the book: the final row, and what this run was first to unlock. */
export async function closingView(runId: string): Promise<{ entry: EntryRecord | null; fresh: UnlockCounts }> {
  await settled();
  const s = theStore();
  return { entry: await s.entry(runId), fresh: await s.unlockCounts(runId) };
}

/** The house rules as of the last change. Synchronous, so a screen can read them while it is built. */
export function currentSettings(): Settings {
  return settings;
}

/** Change a rule. It takes effect at once; a failure to write it down is reported to the caller. */
export async function changeSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  settings = { ...settings, [key]: value };
  await serial((s) => s.setSetting(key, value));
}

/** The codex: for every story that has anything unlocked, what it defines and which of that has been met. */
export async function codexView(): Promise<CodexStory[]> {
  await settled();
  const unlocks = await theStore().unlocks();
  const ids = [...new Set(unlocks.map((u) => u.storyId))];
  const found: CodexStory[] = [];
  for (const id of ids) {
    try {
      found.push(codexOf(await loadStory(id), unlocks));
    } catch {
      // A story that has gone from the shelf or can't be read has nothing to show; its unlocks are kept for if it returns.
    }
  }
  return found;
}
