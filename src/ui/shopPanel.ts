// The shop panel under a shop scene's prose: what the stall sells (each item on a ledger line with its price as
// the thing you tap), what it would buy from the satchel, the purse, and the way out. Built fresh from the engine's
// ShopView after every deal, so it cannot disagree with the run. `note` is the line about the last deal (what was
// bought or sold, or why it wasn't); the screen decides it and passes it back in on each rebuild.
import { voice } from '../copy/voice.ts';
import type { LoadedStory } from '../content/types.ts';
import type { ShopView } from '../engine/types.ts';
import { el, link } from './dom.ts';
import { itemEntry } from './itemText.ts';

export interface ShopActions {
  buy(itemId: string): void;
  sell(itemId: string): void;
  leave(): void;
}

export function shopPanel(loaded: LoadedStory, view: ShopView, note: string, actions: ShopActions): HTMLElement {
  const symbol = loaded.story.currency.symbol;
  const nameOf = (itemId: string): string => loaded.items.get(itemId)?.name ?? itemId;

  const wares = view.wares.map((ware) => {
    const item = loaded.items.get(ware.itemId) ?? null;
    const button = link(voice.shop.buy(ware.price, symbol), () => actions.buy(ware.itemId), ware.short > 0 ? 'link-small link-dim' : 'link-small');
    return itemEntry(nameOf(ware.itemId), item, button);
  });
  const buys = view.buys.map((entry) => {
    const item = loaded.items.get(entry.itemId) ?? null;
    const name = entry.count > 1 ? `${nameOf(entry.itemId)} ${voice.satchel.count(entry.count)}` : nameOf(entry.itemId);
    return itemEntry(name, item, link(voice.shop.sell(entry.offer, symbol), () => actions.sell(entry.itemId), 'link-small'));
  });

  return el(
    'div',
    'shop-panel',
    el('p', 'reckoning', voice.shop.purse(view.gold, symbol)),
    el('p', 'deal-note', note),
    el('h2', 'ledger-label', voice.shop.wares),
    el('ul', 'entries', ...wares),
    el('h2', 'ledger-label', voice.shop.buys),
    buys.length > 0 ? el('ul', 'entries', ...buys) : el('p', 'prose prose-quiet', voice.shop.nothingToSell),
    el('div', 'option-row', link(voice.shop.leave, actions.leave, 'option')),
  );
}
