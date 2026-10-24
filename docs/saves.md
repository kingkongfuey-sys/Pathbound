# The record book

Where entries are kept. Implementation: `src/save/`, `src/app/book.ts`. Design rationale is in the README.

## Tables (schema 2, `src/save/sqliteStore.ts`)

| Table | Holds |
|---|---|
| `meta` | `schema` version number |
| `active_run` | At most one row (`slot = 1`): run id, story id, save format, app version, content version, saved-at, and `body` (the envelope as JSON) |
| `runs` | One history row per entry: hero, calling, story, seed, started/ended, outcome (`open`, `victory`, `death`, `abandoned`, `lost`), ending title, chapter reached, choices, rounds, foes felled, flights, gold, level |
| `codex_unlocks` | `(story, kind, entry)` unique; kind is `story`, `monster`, `item` or `lore`; records the first run to meet it |
| `settings` | House rules, one row per rule: a key and its text value (schema 3). Read back through `settingsFrom`, which defaults anything unknown |
| `damaged_saves` | Bodies of entries that could not be read and were set aside. Never deleted by the app |

## Save format 2

`{ format, appVersion, runId, startedAt, run }`, where `run` is the engine's `RunState`. Raise `SAVE_FORMAT` in
`snapshot.ts` only when old saves cannot satisfy the new `RunState`, and write the migration in the same change.

**Migrations.** Format 1 (Stage 5) runs had no `xp` or `level`; `migrateRun` in `snapshot.ts` gives them `xp: 0, level: 1` when opened, and the next save writes format 2. The SQLite schema went 1 to 2 by `ALTER TABLE runs ADD COLUMN level INTEGER NOT NULL DEFAULT 1`, so old history rows read as level 1. A save from a newer format is refused untouched.

## Gates on reading a save

1. Newer: save format above this build's, or `contentVersion` above the story's. Not damaged; refused, offered for setting aside.
2. Parses as an envelope whose header agrees with the book's columns.
3. Shape: every `RunState` field has the right type and range.
4. Sense: every id exists in the story, gear fits its slot, HP within the maximum, ending consistent, fight state whole.

## Recovery

- Entry unreadable: Continue explains why. "Set it aside" (confirmed) moves the body to `damaged_saves`, marks the entry lost, frees the slot.
- Book unopenable: a screen shows the error. "Try again", or "Start a fresh book" (confirmed; deletes the database). A book from a newer build offers only "Try again".

## Schema history

1. Stage 5: `active_run`, `runs`, `codex_unlocks`, `damaged_saves`.
2. Stage 6: `runs.level`.
3. Stage 7: `settings`.
