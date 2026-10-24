// Home: the title sits high on the page, the choices sit low where a thumb rests. When an entry is open, a line above
// the choices says whose it is and how far it got, and the first choice picks it up again. Resuming reads the entry
// back through its checks (book.ts); one that fails them goes to a screen that explains it, never to a crash.
import { currentEntry, resume } from '../app/book.ts';
import { showFatal } from '../app/fatal.ts';
import type { Navigator } from '../app/router.ts';
import { voice } from '../copy/voice.ts';
import { el, link } from '../ui/dom.ts';
import { inkRule } from '../ui/inkRule.ts';
import { page } from '../ui/page.ts';
import { closingScreen } from './closing.ts';
import { houseRulesScreen } from './houseRules.ts';
import { ledgerScreen } from './ledger.ts';
import { playScreen } from './play.ts';
import { resumeProblemScreen } from './resumeProblem.ts';
import { shelfScreen } from './shelf.ts';

export function homeScreen(nav: Navigator): HTMLElement {
  const masthead = el(
    'header',
    'masthead',
    el('h1', 'title', voice.home.title),
    inkRule(),
    el('p', 'epigraph', voice.home.epigraph),
  );

  const open = currentEntry();
  const note = el('p', 'open-line');
  const rows: HTMLElement[] = [];
  if (open) {
    const entry = open.entry;
    if (entry) {
      note.textContent = open.closed
        ? voice.home.closedLine(entry.heroName, entry.storyTitle)
        : voice.home.openLine(entry.heroName, entry.storyTitle, entry.chapterIndex + 1, entry.chapterCount);
    }
    const button = link(open.closed ? voice.home.readClosing : voice.home.continueEntry, () => {
      button.disabled = true;
      resume()
        .then((found) => {
          button.disabled = false;
          if (found.kind === 'none') {
            note.textContent = voice.book.nothingOpen;
          } else if (found.kind === 'ok') {
            nav.push(found.session.run.status === 'ended' ? closingScreen(found.loaded, found.session) : playScreen(found.loaded, found.session));
          } else {
            nav.push(resumeProblemScreen({ kind: found.kind, reason: found.reason }));
          }
        })
        .catch((reason: unknown) => showFatal(document.getElementById('app') as HTMLElement, reason));
    });
    rows.push(el('div', 'choice-row', button));
  }
  rows.push(el('div', 'choice-row', link(voice.home.newRun, () => nav.push(shelfScreen))));
  rows.push(el('div', 'choice-row', link(voice.home.ledger, () => nav.push(ledgerScreen))));
  rows.push(el('div', 'choice-row', link(voice.home.houseRules, () => nav.push(houseRulesScreen))));

  const lower = el('div', 'home-lower', open ? note : null, el('nav', 'choices ruled', ...rows));
  const footer = el('footer', 'colophon', voice.home.version(__APP_VERSION__));

  const column = page(masthead, lower, footer);
  column.classList.add('page-home');
  return column;
}
