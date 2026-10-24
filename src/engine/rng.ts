// Seeded randomness. Every run has one seed; each kind of roll (encounters, combat, a stream for what the hero can read in a foe, and loot) draws
// from its own named stream derived from that seed. Separate streams mean changing how much one system rolls
// never shifts the results of another, and the same seed with the same choices always plays out the same way.
// The state of every stream lives in the run, so a saved run resumes mid-sequence. Math.random is never used.
import type { RunState } from './types.ts';

/** Hash a string to four 32-bit words (cyrb128). */
function hash(text: string): number[] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i += 1) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

/** One step of sfc32: returns the new state and a float in [0, 1). */
function step(state: number[]): { state: number[]; value: number } {
  let [a = 0, b = 0, c = 0, d = 0] = state;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  return { state: [a, b, c, d], value: (t >>> 0) / 4294967296 };
}

function freshStream(seed: string, name: string): number[] {
  let state = hash(`${seed}/${name}`);
  for (let i = 0; i < 12; i += 1) state = step(state).state; // warm-up
  return state;
}

/** Draw an integer in [0, max) from a named stream. Returns the value and the run with the stream advanced. */
export function drawInt(run: RunState, stream: string, max: number): [number, RunState] {
  if (!Number.isInteger(max) || max < 1) throw new Error(`drawInt needs a whole number of at least 1, got ${max}.`);
  const current = run.rng[stream] ?? freshStream(run.seed, stream);
  const { state, value } = step(current);
  return [Math.floor(value * max), { ...run, rng: { ...run.rng, [stream]: state } }];
}

/** Pick an index with probability proportional to `weights` (non-negative whole numbers, not all zero). */
export function drawWeighted(run: RunState, stream: string, weights: number[]): [number, RunState] {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total < 1) throw new Error('drawWeighted needs at least one positive weight.');
  let [pick, next] = drawInt(run, stream, total);
  for (let i = 0; i < weights.length; i += 1) {
    const weight = weights[i] ?? 0;
    if (pick < weight) return [i, next];
    pick -= weight;
  }
  throw new Error('drawWeighted ran past its weights; this cannot happen.');
}

/** A fresh seed for a new run. The only place unseeded randomness is allowed, and it is stored in the run. */
export function makeSeed(): string {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => n.toString(16).padStart(8, '0')).join('');
}

/** An id for a run in the record book. Kept apart from the seed so two runs given the same seed never collide. */
export function makeRunId(): string {
  return `${Date.now().toString(36)}-${makeSeed().slice(0, 8)}`;
}
