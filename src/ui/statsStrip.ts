// The stats strip pinned to the top of the story screen: HP (exact), gold, the chapter as tally marks and
// a link to the satchel. Two ruled lines tall, set like a ledger header. It is rebuilt on every turn, so it
// never needs to know what changed; it only reads the current status.
import { voice } from '../copy/voice.ts';
import type { Status } from '../engine/status.ts';
import { el, link } from './dom.ts';
import { tallyMarks } from './tally.ts';

export function statsStrip(status: Status, onSatchel: () => void): HTMLElement {
  const low = status.hp * 4 <= status.maxHp;
  const chapterLabel = voice.strip.chapter(status.chapter.index + 1, status.chapter.count, status.chapter.title);
  return el(
    'header',
    'strip',
    el(
      'div',
      'strip-numbers',
      el('span', low ? 'strip-hp strip-low' : 'strip-hp', voice.strip.hp(status.hp, status.maxHp)),
      el('span', 'strip-gold', voice.strip.gold(status.gold, status.currencySymbol)),
      link(voice.strip.satchel, onSatchel, 'strip-link'),
    ),
    el(
      'div',
      'strip-chapter',
      tallyMarks(status.chapter.count, status.chapter.index + 1, chapterLabel),
      el('span', 'strip-chapter-title', status.chapter.title),
    ),
  );
}
