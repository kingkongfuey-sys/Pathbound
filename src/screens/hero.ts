// Hero creation: pick one of the story's three archetypes, name the hero, and (if the archetype allows) choose
// pronouns, in the story's own colours. The name is only ever shown as text, never parsed, so any name is safe. From here a run begins, and its
// first page is saved before the reader sees it. If another entry is still open, beginning closes it unfinished,
// so the reader is asked first.
import { currentEntry, currentSettings, keepUnreadable, startEntry } from '../app/book.ts';
import { showFatal } from '../app/fatal.ts';
import type { Navigator } from '../app/router.ts';
import { newSession } from '../app/session.ts';
import { applyTheme } from '../app/theme.ts';
import { voice } from '../copy/voice.ts';
import type { LoadedStory, PronounSetId } from '../content/types.ts';
import { startRun } from '../engine/play.ts';
import { makeSeed } from '../engine/rng.ts';
import { el, link } from '../ui/dom.ts';
import { questionCard } from '../ui/overlay.ts';
import { backLink, page, pageHead } from '../ui/page.ts';
import { playScreen } from './play.ts';

const PRONOUN_IDS: PronounSetId[] = ['they', 'she', 'he'];

export function heroScreen(loaded: LoadedStory) {
  return (nav: Navigator): HTMLElement => {
    nav.onLeave(applyTheme(loaded.story));
    const archetypes = loaded.story.archetypes;
    let selected = archetypes[0];
    if (!selected) throw new Error('The story has no archetypes.');
    let pronouns: PronounSetId = selected.pronouns.default;
    let nameTouched = false;

    const input = el('input', 'name-field');
    input.type = 'text';
    input.maxLength = 24;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'words');
    input.id = 'hero-name';
    input.value = selected.suggestedNames[0] ?? '';
    input.addEventListener('input', () => {
      nameTouched = true;
      error.textContent = '';
    });

    const archetypeList = el('div', 'archetypes');
    const suggestionRow = el('div', 'suggestions');
    const pronounBlock = el('div', 'pronouns');
    const error = el('p', 'form-error');
    error.setAttribute('role', 'alert');

    const refresh = (): void => {
      const current = selected;
      if (!current) return;
      archetypeList.replaceChildren(
        ...archetypes.map((archetype) => {
          const skills = archetype.startingSkills.map((s) => s.name).join(', ');
          const button = el(
            'button',
            'archetype',
            el('span', 'arch-name', archetype.name),
            el('span', 'arch-tagline', archetype.tagline),
            el('span', 'arch-stats', voice.hero.stats(archetype.stats)),
            el('span', 'arch-stats', voice.hero.skills(skills)),
          );
          button.type = 'button';
          button.setAttribute('aria-pressed', String(archetype.id === current.id));
          button.addEventListener('click', () => {
            if (!nameTouched) input.value = archetype.suggestedNames[0] ?? '';
            selected = archetype;
            pronouns = archetype.pronouns.default;
            refresh();
          });
          return button;
        }),
      );
      suggestionRow.replaceChildren(
        el('p', 'field-label', voice.hero.suggestions),
        ...current.suggestedNames.map((name) =>
          link(name, () => {
            input.value = name;
            nameTouched = true;
            error.textContent = '';
          }, 'link-small'),
        ),
      );
      if (current.pronouns.selectable) {
        pronounBlock.replaceChildren(
          el('p', 'field-label', voice.hero.pronounsLabel),
          ...PRONOUN_IDS.map((id) => {
            const option = link(voice.hero.pronouns[id], () => {
              pronouns = id;
              refresh();
            }, 'link-small');
            option.setAttribute('aria-pressed', String(id === pronouns));
            return option;
          }),
        );
      } else {
        pronounBlock.replaceChildren();
      }
    };
    refresh();

    const section = page();
    let question: HTMLElement | null = null;
    const closeQuestion = (): void => {
      question?.remove();
      question = null;
    };

    // Dev mode only: a seed to begin with, so a run can be replayed exactly. Blank means a fresh random one.
    const seedField = el('input', 'name-field');
    seedField.type = 'text';
    seedField.maxLength = 32;
    seedField.autocomplete = 'off';
    seedField.spellcheck = false;
    seedField.id = 'hero-seed';
    const seedLabel = el('label', 'field-label', voice.dev.heroSeed);
    seedLabel.htmlFor = 'hero-seed';
    const seedFor = (): string => (seedField.value.trim() === '' ? makeSeed() : seedField.value.trim());

    /** Write the entry down and open its first page. An unreadable entry still open is put in the drawer first. */
    const write = (name: string): void => {
      closeQuestion();
      keepUnreadable()
        .then(() => {
          const run = startRun(loaded, { archetypeId: selected?.id ?? '', name, pronouns, seed: seedFor() });
          const session = newSession(run);
          startEntry(loaded, session);
          nav.push(playScreen(loaded, session));
        })
        .catch((reason: unknown) => showFatal(document.getElementById('app') as HTMLElement, reason));
    };

    const begin = link(voice.hero.begin, () => {
      const name = input.value.trim();
      if (name === '') {
        error.textContent = voice.hero.nameMissing;
        input.focus();
        return;
      }
      const open = currentEntry();
      if (open && !open.closed) {
        question = questionCard({ lead: voice.hero.openLead, yes: voice.hero.openYes, no: voice.hero.openNo, onYes: () => write(name), onNo: closeQuestion });
        section.append(question);
      } else {
        write(name);
      }
    });

    const nameLabel = el('label', 'field-label', voice.hero.nameLabel);
    nameLabel.htmlFor = 'hero-name';

    const column = section.firstElementChild as HTMLElement;
    column.append(
      backLink(nav),
      pageHead(voice.hero.heading),
      el('p', 'prose', voice.hero.lead),
      archetypeList,
      el('div', 'name-block', nameLabel, input, error, suggestionRow),
      pronounBlock,
    );
    if (currentSettings().dev) column.append(el('div', 'name-block', seedLabel, seedField, el('p', 'prose prose-quiet', voice.dev.heroSeedHint)));
    column.append(el('div', 'begin-row', begin));
    nav.setGuard(() => {
      if (!question) return false;
      closeQuestion();
      return true;
    });
    return section;
  };
}
