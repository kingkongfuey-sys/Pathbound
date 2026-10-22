// Reveals paragraphs a few characters at a time without ever moving the layout: the whole text is on the page
// from the first frame, and the part not yet "written" is simply transparent. Each frame touches only the
// paragraph being revealed (two text nodes), so there is no reflow and no per-character elements.
import { el } from './dom.ts';

export interface Typewriter {
  /** Show everything immediately. Safe to call more than once. */
  finish(): void;
}

export function typewrite(
  paragraphs: HTMLElement[],
  texts: string[],
  charsPerSecond: number,
  onDone: () => void,
): Typewriter {
  const parts = paragraphs.map((p, i) => {
    const written = el('span', 'written');
    const unwritten = el('span', 'unwritten', texts[i] ?? '');
    p.replaceChildren(written, unwritten);
    return { written, unwritten, text: texts[i] ?? '' };
  });

  let done = false;
  let frame = 0;

  const complete = (): void => {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    for (const part of parts) {
      part.written.textContent = part.text;
      part.unwritten.textContent = '';
    }
    onDone();
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || charsPerSecond <= 0) {
    complete();
    return { finish: complete };
  }

  const total = parts.reduce((sum, part) => sum + part.text.length, 0);
  const startedAt = performance.now();
  let shown = 0;

  const tick = (now: number): void => {
    if (done) return;
    const target = Math.min(total, Math.floor(((now - startedAt) * charsPerSecond) / 1000));
    if (target !== shown) {
      shown = target;
      let remaining = target;
      for (const part of parts) {
        const count = Math.max(0, Math.min(part.text.length, remaining));
        remaining -= part.text.length;
        if (part.written.textContent?.length !== count) {
          part.written.textContent = part.text.slice(0, count);
          part.unwritten.textContent = part.text.slice(count);
        }
      }
    }
    if (shown >= total) complete();
    else frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return { finish: complete };
}
