// Last-resort screen. If anything throws that nothing else caught, the reader sees what broke,
// in the app's voice, instead of a blank page. It builds its own DOM and depends on nothing
// that could itself be the thing that broke (no router, no screens).
import { voice } from '../copy/voice.ts';
import { el } from '../ui/dom.ts';
import { page, pageHead } from '../ui/page.ts';

export function describeError(reason: unknown): string {
  if (reason instanceof Error && reason.message.trim() !== '') return reason.message;
  if (typeof reason === 'string' && reason.trim() !== '') return reason;
  return voice.fatal.unknown;
}

export function showFatal(root: HTMLElement, reason: unknown): void {
  root.replaceChildren(
    page(
      pageHead(voice.fatal.heading),
      el('p', 'prose', voice.fatal.lead),
      el('p', 'prose fatal-detail', describeError(reason)),
    ),
  );
}
