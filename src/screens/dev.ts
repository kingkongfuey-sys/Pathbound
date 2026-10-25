// The dev screen, reached from "Dev" on a run's page once the hidden dev setting is on. Tools for testing a story:
// show and set the run's seed, toggle god-mode and skipped story text, force what the next encounter will be, and
// jump to any scene by id. Every action changes the run through the engine (engine/dev.ts, or the options play.ts
// honours), so the result is an ordinary run: it is checked, saved and resumable like any other. Nothing here
// is shown to a reader who hasn't opened dev mode.
import { changeSetting, commit, currentSettings } from '../app/book.ts';
import type { Navigator } from '../app/router.ts';
import type { Session } from '../app/session.ts';
import { applyTheme } from '../app/theme.ts';
import { voice } from '../copy/voice.ts';
import type { LoadedStory } from '../content/types.ts';
import { devJump, devPool, devReseed, devScenes } from '../engine/dev.ts';
import { el, link } from '../ui/dom.ts';
import { backLink, page, pageHead } from '../ui/page.ts';

export function devScreen(loaded: LoadedStory, session: Session) {
  return (nav: Navigator): HTMLElement => {
    nav.onLeave(applyTheme(loaded.story));
    const note = el('p', 'aside');
    const say = (text: string): void => {
      note.textContent = text;
    };

    // ---- seed
    const seedShown = el('p', 'prose dev-seed', session.run.seed);
    const seedField = el('input', 'name-field');
    seedField.type = 'text';
    seedField.maxLength = 32;
    seedField.autocomplete = 'off';
    seedField.spellcheck = false;
    seedField.setAttribute('aria-label', voice.dev.seed);
    const setSeed = (): void => {
      try {
        session.run = devReseed(session.run, seedField.value);
        commit(loaded, session);
        seedShown.textContent = session.run.seed;
        seedField.value = '';
        say(voice.dev.seedDone(session.run.seed));
      } catch {
        say(voice.dev.seedEmpty);
      }
    };

    // ---- toggles (kept as settings, so they hold across runs until switched off)
    const toggleRow = (label: string, key: 'god' | 'skipText'): HTMLElement => {
      const tag = el('span', 'entry-tag entry-tag-dark');
      const paint = (): void => {
        tag.textContent = currentSettings()[key] ? voice.dev.on : voice.dev.off;
      };
      paint();
      return el(
        'li',
        'entry',
        el(
          'div',
          'entry-head codex-menu-row',
          link(label, () => {
            changeSetting(key, !currentSettings()[key]).then(paint, (reason: unknown) => say(reason instanceof Error ? reason.message : String(reason)));
            paint();
          }),
          el('span', 'leader'),
          tag,
        ),
      );
    };

    // ---- forced encounter
    const chapterId = loaded.scenes.get(session.run.sceneId)?.chapterId ?? '';
    const pool = devPool(loaded, chapterId);
    const forced = el('p', 'prose prose-quiet');
    const paintForced = (): void => {
      const picked = pool.find((p) => p.index === session.devForce);
      forced.textContent = picked ? voice.dev.encounterPicked(picked.label) : voice.dev.encounterNone;
    };
    paintForced();
    const pickRows = pool.map((entry) =>
      el(
        'li',
        'entry',
        el(
          'div',
          'entry-head codex-menu-row',
          link(entry.label, () => {
            session.devForce = entry.index;
            paintForced();
          }),
        ),
      ),
    );

    // ---- jump
    const jumpLists: HTMLElement[] = [];
    let lastChapter = '';
    let rows: HTMLElement[] = [];
    const flush = (): void => {
      if (rows.length > 0) jumpLists.push(el('ul', 'entries', ...rows));
      rows = [];
    };
    for (const scene of devScenes(loaded)) {
      if (scene.chapterTitle !== lastChapter) {
        flush();
        jumpLists.push(el('h2', 'ledger-label', scene.chapterTitle));
        lastChapter = scene.chapterTitle;
      }
      rows.push(
        el(
          'li',
          'entry',
          el(
            'div',
            'entry-head codex-menu-row',
            link(voice.dev.scene(scene.id, scene.type), () => {
              try {
                session.run = devJump(loaded, session.run, scene.id);
                session.devForce = null;
                session.turn += 1;
                commit(loaded, session);
                nav.pop();
              } catch (reason) {
                say(reason instanceof Error ? reason.message : String(reason));
              }
            }),
          ),
        ),
      );
    }
    flush();

    return page(
      backLink(nav),
      pageHead(voice.dev.heading),
      el('p', 'prose', voice.dev.lead),
      note,
      el('h2', 'ledger-label', voice.dev.seed),
      seedShown,
      el('p', 'prose prose-quiet', voice.dev.seedHelp),
      seedField,
      el('div', 'option-row', link(voice.dev.seedSet, setSeed, 'option')),
      el('h2', 'ledger-label', voice.dev.god),
      el('p', 'prose prose-quiet', voice.dev.godNote),
      el('ul', 'entries', toggleRow(voice.dev.god, 'god')),
      el('h2', 'ledger-label', voice.dev.skip),
      el('p', 'prose prose-quiet', voice.dev.skipNote),
      el('ul', 'entries', toggleRow(voice.dev.skip, 'skipText')),
      el('h2', 'ledger-label', voice.dev.encounter),
      el('p', 'prose prose-quiet', voice.dev.encounterLead),
      forced,
      pool.length === 0 ? el('p', 'prose prose-quiet', voice.dev.encounterEmpty) : el('ul', 'entries', ...pickRows),
      el('div', 'option-row', link(voice.dev.encounterClear, () => {
        session.devForce = null;
        paintForced();
      }, 'option')),
      el('h2', 'ledger-label', voice.dev.jump),
      el('p', 'prose prose-quiet', voice.dev.jumpLead),
      ...jumpLists,
      el('div', 'page-foot'),
    );
  };
}
