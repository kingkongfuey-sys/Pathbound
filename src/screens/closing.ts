// The closing account: the page every entry ends on, victory or death. Same ledger as everywhere else, set as dotted
// leaders from a label to an exact figure, with the chapter reached drawn as tally marks. By the time this opens the
// run's history row and its codex unlocks were written in the same transaction as its last page, so nothing on this
// screen is what keeps them; it only reports them. Leaving it (the link or the back button) is what lets the entry
// stop being resumable, and that is the only thing leaving does.
import { closeEntry, closingView } from '../app/book.ts';
import type { Navigator } from '../app/router.ts';
import type { Session } from '../app/session.ts';
import { applyTheme } from '../app/theme.ts';
import { voice } from '../copy/voice.ts';
import type { LoadedStory } from '../content/types.ts';
import { statusOf } from '../engine/status.ts';
import type { UnlockCounts } from '../save/types.ts';
import { el, link } from '../ui/dom.ts';
import { page, pageHead } from '../ui/page.ts';
import { tallyMarks } from '../ui/tally.ts';

function keptLine(fresh: UnlockCounts): string {
  const parts: string[] = [];
  if (fresh.story > 0) parts.push(voice.counts.tales(fresh.story));
  if (fresh.monster > 0) parts.push(voice.counts.foes(fresh.monster));
  if (fresh.item > 0) parts.push(voice.counts.items(fresh.item));
  if (fresh.lore > 0) parts.push(voice.counts.lore(fresh.lore));
  return parts.length === 0 ? voice.closing.nothingNew : voice.closing.kept(parts);
}

function row(label: string, value: string): HTMLElement {
  return el('li', 'closing-row', el('span', 'closing-label', label), el('span', 'leader'), el('span', 'closing-value', value));
}

export function closingScreen(loaded: LoadedStory, session: Session) {
  return (nav: Navigator): HTMLElement => {
    nav.onLeave(applyTheme(loaded.story));

    const run = session.run;
    const ending = run.ending;
    if (run.status !== 'ended' || ending === null) throw new Error('The closing account was asked for an entry that is still open.');
    const dead = ending.kind === 'death';
    const status = statusOf(loaded, run);
    const calling = loaded.story.archetypes.find((a) => a.id === run.archetypeId)?.name ?? run.archetypeId;
    const reachedLabel = voice.closing.reachedValue(status.chapter.index + 1, status.chapter.count, status.chapter.title);

    const kept = el('p', 'prose prose-quiet closing-kept');
    closingView(session.runId).then(
      (view) => kept.replaceChildren(keptLine(view.fresh)),
      (reason: unknown) => kept.replaceChildren(reason instanceof Error ? reason.message : String(reason)),
    );

    const leave = (): void => {
      // Whether or not the book can be updated, the reader is done here; an entry left resumable is harmless.
      closeEntry(session.runId).then(
        () => nav.popToRoot(),
        () => nav.popToRoot(),
      );
    };
    nav.setGuard(() => {
      leave();
      return true;
    });

    return page(
      pageHead(dead ? voice.closing.headingDeath : voice.closing.headingVictory),
      el('p', 'epigraph', dead ? voice.closing.epigraphDeath : voice.closing.epigraphVictory),
      el('div', 'closing-tally', tallyMarks(status.chapter.count, status.chapter.index + 1, reachedLabel)),
      el(
        'ul',
        'closing-rows',
        row(voice.closing.hero, voice.closing.heroValue(run.heroName, calling)),
        row(voice.closing.tale, loaded.story.title),
        row(dead ? voice.closing.endingDeath : voice.closing.endingVictory, ending.title),
        row(voice.closing.reached, reachedLabel),
        row(voice.closing.choices, String(run.tally.choices)),
        row(voice.closing.rounds, String(run.tally.rounds)),
        row(voice.closing.felled, String(run.tally.felled)),
        row(voice.closing.fled, String(run.tally.fled)),
        row(voice.closing.level, String(run.level)),
        row(voice.closing.purse, `${run.gold}${loaded.story.currency.symbol}`),
      ),
      kept,
      el('div', 'option-row', link(voice.closing.desk, leave, 'option')),
      el('div', 'page-foot'),
    );
  };
}
