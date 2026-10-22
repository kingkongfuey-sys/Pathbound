// Hero creation: pick one of the story's three archetypes, name the hero, and (if the archetype allows) choose
// pronouns. The name is only ever shown as text, never parsed, so any name is safe. From here a run begins.
import type { Navigator } from '../app/router.ts';
import { newSession } from '../app/session.ts';
import { voice } from '../copy/voice.ts';
import type { LoadedStory, PronounSetId } from '../content/types.ts';
import { startRun } from '../engine/play.ts';
import { makeSeed } from '../engine/rng.ts';
import { el, link } from '../ui/dom.ts';
import { backLink, page, pageHead } from '../ui/page.ts';
import { playScreen } from './play.ts';

const PRONOUN_IDS: PronounSetId[] = ['they', 'she', 'he'];

export function heroScreen(loaded: LoadedStory) {
  return (nav: Navigator): HTMLElement => {
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

    const begin = link(voice.hero.begin, () => {
      const name = input.value.trim();
      if (name === '') {
        error.textContent = voice.hero.nameMissing;
        input.focus();
        return;
      }
      const run = startRun(loaded, { archetypeId: selected?.id ?? '', name, pronouns, seed: makeSeed() });
      nav.push(playScreen(loaded, newSession(run)));
    });

    const nameLabel = el('label', 'field-label', voice.hero.nameLabel);
    nameLabel.htmlFor = 'hero-name';

    return page(
      backLink(nav),
      pageHead(voice.hero.heading),
      el('p', 'prose', voice.hero.lead),
      archetypeList,
      el('div', 'name-block', nameLabel, input, error, suggestionRow),
      pronounBlock,
      el('div', 'begin-row', begin),
    );
  };
}
