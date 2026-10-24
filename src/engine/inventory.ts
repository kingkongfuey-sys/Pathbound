// What the hero can do with what they carry: wield or wear a piece of gear, take it off, drink a consumable.
// Pure functions over RunState like the rest of the engine: each returns a new run and describes what changed
// in plain data; the screens turn that into a line of copy. Gear moves between the backpack and the four slots
// without ever being created or lost, and maximum HP is re-checked whenever gear changes, so taking off
// something that added HP can never leave the hero above their new ceiling.
import type { EquipmentSlot, Item, LoadedStory } from '../content/types.ts';
import { effectiveStats } from './conditions.ts';
import type { RunState } from './types.ts';

export const SLOT_ORDER: readonly EquipmentSlot[] = ['weapon', 'head', 'body', 'trinket'];

export function isSlot(type: Item['type']): type is EquipmentSlot {
  return (SLOT_ORDER as readonly string[]).includes(type);
}

function itemOf(loaded: LoadedStory, itemId: string): Item {
  const item = loaded.items.get(itemId);
  if (!item) throw new Error(`The item "${itemId}" isn't defined by this story.`);
  return item;
}

function requireOpen(run: RunState): void {
  if (run.status === 'ended') throw new Error('This entry is closed; nothing in the satchel can change now.');
  if (run.combat) throw new Error('The satchel is shut while a fight is on; use the fight\'s own items.');
}

function requireCarried(run: RunState, item: Item): void {
  if ((run.inventory[item.id] ?? 0) < 1) throw new Error(`"${item.name}" isn't in the backpack.`);
}

function withCount(inventory: Record<string, number>, itemId: string, delta: number): Record<string, number> {
  const next = { ...inventory };
  const count = (next[itemId] ?? 0) + delta;
  if (count > 0) next[itemId] = count;
  else delete next[itemId];
  return next;
}

/** Current HP never exceeds the maximum the hero has right now. */
function clampHp(loaded: LoadedStory, run: RunState): RunState {
  const max = Math.max(1, effectiveStats(loaded, run).hp);
  return run.hp > max ? { ...run, hp: max } : run;
}

export interface EquipResult {
  run: RunState;
  slot: EquipmentSlot;
  /** The item that was in the slot and went back to the backpack, if any. */
  replacedId: string | null;
}

/** Move a carried piece of gear into its slot; whatever was there returns to the backpack. */
export function equip(loaded: LoadedStory, run: RunState, itemId: string): EquipResult {
  requireOpen(run);
  const item = itemOf(loaded, itemId);
  if (!isSlot(item.type)) throw new Error(`"${item.name}" can't be wielded or worn.`);
  requireCarried(run, item);

  const replacedId = run.equipment[item.type];
  let inventory = withCount(run.inventory, itemId, -1);
  if (replacedId !== null) inventory = withCount(inventory, replacedId, 1);
  const next: RunState = { ...run, inventory, equipment: { ...run.equipment, [item.type]: itemId } };
  return { run: clampHp(loaded, next), slot: item.type, replacedId };
}

export interface UnequipResult {
  run: RunState;
  itemId: string;
}

/** Take the gear out of a slot and put it in the backpack. */
export function unequip(loaded: LoadedStory, run: RunState, slot: EquipmentSlot): UnequipResult {
  requireOpen(run);
  const itemId = run.equipment[slot];
  if (itemId === null) throw new Error(`Nothing is in the ${slot} slot.`);
  const next: RunState = {
    ...run,
    inventory: withCount(run.inventory, itemId, 1),
    equipment: { ...run.equipment, [slot]: null },
  };
  return { run: clampHp(loaded, next), itemId };
}

export type UseResult =
  | { ok: true; run: RunState; healed: number }
  | { ok: false; reason: 'full-health' };

/** Use one consumable. Healing stops at the maximum; at full HP nothing is spent. */
export function useItem(loaded: LoadedStory, run: RunState, itemId: string): UseResult {
  requireOpen(run);
  const item = itemOf(loaded, itemId);
  if (item.type !== 'consumable' || !item.use) throw new Error(`"${item.name}" can't be used.`);
  requireCarried(run, item);

  const room = effectiveStats(loaded, run).hp - run.hp;
  if (room <= 0) return { ok: false, reason: 'full-health' };
  const healed = Math.min(item.use.amount, room);
  return {
    ok: true,
    healed,
    run: { ...run, hp: run.hp + healed, inventory: withCount(run.inventory, itemId, -1) },
  };
}

/** Add a line to the notes shown at the top of the current scene. */
export function addNote(run: RunState, line: string): RunState {
  return { ...run, pendingNotes: [...run.pendingNotes, line] };
}

export interface PackEntry {
  item: Item;
  count: number;
}

/** The backpack as a stable list: gear in slot order first, consumables last, each group by name. */
export function backpackOf(loaded: LoadedStory, run: RunState): PackEntry[] {
  const rank = (item: Item): number => (isSlot(item.type) ? SLOT_ORDER.indexOf(item.type) : SLOT_ORDER.length);
  return Object.entries(run.inventory)
    .map(([itemId, count]) => ({ item: itemOf(loaded, itemId), count }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.item.name.localeCompare(b.item.name));
}
