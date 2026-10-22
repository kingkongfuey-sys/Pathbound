// Story shelf: lists the stories found in content/stories. Choosing one reads and checks it, then moves on to
// creating the hero. A story whose files are broken still appears, and opening it explains what is wrong.
import { showFatal } from '../app/fatal.ts';
import type { Navigator } from '../app/router.ts';
import { voice } from '../copy/voice.ts';
import { ContentError, listStories, loadStory } from '../content/loader.ts';
import type { StoryListing } from '../content/loader.ts';
import { el } from '../ui/dom.ts';
import { backLink, page, pageHead } from '../ui/page.ts';
import { contentErrorScreen } from './contentError.ts';
import { heroScreen } from './hero.ts';

function row(nav: Navigator, listing: StoryListing): HTMLElement {
  const meta = listing.damaged
    ? voice.shelf.damaged
    : `${listing.rating ? voice.shelf.ratings[listing.rating] : ''}. ${listing.toneLine}`;
  const button = el(
    'button',
    'story-row',
    el('span', 'story-title', listing.title),
    listing.blurb ? el('span', 'story-blurb', listing.blurb) : null,
    el('span', 'story-meta', meta),
  );
  button.type = 'button';
  button.addEventListener('click', () => {
    button.disabled = true;
    loadStory(listing.folder)
      .then((loaded) => nav.push(heroScreen(loaded)))
      .catch((error: unknown) => {
        button.disabled = false;
        if (error instanceof ContentError) nav.push(contentErrorScreen(error.problems));
        else showFatal(document.getElementById('app') as HTMLElement, error);
      });
  });
  return button;
}

export function shelfScreen(nav: Navigator): HTMLElement {
  const list = el('div', 'shelf-list', el('p', 'prose prose-quiet', voice.shelf.reading));
  listStories()
    .then((listings) => {
      if (listings.length === 0) {
        list.replaceChildren(el('p', 'prose', voice.shelf.empty), el('p', 'prose prose-quiet', voice.shelf.emptyHint));
      } else {
        list.replaceChildren(...listings.map((listing) => row(nav, listing)));
      }
    })
    .catch((error: unknown) => showFatal(document.getElementById('app') as HTMLElement, error));
  return page(backLink(nav), pageHead(voice.shelf.heading), list);
}
