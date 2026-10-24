// The record book for places that have no SQLite: the desktop-browser preview (`npm run dev`) and nothing else.
// The phone always uses the SQL store. This one keeps the same book as a single JSON document, rewritten whole on
// every change, so a change is all-or-nothing for free: it is applied to a copy and only kept if it succeeds.
// `Storage` is whatever has getItem/setItem (localStorage in the browser, a plain object in the self-test).
import type { ActiveRow, EntryRecord, SaveWrite, Store, Unlock, UnlockCounts, UnlockKind } from './types.ts';

export interface TextStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface UnlockRow {
  storyId: string;
  kind: UnlockKind;
  entryId: string;
  firstRunId: string;
}

interface Book {
  active: ActiveRow | null;
  entries: EntryRecord[];
  unlocks: UnlockRow[];
  drawer: Array<{ at: string; reason: string; runId: string; body: string }>;
  settings: Record<string, string>;
}

const KEY = 'pathbound.book';

function emptyBook(): Book {
  return { active: null, entries: [], unlocks: [], drawer: [], settings: {} };
}

export function createDocumentStore(storage: TextStorage): Store {
  const raw = storage.getItem(KEY);
  let book: Book = emptyBook();
  if (raw !== null) {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || !('entries' in parsed) || !('unlocks' in parsed)) {
      throw new Error('The browser copy of the record book is not in a shape this build knows.');
    }
    book = parsed as Book;
    // Entries kept before levels existed (Stage 5) have no level; they stood at level 1.
    for (const kept of book.entries) kept.level ??= 1;
    // A book kept before house rules existed has none.
    book.settings ??= {};
  }

  /** Apply `change` to a copy; keep it only if it and the write both succeed. */
  function commit(change: (copy: Book) => void): void {
    const copy = JSON.parse(JSON.stringify(book)) as Book;
    change(copy);
    storage.setItem(KEY, JSON.stringify(copy));
    book = copy;
  }

  return {
    kind: 'document',

    async readActive() {
      return book.active ? { ...book.active } : null;
    },

    async save({ active, entry, unlocks, closes }: SaveWrite) {
      commit((copy) => {
        if (closes) {
          const old = copy.entries.find((e) => e.id === closes.runId);
          if (old && old.outcome === 'open') {
            old.outcome = 'abandoned';
            old.endedAt = closes.at;
          }
        }
        copy.active = { ...active };
        const at = copy.entries.findIndex((e) => e.id === entry.id);
        if (at === -1) copy.entries.push({ ...entry });
        else copy.entries[at] = { ...entry };
        for (const unlock of unlocks) {
          if (!copy.unlocks.some((u) => u.storyId === unlock.storyId && u.kind === unlock.kind && u.entryId === unlock.entryId)) {
            copy.unlocks.push({ ...unlock, firstRunId: entry.id });
          }
        }
      });
    },

    async clearActive(runId) {
      commit((copy) => {
        if (copy.active?.runId === runId) copy.active = null;
      });
    },

    async abandon(runId, at) {
      commit((copy) => {
        const old = copy.entries.find((e) => e.id === runId);
        if (old && old.outcome === 'open') {
          old.outcome = 'abandoned';
          old.endedAt = at;
        }
        if (copy.active?.runId === runId) copy.active = null;
      });
    },

    async setAside(reason, at) {
      commit((copy) => {
        const active = copy.active;
        if (!active) return;
        copy.drawer.push({ at, reason, runId: active.runId, body: active.body });
        const old = copy.entries.find((e) => e.id === active.runId);
        if (old && old.outcome === 'open') {
          old.outcome = 'lost';
          old.endedAt = at;
        }
        copy.active = null;
      });
    },

    async entries() {
      return [...book.entries].sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : a.id < b.id ? 1 : -1));
    },

    async entry(runId) {
      return book.entries.find((e) => e.id === runId) ?? null;
    },

    async unlocks() {
      const all: Unlock[] = book.unlocks.map((u) => ({ storyId: u.storyId, kind: u.kind, entryId: u.entryId }));
      return all.sort((a, b) => (a.storyId + a.kind + a.entryId < b.storyId + b.kind + b.entryId ? -1 : 1));
    },

    async settings() {
      return { ...book.settings };
    },

    async setSetting(key, value) {
      commit((copy) => {
        copy.settings[key] = value;
      });
    },

    async unlockCounts(firstRunId) {
      const counts: UnlockCounts = { story: 0, monster: 0, item: 0, lore: 0 };
      for (const unlock of book.unlocks) {
        if (firstRunId === undefined || unlock.firstRunId === firstRunId) counts[unlock.kind] += 1;
      }
      return counts;
    },
  };
}
