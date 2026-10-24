// The question card that rises from the foot of the page: a line of text and two ways out. Used wherever an action
// can't be taken back (abandoning an entry, closing one to begin another, setting an unreadable one aside, emptying
// the book). The caller appends it to the screen and removes it again; it holds no state of its own.
import { el, link } from './dom.ts';

export interface Question {
  lead: string;
  yes: string;
  no: string;
  onYes: () => void;
  onNo: () => void;
}

export function questionCard({ lead, yes, no, onYes, onNo }: Question): HTMLElement {
  return el(
    'div',
    'overlay',
    el(
      'div',
      'overlay-card',
      el('p', 'prose', lead),
      el('div', 'overlay-row', link(yes, onYes)),
      el('div', 'overlay-row', link(no, onNo)),
    ),
  );
}
