// Shops: buying and selling at a shop scene. Pure functions over RunState like the rest of the engine. The stall sells
// each item in its stock at the story's price, in any quantity (stock never runs out), and buys what the hero carries
// at half its value, rounded down; an item worth less than 2 can't be sold, and worn gear is never bought (take it off
// first). The validator refuses a price below what the stall would pay for the same item, so buying and selling the
// same thing can never make money. What happened is recorded as account events, which the screens turn into lines,
// and which carry on to the next page when the hero leaves.
import type { LoadedStory, ShopScene } from '../content/types.ts';
import type { AccountEvent, RunState, ShopView } from './types.ts';

/** What the stall pays for an item worth `value`. */
export function offerFor(value: number): number {
  return Math.floor(value / 2);
}

function shopOf(loaded: LoadedStory, run: RunState): ShopScene {
  const scene = loaded.scenes.get(run.sceneId);
  if (!scene || scene.type !== 'shop') throw new Error(`The run is at "${run.sceneId}", which isn't a shop.`);
  if (run.status === 'ended') throw new Error('This entry is closed; nothing can be bought or sold now.');
  if (run.combat) throw new Error('A fight is on; the stall will have to wait.');
  return scene;
}

function withCount(inventory: Record<string, number>, itemId: string, delta: number): Record<string, number> {
  const next = { ...inventory };
  const count = (next[itemId] ?? 0) + delta;
  if (count > 0) next[itemId] = count;
  else delete next[itemId];
  return next;
}

export function shopView(loaded: LoadedStory, run: RunState): ShopView {
  const scene = shopOf(loaded, run);
  const wares = scene.shop.stock.map((entry) => ({ itemId: entry.itemId, price: entry.price, short: Math.max(0, entry.price - run.gold) }));
  const buys = Object.entries(run.inventory).flatMap(([itemId, count]) => {
    const item = loaded.items.get(itemId);
    const offer = item ? offerFor(item.value) : 0;
    return item && offer >= 1 ? [{ itemId, count, offer }] : [];
  });
  buys.sort((a, b) => (loaded.items.get(a.itemId)?.name ?? '').localeCompare(loaded.items.get(b.itemId)?.name ?? ''));
  return { wares, buys, gold: run.gold };
}

function record(run: RunState, event: AccountEvent): RunState {
  return { ...run, aftermath: [...run.aftermath, event] };
}

export type DealResult = { ok: true; run: RunState; gold: number } | { ok: false; reason: 'poor'; short: number };

/** Buy one of an item from the stall. Refused (and nothing changes) when the purse is short. */
export function buy(loaded: LoadedStory, run: RunState, itemId: string): DealResult {
  const scene = shopOf(loaded, run);
  const entry = scene.shop.stock.find((e) => e.itemId === itemId);
  if (!entry) throw new Error(`"${itemId}" isn't for sale here.`);
  if (run.gold < entry.price) return { ok: false, reason: 'poor', short: entry.price - run.gold };
  const next: RunState = { ...run, gold: run.gold - entry.price, inventory: withCount(run.inventory, itemId, 1) };
  return { ok: true, run: record(next, { kind: 'bought', itemId, gold: entry.price }), gold: entry.price };
}

/** Sell one carried item to the stall for half its value (rounded down). */
export function sell(loaded: LoadedStory, run: RunState, itemId: string): DealResult {
  shopOf(loaded, run);
  const item = loaded.items.get(itemId);
  if (!item) throw new Error(`The story has no item "${itemId}".`);
  if ((run.inventory[itemId] ?? 0) < 1) throw new Error(`"${item.name}" isn't in the backpack.`);
  const offer = offerFor(item.value);
  if (offer < 1) throw new Error(`The stall won't buy "${item.name}".`);
  const next: RunState = { ...run, gold: run.gold + offer, inventory: withCount(run.inventory, itemId, -1) };
  return { ok: true, run: record(next, { kind: 'sold', itemId, gold: offer }), gold: offer };
}
