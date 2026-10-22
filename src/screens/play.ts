// The reading screen: the stats strip, then the current scene with a typewriter reveal, then its choices; each
// choice advances the run through the engine. The run lives in a Session so a trip to the satchel and back
// resumes the same page (already written out, same scroll) instead of starting the scene over. Leaving
// mid-run asks first. Reaching an ending closes the entry for good.
import { showFatal } from '../app/fatal.ts';
import { TYPEWRITER_CHARS_PER_SECOND } from '../app/reader.ts';
import type { Navigator } from '../app/router.ts';
import { applyTheme } from '../app/theme.ts';
import type { Session } from '../app/session.ts';
import { voice } from '../copy/voice.ts';
import type { LoadedStory } from '../content/types.ts';
import { choose, viewOf } from '../engine/play.ts';
import { statusOf } from '../engine/status.ts';
import { el, link } from '../ui/dom.ts';
import { inkRule } from '../ui/inkRule.ts';
import { page } from '../ui/page.ts';
import { statsStrip } from '../ui/statsStrip.ts';
import { typewrite } from '../ui/typewriter.ts';
import type { Typewriter } from '../ui/typewriter.ts';
import { satchelScreen } from './satchel.ts';

export function playScreen(loaded: LoadedStory, session: Session) {
  return (nav: Navigator): HTMLElement => {
    let writer: Typewriter | null = null;
    let confirm: HTMLElement | null = null;

    nav.onLeave(applyTheme(loaded.story));

    const section = page();
    const column = section.firstElementChild as HTMLElement;

    const closeConfirm = (): void => {
      confirm?.remove();
      confirm = null;
    };
    const openConfirm = (): void => {
      confirm = el(
        'div',
        'overlay',
        el(
          'div',
          'overlay-card',
          el('p', 'prose', voice.play.confirmLead),
          el('div', 'overlay-row', link(voice.play.confirmLeave, () => nav.popToRoot())),
          el('div', 'overlay-row', link(voice.play.confirmStay, closeConfirm)),
        ),
      );
      section.append(confirm);
    };
    nav.setGuard(() => {
      if (confirm) {
        closeConfirm();
        return true;
      }
      if (session.run.status === 'ended') {
        nav.popToRoot();
        return true;
      }
      openConfirm();
      return true;
    });

    const openSatchel = (): void => {
      session.revealedTurn = session.turn;
      session.scrollY = window.scrollY;
      nav.push(satchelScreen(loaded, session));
    };

    const render = (): void => {
      const run = session.run;
      const view = viewOf(loaded, run);
      const alreadyRead = session.revealedTurn === session.turn;
      const prose = view.paragraphs.map(() => el('p', 'prose reading'));
      const options = el('div', 'options');

      if (view.ending) {
        const line = view.ending.kind === 'death' ? voice.play.closedDeath(view.ending.title) : voice.play.closed(view.ending.title);
        options.append(
          inkRule(),
          el('p', 'ending-line', line),
          el('div', 'option-row', link(voice.play.returnToDesk, () => nav.popToRoot(), 'option')),
        );
      } else {
        for (const choice of view.choices) {
          const button = link(choice.text, () => {
            try {
              session.run = choose(loaded, session.run, choice.index);
              session.turn += 1;
              render();
            } catch (error) {
              showFatal(document.getElementById('app') as HTMLElement, error);
            }
          }, 'option');
          if (choice.hint) button.append(el('span', 'hint', choice.hint));
          options.append(button);
        }
      }

      const top = el('div', 'leave-row', view.ending ? null : link(voice.play.leave, () => nav.pop(), 'link-quiet'));
      column.replaceChildren(
        statsStrip(statusOf(loaded, run), openSatchel),
        top,
        ...(view.notes.length > 0 ? [el('div', 'asides', ...view.notes.map((n) => el('p', 'aside', n)))] : []),
        el('div', 'reading-block', ...prose),
        options,
      );
      if (alreadyRead) requestAnimationFrame(() => window.scrollTo(0, session.scrollY));
      else window.scrollTo(0, 0);

      writer?.finish();
      writer = typewrite(prose, view.paragraphs, alreadyRead ? 0 : TYPEWRITER_CHARS_PER_SECOND, () => options.classList.add('shown'));
      column.addEventListener('pointerdown', () => writer?.finish(), { once: true });
    };

    render();
    return section;
  };
}
