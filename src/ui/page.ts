// The page frame every screen sits in: the oxblood margin rule on the left, a text column
// to its right. Keeping this in one place is what makes every screen read as the same ledger.
import { el, link } from './dom.ts';
import { inkRule } from './inkRule.ts';
import type { Navigator } from '../app/router.ts';
import { voice } from '../copy/voice.ts';

/** Wrap column content in the ledger page. */
export function page(...column: Array<Node | string | null | undefined | false>): HTMLElement {
  return el('section', 'page', el('div', 'column', ...column));
}

/** A heading followed by the ink rule: the opening of every inner screen. */
export function pageHead(text: string): HTMLElement {
  return el('header', 'page-head', el('h1', 'page-title', text), inkRule());
}

/** Back link for inner screens; the Android back button does the same thing. */
export function backLink(nav: Navigator): HTMLElement {
  return el('div', 'back-row', link(voice.nav.back, () => nav.pop(), 'link-quiet'));
}
