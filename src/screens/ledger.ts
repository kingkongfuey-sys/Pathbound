// The ledger (codex). Entries unlock as they are met; until then it says it is empty.
import type { Navigator } from '../app/router.ts';
import { voice } from '../copy/voice.ts';
import { el } from '../ui/dom.ts';
import { backLink, page, pageHead } from '../ui/page.ts';

export function ledgerScreen(nav: Navigator): HTMLElement {
  return page(backLink(nav), pageHead(voice.ledger.heading), el('p', 'prose', voice.ledger.empty));
}
