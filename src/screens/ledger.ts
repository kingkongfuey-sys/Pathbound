// The ledger: the codex's front page. Five sections (the tales, the bestiary, items, lore, and the history of entries)
// each with a count of how much has been written; everything unlocks as it is met and nothing is ever taken back out.
// Until anything at all has been written it says so instead of listing five empty sections.
import { codexView, ledgerView } from '../app/book.ts';
import type { CodexStory } from '../app/codex.ts';
import { showFatal } from '../app/fatal.ts';
import type { Navigator } from '../app/router.ts';
import { voice } from '../copy/voice.ts';
import { el, link } from '../ui/dom.ts';
import { backLink, page, pageHead } from '../ui/page.ts';
import { codexScreen } from './codex.ts';
import { entriesScreen } from './entries.ts';

function sum(stories: CodexStory[], pick: (s: CodexStory) => number): number {
  return stories.reduce((total, s) => total + pick(s), 0);
}

function row(label: string, count: string, open: () => void): HTMLElement {
  return el('li', 'entry', el('div', 'entry-head codex-menu-row', link(label, open), el('span', 'leader'), el('span', 'entry-tag', count)));
}

export function ledgerScreen(nav: Navigator): HTMLElement {
  const body = el('div', 'ledger-body', el('p', 'prose prose-quiet', voice.ledger.reading));
  Promise.all([ledgerView(), codexView()]).then(
    ([{ entries }, stories]) => {
      if (entries.length === 0 && stories.length === 0) {
        body.replaceChildren(el('p', 'prose', voice.ledger.empty));
        return;
      }
      const h = voice.codex.headings;
      body.replaceChildren(
        el(
          'ul',
          'entries codex-menu',
          row(h.story, voice.codex.metOf(sum(stories, (s) => (s.taleMet ? 1 : 0)), stories.length), () => nav.push(codexScreen('story'))),
          row(h.monster, voice.codex.metOf(sum(stories, (s) => s.foes.length), sum(stories, (s) => s.foesTotal)), () => nav.push(codexScreen('monster'))),
          row(h.item, voice.codex.metOf(sum(stories, (s) => s.items.length), sum(stories, (s) => s.itemsTotal)), () => nav.push(codexScreen('item'))),
          row(h.lore, voice.codex.metOf(sum(stories, (s) => s.lore.length), sum(stories, (s) => s.loreTotal)), () => nav.push(codexScreen('lore'))),
          row(voice.ledger.entries, String(entries.length), () => nav.push(entriesScreen)),
        ),
        el('div', 'page-foot'),
      );
    },
    (reason: unknown) => showFatal(document.getElementById('app') as HTMLElement, reason),
  );
  return page(backLink(nav), pageHead(voice.ledger.heading), body);
}
