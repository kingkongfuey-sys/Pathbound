// Home: the title sits high on the page, the choices sit low where a thumb rests.
import type { Navigator } from '../app/router.ts';
import { voice } from '../copy/voice.ts';
import { el, link } from '../ui/dom.ts';
import { inkRule } from '../ui/inkRule.ts';
import { page } from '../ui/page.ts';
import { shelfScreen } from './shelf.ts';
import { ledgerScreen } from './ledger.ts';

export function homeScreen(nav: Navigator): HTMLElement {
  const masthead = el(
    'header',
    'masthead',
    el('h1', 'title', voice.home.title),
    inkRule(),
    el('p', 'epigraph', voice.home.epigraph),
  );

  const choices = el(
    'nav',
    'choices ruled',
    el('div', 'choice-row', link(voice.home.newRun, () => nav.push(shelfScreen))),
    el('div', 'choice-row', link(voice.home.ledger, () => nav.push(ledgerScreen))),
  );

  const footer = el('footer', 'colophon', voice.home.version(__APP_VERSION__));

  const column = page(masthead, choices, footer);
  column.classList.add('page-home');
  return column;
}
