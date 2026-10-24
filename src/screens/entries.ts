// Run history: every entry the record book has, open or closed, newest first, with its exact figures. A section of
// the ledger (the codex hub in ledger.ts links here).
import { ledgerView } from '../app/book.ts';
import { showFatal } from '../app/fatal.ts';
import type { Navigator } from '../app/router.ts';
import { voice } from '../copy/voice.ts';
import type { EntryRecord } from '../save/types.ts';
import { el } from '../ui/dom.ts';
import { backLink, page, pageHead } from '../ui/page.ts';

function entryRow(entry: EntryRecord): HTMLElement {
  return el(
    'li',
    'entry',
    el(
      'div',
      'entry-head',
      el('span', 'entry-name', voice.ledger.entryName(entry.heroName, entry.archetypeName)),
      el('span', 'leader'),
      el('span', entry.outcome === 'death' ? 'entry-tag entry-tag-dark' : 'entry-tag', voice.ledger.outcomes[entry.outcome]),
    ),
    el('p', 'entry-detail', voice.ledger.entryDetail(entry.storyTitle, entry.chapterIndex + 1, entry.chapterCount, entry.level, entry.choices, entry.rounds, entry.startedAt.slice(0, 10))),
  );
}

export function entriesScreen(nav: Navigator): HTMLElement {
  const body = el('div', 'ledger-body', el('p', 'prose prose-quiet', voice.ledger.reading));
  ledgerView().then(
    ({ entries }) => {
      if (entries.length === 0) body.replaceChildren(el('p', 'prose', voice.ledger.entriesEmpty));
      else body.replaceChildren(el('ul', 'entries', ...entries.map(entryRow)), el('div', 'page-foot'));
    },
    (reason: unknown) => showFatal(document.getElementById('app') as HTMLElement, reason),
  );
  return page(backLink(nav), pageHead(voice.ledger.entries), body);
}
