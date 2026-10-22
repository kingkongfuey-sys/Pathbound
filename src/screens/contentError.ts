// Shown when a story's files fail validation: names each file and the place in it, so the author can fix it.
import type { Navigator } from '../app/router.ts';
import { voice } from '../copy/voice.ts';
import type { ContentProblem } from '../content/types.ts';
import { el } from '../ui/dom.ts';
import { backLink, page, pageHead } from '../ui/page.ts';

const SHOWN = 10;

export function contentErrorScreen(problems: ContentProblem[]) {
  return (nav: Navigator): HTMLElement => {
    const list = el(
      'ul',
      'problems',
      ...problems.slice(0, SHOWN).map((problem) =>
        el(
          'li',
          'problem',
          el('span', 'problem-file', `${problem.file}, ${problem.where}`),
          el('span', 'problem-message', problem.message),
        ),
      ),
    );
    return page(
      backLink(nav),
      pageHead(voice.contentError.heading),
      el('p', 'prose', voice.contentError.lead),
      list,
      problems.length > SHOWN ? el('p', 'prose prose-quiet', voice.contentError.more(problems.length - SHOWN)) : null,
    );
  };
}
