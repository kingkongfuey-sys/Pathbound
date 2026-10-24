// House rules: the settings. For now one rule, how fast the book writes to you, from slow to instant. Each speed is a
// ledger line; the one in use is marked, and choosing one writes a sample line at that pace so the reader can judge it.
// A change takes effect at once and is kept in the record book; if it can't be kept, the page says so.
import { changeSetting, currentSettings } from '../app/book.ts';
import type { Navigator } from '../app/router.ts';
import { SPEEDS, speedCps } from '../app/settings.ts';
import type { TypewriterSpeed } from '../app/settings.ts';
import { voice } from '../copy/voice.ts';
import { el, link } from '../ui/dom.ts';
import { backLink, page, pageHead } from '../ui/page.ts';
import { typewrite } from '../ui/typewriter.ts';
import type { Typewriter } from '../ui/typewriter.ts';

export function houseRulesScreen(nav: Navigator): HTMLElement {
  const marks = new Map<TypewriterSpeed, HTMLElement>();
  const trouble = el('p', 'aside aside-trouble');
  const sample = el('p', 'prose codex-sample');
  let writer: Typewriter | null = null;

  const mark = (chosen: TypewriterSpeed): void => {
    for (const [speed, node] of marks) node.textContent = speed === chosen ? voice.rules.inUse : '';
  };

  const choose = (speed: TypewriterSpeed): void => {
    mark(speed);
    trouble.textContent = '';
    writer?.finish();
    writer = typewrite([sample], [voice.rules.sample], speedCps(speed), () => undefined);
    changeSetting('typewriter', speed).catch((reason: unknown) => {
      trouble.textContent = voice.rules.notKept(reason instanceof Error ? reason.message : String(reason));
    });
  };

  const rows = SPEEDS.map((speed) => {
    const tag = el('span', 'entry-tag entry-tag-dark');
    marks.set(speed, tag);
    return el('li', 'entry', el('div', 'entry-head codex-menu-row', link(voice.rules.speeds[speed], () => choose(speed)), el('span', 'leader'), tag));
  });
  mark(currentSettings().typewriter);

  return page(
    backLink(nav),
    pageHead(voice.rules.heading),
    el('p', 'prose', voice.rules.lead),
    el('h2', 'ledger-label', voice.rules.speedLabel),
    el('ul', 'entries', ...rows),
    el('p', 'prose prose-quiet', voice.rules.sampleHint),
    sample,
    trouble,
    el('div', 'page-foot'),
  );
}
