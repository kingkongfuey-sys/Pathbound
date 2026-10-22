// The run as the screens hold it. The router rebuilds a screen from scratch whenever the reader comes back to it,
// so anything that must survive a visit to another screen (the satchel, from Stage 3) lives here rather than in
// a screen's local variables. `turn` counts choices taken; the typewriter uses it to know a scene has already
// been read and shouldn't be written out again on return. Stage 5 saves `run` to the database after every change.
import type { RunState } from '../engine/types.ts';

export interface Session {
  run: RunState;
  turn: number;
  /** The turn whose text has already been shown in full (-1 before any). */
  revealedTurn: number;
  /** Where the page was scrolled when the reader left for another screen. */
  scrollY: number;
}

export function newSession(run: RunState): Session {
  return { run, turn: 0, revealedTurn: -1, scrollY: 0 };
}
