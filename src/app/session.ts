// The run as the screens hold it. The router rebuilds a screen from scratch whenever the reader comes back to it,
// so anything that must survive a visit to another screen (the satchel, from Stage 3) lives here rather than in
// a screen's local variables. `turn` counts choices taken; the typewriter uses it to know a scene has already
// been read and shouldn't be written out again on return. The run is saved from here (see book.ts): `runId` and
// `startedAt` are the entry's identity in the record book, and `saveTrouble` holds the last thing that stopped a
// save, so the page can say so instead of letting the reader assume the page was kept.
import { makeRunId } from '../engine/rng.ts';
import type { RunState } from '../engine/types.ts';

export interface Session {
  run: RunState;
  runId: string;
  startedAt: string;
  turn: number;
  /** The turn whose text has already been shown in full (-1 before any). */
  revealedTurn: number;
  /** Where the page was scrolled when the reader left for another screen. */
  scrollY: number;
  /** Why the last save didn't land, or null when it did. */
  saveTrouble: string | null;
}

export function newSession(run: RunState): Session {
  return { run, runId: makeRunId(), startedAt: new Date().toISOString(), turn: 0, revealedTurn: -1, scrollY: 0, saveTrouble: null };
}

/** A session picked up from the record book. Its page counts as already read, so it opens in full. */
export function resumedSession(run: RunState, runId: string, startedAt: string): Session {
  return { run, runId, startedAt, turn: 0, revealedTurn: 0, scrollY: 0, saveTrouble: null };
}
