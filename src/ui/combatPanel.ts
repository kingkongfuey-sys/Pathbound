// The fight panel under the scene's prose: the foe's exact HP on a ledger line, what the hero can read of its
// next move, the three stances as links (each with its mark and what it beats), skills, items from the satchel,
// flight, and the account of the rounds so far in a scrolling box. Built fresh from the engine's CombatView after
// every round, so it cannot disagree with the run. Taps go to `actions`; a refusal comes back as a line of copy.
import { voice } from '../copy/voice.ts';
import type { LoadedStory } from '../content/types.ts';
import { STANCES } from '../engine/combat.ts';
import type { CombatView, Stance3 } from '../engine/types.ts';
import { accountList } from './combatLog.ts';
import { el, link } from './dom.ts';
import { stanceMark } from './stanceMark.ts';

export interface PanelActions {
  /** Play a round with this stance (and skill). Returns a line of copy if the engine refused it. */
  stance(stance: Stance3, skillId?: string): string | null;
  item(itemId: string): string | null;
  flee(): void;
}

export function combatPanel(loaded: LoadedStory, view: CombatView, heroMaxHp: number, actions: PanelActions): HTMLElement {
  const note = el('p', 'combat-note');
  note.setAttribute('role', 'status');
  const say = (line: string | null): void => {
    note.textContent = line ?? '';
  };

  let armed: string | null = null;
  const body = el('div', 'combat-body');

  const option = (label: string, hint: string, onTap: () => void, mark?: Stance3): HTMLButtonElement => {
    const button = link(label, onTap, 'option');
    if (mark) button.prepend(stanceMark(mark));
    button.append(el('span', 'hint', hint));
    return button;
  };

  const paint = (): void => {
    const foe = el(
      'div',
      'foe-line',
      el('span', 'foe-name', view.monsterName),
      el('span', 'leader'),
      el('span', 'foe-hp', voice.combat.foeHp(view.foeHp, view.foeMaxHp)),
    );
    const tell = el('p', 'tell', view.tell ? voice.combat.tell[view.tell] : voice.combat.noTell);

    const stances = el(
      'div',
      'options-block',
      ...STANCES.map((stance) =>
        option(voice.combat.stances[stance], voice.combat.beats[stance], () => {
          const skillId = armed ?? undefined;
          say(actions.stance(stance, skillId));
          armed = null;
          paint();
        }, stance),
      ),
    );

    const skills = view.skills.map((skill) => {
      if (skill.cooldown > 0) {
        return el('p', 'option-off', `${skill.name} `, el('span', 'hint', voice.combat.skillWaiting(skill.cooldown)));
      }
      if (skill.stance === 'any') {
        const button = option(skill.name, armed === skill.id ? voice.combat.skillArmed : voice.combat.skillAnyStance, () => {
          armed = armed === skill.id ? null : skill.id;
          paint();
        });
        button.setAttribute('aria-pressed', String(armed === skill.id));
        return button;
      }
      const fixed = skill.stance;
      return option(skill.name, `${voice.combat.stances[fixed].toLowerCase()}, ${voice.combat.skillReady}`, () => {
        say(actions.stance(fixed, skill.id));
        armed = null;
        paint();
      }, fixed);
    });

    const items = view.items.map((item) =>
      option(item.count > 1 ? `${item.name} ${voice.satchel.count(item.count)}` : item.name, voice.combat.itemHint(item.amount), () => {
        say(actions.item(item.id));
      }),
    );

    const account = view.log.length === 0
      ? el('p', 'prose prose-quiet', voice.combat.logEmpty)
      : accountList(loaded, heroMaxHp, view.log, false);

    body.replaceChildren(
      foe,
      el('p', 'round-label', voice.combat.round(view.round)),
      tell,
      stances,
      ...(skills.length > 0 ? [el('h2', 'ledger-label', voice.combat.skillsLabel), ...skills] : []),
      ...(items.length > 0 ? [el('h2', 'ledger-label', voice.combat.itemsLabel), ...items] : []),
      option(voice.combat.flee, voice.combat.fleeHint, actions.flee),
      note,
      el('h2', 'ledger-label', voice.combat.logHeading),
      account,
    );
    const scroller = body.querySelector('.account');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  };

  paint();
  return el('div', 'combat-panel', body);
}
