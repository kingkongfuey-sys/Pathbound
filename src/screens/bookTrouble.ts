// Shown instead of home when the record book itself can't be opened. Two ways forward: try again (a hiccup, or a
// book that has just been fixed), or start a fresh book, which empties everything and so asks first. A book that is
// merely newer than this build offers only "try again": it is fine, and nothing here should ever touch it.
import { showFatal } from '../app/fatal.ts';
import type { BookError } from '../app/book.ts';
import type { Navigator } from '../app/router.ts';
import { voice } from '../copy/voice.ts';
import { el, link } from '../ui/dom.ts';
import { questionCard } from '../ui/overlay.ts';
import { page, pageHead } from '../ui/page.ts';

export interface BookTroubleActions {
  retry: () => void;
  fresh: () => Promise<void>;
}

export function bookTroubleScreen(error: BookError, actions: BookTroubleActions) {
  return (nav: Navigator): HTMLElement => {
    const section = page();
    let question: HTMLElement | null = null;
    const closeQuestion = (): void => {
      question?.remove();
      question = null;
    };
    const ask = (): void => {
      question = questionCard({
        lead: voice.book.freshLead,
        yes: voice.book.freshYes,
        no: voice.book.freshNo,
        onYes: () => {
          actions.fresh().catch((reason: unknown) => showFatal(document.getElementById('app') as HTMLElement, reason));
        },
        onNo: closeQuestion,
      });
      section.append(question);
    };
    nav.setGuard(() => {
      if (!question) return false;
      closeQuestion();
      return true;
    });

    const column = section.firstElementChild as HTMLElement;
    column.append(pageHead(voice.book.troubleHeading), el('p', 'prose', voice.book.troubleLead), el('p', 'prose fatal-detail', error.message));
    if (error.tooNew) column.append(el('p', 'prose prose-quiet', voice.book.troubleTooNew));
    column.append(el('div', 'option-row', link(voice.book.retry, actions.retry, 'option')));
    if (!error.tooNew) column.append(el('div', 'option-row', link(voice.book.fresh, ask, 'option')));
    column.append(el('div', 'page-foot'));
    return section;
  };
}
