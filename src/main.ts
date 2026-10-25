// Entry point: install the last-resort error screen first, open the record book, dress the page in the binding and text
// size the reader chose (they live in the book), wait briefly for that binding's typefaces so the first paint is already
// set in them, then show home. If the book won't open, a screen says so and offers a way forward instead, in Parchment.
import { App } from '@capacitor/app';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/paper.css';
import './styles/screens.css';
import { bindingFor } from './app/bindings.ts';
import { BookError, currentSettings, freshBook, openBook } from './app/book.ts';
import { showFatal } from './app/fatal.ts';
import { Navigator } from './app/router.ts';
import { applyBinding, applyTextSize, fontsReady, setBindingOverStory } from './app/theme.ts';
import { bookTroubleScreen } from './screens/bookTrouble.ts';
import { homeScreen } from './screens/home.ts';

const root = document.getElementById('app');
if (!root) throw new Error('The page has no #app element to write on.');

window.addEventListener('error', (event) => showFatal(root, event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => showFatal(root, event.reason));

/** Open the book and show home; if the book won't open, show why, with the ways forward. */
async function enter(nav: Navigator): Promise<void> {
  try {
    await openBook();
    const now = currentSettings();
    applyTextSize(now.textSize);
    setBindingOverStory(now.bindingOverStory);
    // No usable binding (they failed their checks) leaves the page on the fallback values, which are Parchment's.
    const binding = bindingFor(now.theme) ?? null;
    if (binding) applyBinding(binding);
    await fontsReady(binding);
    nav.reset(homeScreen);
  } catch (reason) {
    if (!(reason instanceof BookError)) throw reason;
    await fontsReady(null);
    nav.reset(
      bookTroubleScreen(reason, {
        retry: () => void enter(nav).catch((again: unknown) => showFatal(root as HTMLElement, again)),
        fresh: async () => {
          await freshBook();
          await enter(nav);
        },
      }),
    );
  }
}

async function start(): Promise<void> {
  const nav = new Navigator(root as HTMLElement);
  await enter(nav);

  // Android's back button: step back through screens, leave the app only from home.
  await App.addListener('backButton', () => {
    if (!nav.pop()) void App.exitApp();
  });
}

start().catch((reason: unknown) => showFatal(root, reason));
