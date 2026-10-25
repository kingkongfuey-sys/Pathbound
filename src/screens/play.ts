// The reading screen: the stats strip, then the current scene with a typewriter reveal, then its choices or, when
// the scene is a fight or a shop, the fight panel or the shop panel. Each choice (or round) advances the run through the engine. The run
// lives in a Session so a trip to the satchel and back resumes the same page (already written out, same scroll)
// instead of starting the scene over. A fight repaints only its strip and panel between rounds, so the page keeps
// its place. Every change to the run is saved at once (book.ts), so setting the entry down is always safe and the
// entry waits on the home screen; abandoning it is a separate, confirmed act. Reaching an ending closes the entry for
// good and leads on to the closing account.
import { abandonEntry, commit, currentSettings } from '../app/book.ts';
import { showFatal } from '../app/fatal.ts';
import { devEffective, speedCps } from '../app/settings.ts';
import type { Navigator } from '../app/router.ts';
import { applyTheme } from '../app/theme.ts';
import type { Session } from '../app/session.ts';
import { voice } from '../copy/voice.ts';
import type { LoadedStory } from '../content/types.ts';
import { choose, fleeFight, fightAction, leaveShop, viewOf } from '../engine/play.ts';
import type { DevOptions } from '../engine/play.ts';
import { buy, sell } from '../engine/shop.ts';
import type { DealResult } from '../engine/shop.ts';
import type { FightResult } from '../engine/play.ts';
import { statusOf } from '../engine/status.ts';
import { accountList } from '../ui/combatLog.ts';
import { combatPanel } from '../ui/combatPanel.ts';
import { el, link } from '../ui/dom.ts';
import { inkRule } from '../ui/inkRule.ts';
import { questionCard } from '../ui/overlay.ts';
import { page } from '../ui/page.ts';
import { shopPanel } from '../ui/shopPanel.ts';
import { statsStrip } from '../ui/statsStrip.ts';
import { typewrite } from '../ui/typewriter.ts';
import type { Typewriter } from '../ui/typewriter.ts';
import { closingScreen } from './closing.ts';
import { devScreen } from './dev.ts';
import { satchelScreen } from './satchel.ts';

export function playScreen(loaded: LoadedStory, session: Session) {
  return (nav: Navigator): HTMLElement => {
    let writer: Typewriter | null = null;
    let confirm: HTMLElement | null = null;

    nav.onLeave(applyTheme(loaded.story));

    const section = page();
    const column = section.firstElementChild as HTMLElement;
    const fatal = (error: unknown): void => showFatal(document.getElementById('app') as HTMLElement, error);

    /** What dev mode asks of the engine this moment: nothing at all unless the hidden switch is on. */
    const devOptions = (): DevOptions => {
      const now = currentSettings();
      return { god: devEffective(now).god, ...(now.dev && session.devForce !== null ? { force: session.devForce } : {}) };
    };

    const closeConfirm = (): void => {
      confirm?.remove();
      confirm = null;
    };
    const openConfirm = (): void => {
      confirm = questionCard({
        lead: voice.play.abandonLead,
        yes: voice.play.abandonYes,
        no: voice.play.abandonNo,
        onYes: () => {
          abandonEntry(session.runId).then(() => nav.popToRoot(), fatal);
        },
        onNo: closeConfirm,
      });
      section.append(confirm);
    };
    // Back and "set the entry down" are the same thing: the page is already kept, so leaving asks nothing.
    nav.setGuard(() => {
      if (confirm) {
        closeConfirm();
        return true;
      }
      nav.popToRoot();
      return true;
    });

    const openSatchel = (): void => {
      session.revealedTurn = session.turn;
      session.scrollY = window.scrollY;
      nav.push(satchelScreen(loaded, session));
    };

    const openDev = (): void => {
      session.revealedTurn = session.turn;
      session.scrollY = window.scrollY;
      nav.push(devScreen(loaded, session));
    };

    const refreshStrip = (): void => {
      column.querySelector('.strip')?.replaceWith(statsStrip(statusOf(loaded, session.run), openSatchel));
    };

    /** The fight panel, rebuilt from the run. */
    const paintFight = (host: HTMLElement): void => {
      const status = statusOf(loaded, session.run);
      const view = viewOf(loaded, session.run).combat;
      if (!view) return;
      host.replaceChildren(
        combatPanel(loaded, view, status.maxHp, {
          stance: (stance, skillId) => act(() => fightAction(loaded, session.run, skillId === undefined ? { kind: 'stance', stance } : { kind: 'stance', stance, skillId }, devOptions()), skillId !== undefined),
          item: (itemId) => act(() => fightAction(loaded, session.run, { kind: 'item', itemId }, devOptions()), false),
          flee: () => {
            try {
              session.run = fleeFight(loaded, session.run, devOptions());
              session.turn += 1;
              commit(loaded, session);
              render();
            } catch (error) {
              fatal(error);
            }
          },
        }),
      );
    };
    let repaint: () => void = () => undefined;

    /** The shop panel, rebuilt from the run, with the line about the last deal. */
    const paintShop = (host: HTMLElement, note: string): void => {
      const view = viewOf(loaded, session.run).shop;
      if (!view) return;
      const deal = (result: DealResult, saying: (item: string, gold: number, symbol: string) => string, itemId: string): void => {
        const symbol = loaded.story.currency.symbol;
        if (!result.ok) {
          paintShop(host, voice.shop.poor(result.short, loaded.story.currency.name));
          return;
        }
        session.run = result.run;
        commit(loaded, session);
        refreshStrip();
        paintShop(host, saying(loaded.items.get(itemId)?.name ?? itemId, result.gold, symbol));
      };
      host.replaceChildren(
        shopPanel(loaded, view, note, {
          buy: (itemId) => attempt(() => deal(buy(loaded, session.run, itemId), voice.shop.bought, itemId)),
          sell: (itemId) => attempt(() => deal(sell(loaded, session.run, itemId), voice.shop.sold, itemId)),
          leave: () =>
            attempt(() => {
              session.run = leaveShop(loaded, session.run);
              session.turn += 1;
              commit(loaded, session);
              render();
            }),
        }),
      );
    };

    const attempt = (work: () => void): void => {
      try {
        work();
      } catch (error) {
        fatal(error);
      }
    };

    /** Run one fight action. Returns a line of copy if the engine refused it; otherwise the page has moved on. */
    const act = (run: () => FightResult, usedSkill: boolean): string | null => {
      try {
        const result = run();
        if (!result.ok) return result.reason === 'cooling' ? null : usedSkill ? voice.combat.skillWasted : voice.combat.nothingToMend;
        session.run = result.run;
        commit(loaded, session);
        if (session.run.combat) repaint();
        else {
          session.turn += 1;
          render();
        }
        return null;
      } catch (error) {
        fatal(error);
        return null;
      }
    };

    const render = (): void => {
      const run = session.run;
      const view = viewOf(loaded, run);
      const alreadyRead = session.revealedTurn === session.turn;
      const paragraphs = view.combat && view.combat.intro === 'encounter' ? [voice.combat.ambush(view.combat.monsterName)] : view.paragraphs;
      const prose = paragraphs.map(() => el('p', 'prose reading'));
      const options = el('div', 'options');
      const readingBlock = el('div', 'reading-block', ...prose);
      // Dev mode: keep a scene's prose behind a tap so the choices are right there. Fights and shops always show theirs.
      const skipped = devEffective(currentSettings()).skipText && !alreadyRead && !view.combat && !view.shop && !view.ending && paragraphs.length > 0;
      const showText = link(voice.dev.showText, () => {
        readingBlock.hidden = false;
        showText.remove();
      }, 'link-quiet');
      readingBlock.hidden = skipped;
      const strip = statsStrip(statusOf(loaded, run), openSatchel);

      if (view.shop) {
        const host = el('div', 'shop-host');
        options.append(host);
        paintShop(host, '');
      } else if (view.combat) {
        const host = el('div', 'combat-host');
        options.append(host);
        repaint = () => {
          refreshStrip();
          paintFight(host);
        };
        paintFight(host);
      } else if (view.ending) {
        const line = view.ending.kind === 'death' ? voice.play.closedDeath(view.ending.title) : voice.play.closed(view.ending.title);
        options.append(
          inkRule(),
          el('p', 'ending-line', line),
          el('div', 'option-row', link(voice.play.toClosing, () => nav.push(closingScreen(loaded, session)), 'option')),
        );
      } else {
        for (const choice of view.choices) {
          const button = link(choice.text, () => {
            try {
              const before = session.run;
              session.run = choose(loaded, before, choice.index, devOptions());
              // A forced encounter is spent once it has happened: it left something waiting to resume.
              if (session.run.returnStack.length > before.returnStack.length) session.devForce = null;
              session.turn += 1;
              commit(loaded, session);
              render();
            } catch (error) {
              fatal(error);
            }
          }, 'option');
          if (choice.hint) button.append(el('span', 'hint', choice.hint));
          options.append(button);
        }
      }

      const top = el(
        'div',
        'leave-row',
        view.ending ? null : link(voice.play.leave, () => nav.popToRoot(), 'link-quiet'),
        view.ending ? null : link(voice.play.abandon, openConfirm, 'link-quiet'),
        view.ending || !currentSettings().dev ? null : link(voice.dev.link, openDev, 'link-quiet'),
      );
      const asideBlocks: HTMLElement[] = [];
      const dev = devEffective(currentSettings());
      if (dev.god) asideBlocks.push(el('p', 'dev-banner', voice.dev.godBanner));
      if (session.saveTrouble) asideBlocks.push(el('p', 'aside aside-trouble', session.saveTrouble));
      if (view.aftermath.length > 0) asideBlocks.push(accountList(loaded, statusOf(loaded, run).maxHp, view.aftermath, true));
      asideBlocks.push(...view.notes.map((n) => el('p', 'aside', n)));
      column.replaceChildren(
        strip,
        top,
        ...(asideBlocks.length > 0 ? [el('div', 'asides', ...asideBlocks)] : []),
        ...(skipped ? [showText] : []),
        readingBlock,
        options,
      );
      if (alreadyRead) requestAnimationFrame(() => window.scrollTo(0, session.scrollY));
      else window.scrollTo(0, 0);

      writer?.finish();
      writer = typewrite(prose, paragraphs, alreadyRead || skipped ? 0 : speedCps(currentSettings().typewriter), () => options.classList.add('shown'));
      column.addEventListener('pointerdown', () => writer?.finish(), { once: true });
    };

    render();
    return section;
  };
}
