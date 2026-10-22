// The satchel: a full page of the hero's belongings, set out like a ledger. Four fixed slots (weapon, head, body,
// trinket) are listed under "Worn", the backpack under "Carried"; each line is the item's name, a row of dotted
// leader, and the one thing that can be done with it. Changes go straight into the shared session, and each
// one is also written into the run's notes, so the next page of the story records it. A closed entry can be read
// but not changed.
import { applyTheme } from '../app/theme.ts';
import type { Navigator } from '../app/router.ts';
import type { Session } from '../app/session.ts';
import { voice } from '../copy/voice.ts';
import type { Item, LoadedStory, StatName } from '../content/types.ts';
import { addNote, backpackOf, equip, SLOT_ORDER, unequip, useItem } from '../engine/inventory.ts';
import { statusOf } from '../engine/status.ts';
import { el, link } from '../ui/dom.ts';
import { page, pageHead } from '../ui/page.ts';

const STAT_ORDER: StatName[] = ['hp', 'attack', 'defense', 'wits', 'nerve'];

/** "Attack +2, Wits +1." or "Restores 6 HP." or nothing, followed by the item's flavour line. */
function describe(item: Item): string {
  const parts: string[] = [];
  const modifiers = item.modifiers ?? {};
  for (const stat of STAT_ORDER) {
    const delta = modifiers[stat];
    if (delta) parts.push(voice.satchel.change(voice.statNames[stat], delta));
  }
  const effect = parts.length > 0 ? `${parts.join(', ')}.` : item.use ? voice.satchel.heals(item.use.amount) : '';
  return effect === '' ? item.flavor : `${effect} ${item.flavor}`;
}

function entry(name: string, item: Item | null, action: HTMLElement | null): HTMLElement {
  return el(
    'li',
    'entry',
    el('div', 'entry-head', el('span', item ? 'entry-name' : 'entry-name entry-empty', name), action ? el('span', 'leader') : null, action),
    item ? el('p', 'entry-detail', describe(item)) : null,
  );
}

export function satchelScreen(loaded: LoadedStory, session: Session) {
  return (nav: Navigator): HTMLElement => {
    nav.onLeave(applyTheme(loaded.story));

    const section = page();
    const column = section.firstElementChild as HTMLElement;
    let line = '';

    const itemName = (itemId: string): string => loaded.items.get(itemId)?.name ?? itemId;
    const record = (text: string): void => {
      line = text;
      session.run = addNote(session.run, text);
      refresh();
    };
    const open = (): boolean => session.run.status === 'playing';

    const wornList = (): HTMLElement =>
      el(
        'ul',
        'entries',
        ...SLOT_ORDER.map((slot) => {
          const itemId = session.run.equipment[slot];
          const item = itemId === null ? null : (loaded.items.get(itemId) ?? null);
          const action =
            item && open()
              ? link(voice.satchel.takeOff, () => {
                  const result = unequip(loaded, session.run, slot);
                  session.run = result.run;
                  record(voice.satchel.removed(itemName(result.itemId)));
                }, 'link-small')
              : null;
          return el(
            'li',
            'slot',
            el('p', 'slot-label', voice.satchel.slots[slot]),
            el('ul', 'entries', entry(item ? item.name : voice.satchel.slotEmpty, item, action)),
          );
        }),
      );

    const packList = (): HTMLElement => {
      const stock = backpackOf(loaded, session.run);
      if (stock.length === 0) return el('p', 'prose prose-quiet', voice.satchel.packEmpty);
      return el(
        'ul',
        'entries',
        ...stock.map(({ item, count }) => {
          let action: HTMLElement | null = null;
          if (open() && item.type === 'consumable') {
            action = link(voice.satchel.use, () => {
              const result = useItem(loaded, session.run, item.id);
              if (!result.ok) {
                line = voice.satchel.fullHealth;
                refresh();
                return;
              }
              session.run = result.run;
              record(voice.satchel.used(item.name, result.healed));
            }, 'link-small');
          } else if (open() && item.type !== 'consumable') {
            const slot = item.type;
            action = link(voice.satchel.take[slot], () => {
              const result = equip(loaded, session.run, item.id);
              session.run = result.run;
              const said = voice.satchel.equipped[result.slot](item.name);
              record(result.replacedId === null ? said : `${said} ${voice.satchel.returned(itemName(result.replacedId))}`);
            }, 'link-small');
          }
          return entry(count > 1 ? `${item.name} ${voice.satchel.count(count)}` : item.name, item, action);
        }),
      );
    };

    const refresh = (): void => {
      const status = statusOf(loaded, session.run);
      column.replaceChildren(
        el('div', 'back-row', link(voice.satchel.close, () => nav.pop(), 'link-quiet')),
        pageHead(voice.satchel.heading),
        el('p', 'reckoning', voice.satchel.reckoning(status.hp, status.maxHp, status.stats)),
        el('p', 'satchel-line', open() ? line : voice.satchel.closed),
        el('h2', 'ledger-label', voice.satchel.worn),
        wornList(),
        el('h2', 'ledger-label', voice.satchel.carried),
        packList(),
        el('div', 'page-foot'),
      );
    };

    refresh();
    return section;
  };
}
