// One section of the codex: the tales, the bestiary, items or lore. Each entry is a ledger line (name, leader, a short
// tag) that opens in place to show its full text, so reading the codex never means a screen per entry. Only what has
// been met is listed, by name; what hasn't is only counted ("3 more are still unwritten"), so the codex gives nothing
// away. Several stories group under their own titles.
import { codexView } from '../app/book.ts';
import type { CodexStory } from '../app/codex.ts';
import { showFatal } from '../app/fatal.ts';
import type { Navigator } from '../app/router.ts';
import { voice } from '../copy/voice.ts';
import { el, link } from '../ui/dom.ts';
import { describeItem } from '../ui/itemText.ts';
import { backLink, page, pageHead } from '../ui/page.ts';

export type CodexKind = 'story' | 'monster' | 'item' | 'lore';

interface Line {
  name: string;
  tag: string;
  text: string[];
  quiet: string[];
}

function linesOf(kind: CodexKind, s: CodexStory): { lines: Line[]; total: number } {
  const symbol = s.story.currency.symbol;
  switch (kind) {
    case 'story':
      return {
        lines: s.taleMet ? [{ name: s.story.title, tag: voice.shelf.ratings[s.story.rating], text: [s.story.codexSummary], quiet: [s.story.toneLine] }] : [],
        total: 1,
      };
    case 'monster':
      return {
        lines: s.foes.map((m) => ({
          name: m.name,
          tag: m.boss ? voice.codex.boss : voice.codex.foe,
          text: [m.codexEntry],
          quiet: [voice.codex.foeFigures(m.hp, m.damage.min, m.damage.max)],
        })),
        total: s.foesTotal,
      };
    case 'item':
      return {
        lines: s.items.map((i) => ({
          name: i.name,
          tag: voice.codex.itemTypes[i.type],
          text: [i.codexEntry],
          quiet: [describeItem(i), voice.codex.worth(i.value, symbol)],
        })),
        total: s.itemsTotal,
      };
    case 'lore':
      return { lines: s.lore.map((l) => ({ name: l.title, tag: '', text: [l.text], quiet: [] })), total: s.loreTotal };
  }
}

function lineRow(line: Line): HTMLElement {
  const detail = el('div', 'codex-detail', ...line.text.map((t) => el('p', 'prose', t)), ...line.quiet.map((t) => el('p', 'entry-detail', t)));
  detail.hidden = true;
  const toggle = link(line.name, () => {
    detail.hidden = !detail.hidden;
    toggle.setAttribute('aria-expanded', String(!detail.hidden));
  });
  toggle.setAttribute('aria-expanded', 'false');
  return el('li', 'entry', el('div', 'entry-head', toggle, line.tag === '' ? null : el('span', 'leader'), line.tag === '' ? null : el('span', 'entry-tag', line.tag)), detail);
}

export function codexScreen(kind: CodexKind) {
  return (nav: Navigator): HTMLElement => {
    const body = el('div', 'ledger-body', el('p', 'prose prose-quiet', voice.ledger.reading));
    codexView().then(
      (stories) => {
        const parts: HTMLElement[] = [];
        let any = false;
        for (const s of stories) {
          const { lines, total } = linesOf(kind, s);
          if (total === 0) continue;
          if (stories.length > 1) parts.push(el('h2', 'ledger-label', s.story.title));
          if (lines.length > 0) {
            any = true;
            parts.push(el('ul', 'entries', ...lines.map(lineRow)));
          }
          if (lines.length < total) parts.push(el('p', 'reckoning', voice.codex.unwritten(total - lines.length)));
        }
        if (!any) parts.unshift(el('p', 'prose', voice.codex.empty[kind]));
        parts.push(el('div', 'page-foot'));
        body.replaceChildren(...parts);
      },
      (reason: unknown) => showFatal(document.getElementById('app') as HTMLElement, reason),
    );
    return page(backLink(nav), pageHead(voice.codex.headings[kind]), body);
  };
}
