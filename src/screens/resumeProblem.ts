// Shown when the open entry can't be played: damaged, written by something newer, or belonging to a tale that can't
// be opened. Nothing is deleted. The one way forward is to set the entry aside: it is moved to a drawer in the
// book (kept, not destroyed, so a later build may be able to read it), closed in the ledger as lost, and the slot
// is freed. Asking first, because that is the only part that can't simply be backed out of.
import { setAsideEntry } from '../app/book.ts';
import { showFatal } from '../app/fatal.ts';
import type { Navigator } from '../app/router.ts';
import { voice } from '../copy/voice.ts';
import { el, link } from '../ui/dom.ts';
import { questionCard } from '../ui/overlay.ts';
import { backLink, page, pageHead } from '../ui/page.ts';

export interface ResumeProblem {
  kind: 'damaged' | 'newer' | 'unplayable';
  reason: string;
}

export function resumeProblemScreen(problem: ResumeProblem) {
  return (nav: Navigator): HTMLElement => {
    const lead =
      problem.kind === 'damaged'
        ? voice.book.problemDamaged(problem.reason)
        : problem.kind === 'newer'
          ? voice.book.problemNewer(problem.reason)
          : voice.book.problemUnplayable(problem.reason);

    const section = page();
    let question: HTMLElement | null = null;
    const closeQuestion = (): void => {
      question?.remove();
      question = null;
    };
    const ask = (): void => {
      question = questionCard({
        lead: voice.book.setAsideLead,
        yes: voice.book.setAsideYes,
        no: voice.book.setAsideNo,
        onYes: () => {
          setAsideEntry(problem.reason).then(() => nav.popToRoot(), (reason: unknown) => showFatal(document.getElementById('app') as HTMLElement, reason));
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

    (section.firstElementChild as HTMLElement).append(
      backLink(nav),
      pageHead(voice.book.problemHeading),
      el('p', 'prose', lead),
      el('p', 'prose prose-quiet', voice.book.problemNote),
      el('div', 'option-row', link(voice.book.setAside, ask, 'option')),
      el('div', 'page-foot'),
    );
    return section;
  };
}
