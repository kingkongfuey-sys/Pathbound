// Turns the events of a fight, a level or a shop into the account: one ruled entry per event, the round number in
// the margin for a round, a few short lines beside it, every number exact. Events are plain data from the engine;
// every word here comes from the voice module, with names and amounts filled in from the story. Used live in the
// fight panel and, for what has just happened, at the top of the next page.
import { voice } from '../copy/voice.ts';
import type { LoadedStory, Skill } from '../content/types.ts';
import type { AccountEvent } from '../engine/types.ts';
import { el } from './dom.ts';

function skillById(loaded: LoadedStory, id: string): Skill | null {
  for (const archetype of loaded.story.archetypes) {
    const found = archetype.startingSkills.find((s) => s.id === id);
    if (found) return found;
  }
  for (const monster of loaded.monsters.values()) {
    const found = monster.skills.find((s) => s.id === id);
    if (found) return found;
  }
  return null;
}

const capital = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/** The lines for one event. `heroMax` is the hero's maximum HP now. */
export function eventLines(loaded: LoadedStory, heroMax: number, event: AccountEvent): string[] {
  if (event.kind === 'defeat') return [voice.combat.defeat];
  if (event.kind === 'xp') return [voice.combat.xp(event.gained, event.total)];
  if (event.kind === 'level') return [voice.combat.level(event.level, event)];
  if (event.kind === 'bought' || event.kind === 'sold') {
    const name = loaded.items.get(event.itemId)?.name ?? event.itemId;
    const symbol = loaded.story.currency.symbol;
    return [event.kind === 'bought' ? voice.shop.bought(name, event.gold, symbol) : voice.shop.sold(name, event.gold, symbol)];
  }
  if (event.kind === 'flee') return [voice.combat.fled(event.blow, event.heroHp, heroMax)];
  if (event.kind === 'loot') {
    const parts: string[] = [];
    if (event.gold > 0) parts.push(voice.combat.spoilsGold(event.gold, loaded.story.currency.symbol));
    for (const id of event.itemIds) parts.push(loaded.items.get(id)?.name ?? id);
    return [voice.combat.spoils(parts)];
  }
  const monster = loaded.monsters.get(event.monsterId);
  const name = monster?.name ?? event.monsterId;
  if (event.kind === 'victory') return [voice.combat.victory(name)];

  const lines: string[] = [];
  const item = event.itemId ? (loaded.items.get(event.itemId)?.name ?? event.itemId) : null;
  const mine = event.heroStance ? voice.combat.youStance[event.heroStance] : voice.combat.youItem(item ?? '');
  const theirs = voice.combat.foeStance(name, event.foeStance);
  let verdict: string;
  switch (event.result) {
    case 'win':
      verdict = voice.combat.verdict.win(capital(event.heroStance ?? ''), event.foeStance);
      break;
    case 'lose':
      verdict = voice.combat.verdict.lose(event.heroStance ?? '', capital(event.foeStance));
      break;
    case 'clash':
      verdict = voice.combat.verdict.clash;
      break;
    case 'open':
      verdict = voice.combat.verdict.open(name);
      break;
    case 'idle':
      verdict = voice.combat.verdict.idle(name);
      break;
  }
  lines.push(`${mine}; ${theirs}. ${verdict}`);

  const heroSkill = event.heroSkillId ? skillById(loaded, event.heroSkillId) : null;
  if (heroSkill) {
    const amount = heroSkill.effect.kind === 'heal' ? event.heroHealed : heroSkill.effect.amount;
    lines.push(voice.combat.skillLine(heroSkill.effect.kind, heroSkill.name, amount));
  }
  const foeSkill = event.foeSkillId ? skillById(loaded, event.foeSkillId) : null;
  if (foeSkill) {
    const amount = foeSkill.effect.kind === 'heal' ? event.foeHealed : foeSkill.effect.amount;
    lines.push(voice.combat.foeSkillLine(name, foeSkill.effect.kind, foeSkill.name, amount));
  }
  if (item) lines.push(voice.combat.itemLine(item, event.heroHealed));

  if (event.dealt > 0) lines.push(voice.combat.foeTakes(name, event.dealt, event.foeHp, monster?.hp ?? event.foeHp));
  if (event.taken > 0) lines.push(voice.combat.youTake(event.taken, event.heroHp, heroMax));
  if (event.dealt === 0 && event.taken === 0 && event.result !== 'idle') lines.push(voice.combat.nothingLands);
  return lines;
}

/** A ruled list of entries. `flat` leaves it unscrolled (for the page after a fight); otherwise it scrolls and rests at the foot. */
export function accountList(loaded: LoadedStory, heroMax: number, events: AccountEvent[], flat: boolean): HTMLElement {
  const list = el('ol', flat ? 'account account-flat' : 'account');
  for (const event of events) {
    const margin = event.kind === 'round' ? String(event.round) : '';
    list.append(
      el(
        'li',
        'account-entry',
        el('span', 'account-round', margin),
        el('div', 'account-lines', ...eventLines(loaded, heroMax, event).map((line) => el('p', 'account-line', line))),
      ),
    );
  }
  return list;
}
