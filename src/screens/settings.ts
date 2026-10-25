// Settings: how the book is dressed and read to you. Three rules, each a short list of ledger lines with the one in use
// marked: the binding (the app's look, one line per file in content/themes), writing speed (slow to instant) and text
// size (small to largest). Choosing one takes effect at once, is kept in the record book, and the last two show
// themselves in a sample line so the reader can judge them (a binding needs no sample: the whole page is the sample).
// If dev mode has been opened, the way to shut it again is here; its tools are on a run's page.
import { bindings } from '../app/bindings.ts';
import { changeSetting, currentSettings } from '../app/book.ts';
import type { Navigator } from '../app/router.ts';
import { SPEEDS, speedCps, TEXT_SIZES } from '../app/settings.ts';
import type { Settings, TextSize, TypewriterSpeed } from '../app/settings.ts';
import { applyBinding, applyTextSize, fontsReady, setBindingOverStory } from '../app/theme.ts';
import { voice } from '../copy/voice.ts';
import { el, link } from '../ui/dom.ts';
import { inkRule } from '../ui/inkRule.ts';
import { backLink, page, pageHead } from '../ui/page.ts';
import { typewrite } from '../ui/typewriter.ts';
import type { Typewriter } from '../ui/typewriter.ts';

/**
 * A list of ledger lines, one per option, with "in use" beside the current one. Returns the list and a way to move the
 * mark. An option may carry a line of detail under its name, set the way the satchel sets an item's.
 */
function optionRows<T extends string>(
  options: readonly T[],
  names: Record<T, string>,
  current: T,
  pick: (option: T) => void,
  details?: Record<T, string>,
): { list: HTMLElement; mark: (chosen: T) => void } {
  const marks = new Map<T, HTMLElement>();
  const rows = options.map((option) => {
    const tag = el('span', 'entry-tag entry-tag-dark');
    marks.set(option, tag);
    return el(
      'li',
      'entry',
      el('div', 'entry-head codex-menu-row', link(names[option], () => pick(option)), el('span', 'leader'), tag),
      details ? el('p', 'entry-detail', details[option]) : null,
    );
  });
  const mark = (chosen: T): void => {
    for (const [option, node] of marks) node.textContent = option === chosen ? voice.settings.inUse : '';
  };
  mark(current);
  return { list: el('ul', 'entries', ...rows), mark };
}

export function settingsScreen(nav: Navigator): HTMLElement {
  const now = currentSettings();
  const trouble = el('p', 'aside aside-trouble');
  const sample = el('p', 'prose codex-sample');
  let writer: Typewriter | null = null;

  const keep = <K extends keyof Settings>(key: K, value: Settings[K]): void => {
    trouble.textContent = '';
    changeSetting(key, value).catch((reason: unknown) => {
      trouble.textContent = voice.settings.notKept(reason instanceof Error ? reason.message : String(reason));
    });
  };
  const show = (charsPerSecond: number): void => {
    writer?.finish();
    writer = typewrite([sample], [voice.settings.sample], charsPerSecond, () => undefined);
  };

  const speeds = optionRows<TypewriterSpeed>(SPEEDS, voice.settings.speeds, now.typewriter, (speed) => {
    speeds.mark(speed);
    show(speedCps(speed));
    keep('typewriter', speed);
  });
  const sizes = optionRows<TextSize>(TEXT_SIZES, voice.settings.sizes, now.textSize, (size) => {
    sizes.mark(size);
    applyTextSize(size);
    show(0);
    keep('textSize', size);
  });

  // The binding. The mark moves at once; the page changes as soon as the new typefaces are in hand (a moment, they are
  // bundled), and only the latest tap counts if there are two in quick succession. The rule under this page's own
  // title was drawn in the old binding, so it is drawn again.
  const found = bindings();
  let latest = 0;
  const bindingSection: HTMLElement[] = [el('h2', 'ledger-label', voice.settings.bindingLabel)];
  if (found.themes.length > 0) {
    const ids = found.themes.map((t) => t.id);
    const names = Object.fromEntries(found.themes.map((t) => [t.id, t.name])) as Record<string, string>;
    const notes = Object.fromEntries(found.themes.map((t) => [t.id, t.note])) as Record<string, string>;
    const rows = optionRows<string>(
      ids,
      names,
      now.theme,
      (id) => {
        const chosen = found.themes.find((t) => t.id === id);
        if (!chosen) return;
        rows.mark(id);
        latest += 1;
        const mine = latest;
        void fontsReady(chosen).then(() => {
          if (mine !== latest) return;
          applyBinding(chosen);
          column.querySelector('.ink-rule')?.replaceWith(inkRule());
        });
        keep('theme', id);
      },
      notes,
    );
    bindingSection.push(el('p', 'prose prose-quiet', voice.settings.bindingNote), rows.list);
  } else {
    const first = found.problems[0];
    bindingSection.push(el('p', 'aside aside-trouble', voice.settings.bindingDamaged(first ? `${first.file}, ${first.where}: ${first.message}` : voice.fatal.unknown)));
  }

  // The tickbox: when ticked, the reader's binding is kept for every story. Set in the ledger's own manner, one line, one mark.
  const tick = el('span', 'entry-tag entry-tag-dark');
  const showTick = (on: boolean): void => {
    tick.textContent = on ? voice.settings.ticked : voice.settings.unticked;
  };
  let ticked = now.bindingOverStory;
  showTick(ticked);
  const storyDress = el(
    'ul',
    'entries',
    el(
      'li',
      'entry',
      el(
        'div',
        'entry-head codex-menu-row',
        link(voice.settings.storyDressRow, () => {
          ticked = !ticked;
          showTick(ticked);
          setBindingOverStory(ticked);
          keep('bindingOverStory', ticked);
        }),
        el('span', 'leader'),
        tick,
      ),
    ),
  );

  const column = page(
    backLink(nav),
    pageHead(voice.settings.heading),
    el('p', 'prose', voice.settings.lead),
    ...bindingSection,
    el('h2', 'ledger-label', voice.settings.storyDressLabel),
    el('p', 'prose prose-quiet', voice.settings.storyDressNote),
    storyDress,
    el('h2', 'ledger-label', voice.settings.speedLabel),
    speeds.list,
    el('h2', 'ledger-label', voice.settings.sizeLabel),
    sizes.list,
    el('p', 'prose prose-quiet', voice.settings.sampleHint),
    sample,
    trouble,
  );
  const inner = column.firstElementChild as HTMLElement;
  if (now.dev) {
    inner.append(
      el('h2', 'ledger-label', voice.settings.devLabel),
      el('p', 'prose prose-quiet', voice.settings.devNote),
      el(
        'div',
        'option-row',
        link(
          voice.settings.devOff,
          () => {
            changeSetting('dev', false).then(
              () => nav.popToRoot(),
              (reason: unknown) => {
                trouble.textContent = voice.settings.notKept(reason instanceof Error ? reason.message : String(reason));
              },
            );
          },
          'option',
        ),
      ),
    );
  }
  inner.append(el('div', 'page-foot'));
  return column;
}
