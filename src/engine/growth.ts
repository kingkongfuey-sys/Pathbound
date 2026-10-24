// Experience and levels. A felled foe is worth a number of experience points worked out from the monster itself
// (its HP plus twice its heaviest blow, doubled for a boss), so a story author sets the worth of a fight by writing
// the monster, not a separate number. Totals are fixed thresholds shared by every story; reaching one adds to the
// hero's base stats the same way every time (more HP each level, then attack on even levels and defense on odd), and
// the hit points a level adds are healed at once so rising never leaves the hero weaker than before. Levels are told
// as lines of the account, never as pop-ups. Pure functions; no dice, so growth can never shift a random stream.
import type { LoadedStory, Monster } from '../content/types.ts';
import { effectiveStats } from './conditions.ts';
import type { AccountEvent, RunState } from './types.ts';

export const LEVEL_CAP = 5;

/** Total experience at which each level is reached; index is the level. */
export const XP_FOR_LEVEL: readonly number[] = [0, 0, 20, 50, 90, 140];

/** What reaching `level` adds to the hero's base stats. */
export function gainsAt(level: number): { hp: number; attack: number; defense: number } {
  return { hp: 3, attack: level % 2 === 0 ? 1 : 0, defense: level % 2 === 1 ? 1 : 0 };
}

export function xpWorth(monster: Monster): number {
  return (monster.hp + monster.damage.max * 2) * (monster.boss ? 2 : 1);
}

/** The level a total of experience stands at. */
export function levelFor(xp: number): number {
  let level = 1;
  for (let next = 2; next <= LEVEL_CAP; next += 1) if (xp >= (XP_FOR_LEVEL[next] ?? Infinity)) level = next;
  return level;
}

/** Experience still needed for the next level, or null at the cap. */
export function xpToNext(run: RunState): number | null {
  const needed = XP_FOR_LEVEL[run.level + 1];
  return run.level >= LEVEL_CAP || needed === undefined ? null : needed - run.xp;
}

/** Award the worth of a felled foe. Returns the new run and the account lines (one for the experience, one per level). */
export function awardXp(loaded: LoadedStory, start: RunState, monster: Monster): { run: RunState; events: AccountEvent[] } {
  const gained = xpWorth(monster);
  const total = start.xp + gained;
  let run: RunState = { ...start, xp: total };
  const reached = levelFor(total);
  const levels: AccountEvent[] = [];
  while (run.level < reached) {
    const level = run.level + 1;
    const gain = gainsAt(level);
    const stats = { ...run.stats, hp: run.stats.hp + gain.hp, attack: run.stats.attack + gain.attack, defense: run.stats.defense + gain.defense };
    const grown: RunState = { ...run, level, stats };
    const max = effectiveStats(loaded, grown).hp;
    run = { ...grown, hp: Math.min(max, run.hp + gain.hp) };
    levels.push({ kind: 'level', level, ...gain });
  }
  return { run, events: [{ kind: 'xp', gained, total, level: run.level }, ...levels] };
}
