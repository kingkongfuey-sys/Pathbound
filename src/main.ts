// Entry point: install the last-resort error screen first, wait briefly for the two
// bundled typefaces so the first paint is already set in them, then open the home screen.
import { App } from '@capacitor/app';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/paper.css';
import './styles/screens.css';
import { showFatal } from './app/fatal.ts';
import { Navigator } from './app/router.ts';
import { homeScreen } from './screens/home.ts';

const root = document.getElementById('app');
if (!root) throw new Error('The page has no #app element to write on.');

window.addEventListener('error', (event) => showFatal(root, event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => showFatal(root, event.reason));

async function fontsReady(): Promise<void> {
  const wanted = [
    document.fonts.load('64px "IM Fell French Canon"'),
    document.fonts.load('20px "IM Fell English"'),
    document.fonts.load('italic 20px "IM Fell English"'),
  ];
  const giveUp = new Promise<void>((resolve) => setTimeout(resolve, 1200));
  await Promise.race([Promise.all(wanted).then(() => undefined), giveUp]);
}

async function start(): Promise<void> {
  await fontsReady();
  const nav = new Navigator(root as HTMLElement);
  nav.push(homeScreen);

  // Android's back button: step back through screens, leave the app only from home.
  await App.addListener('backButton', () => {
    if (!nav.pop()) void App.exitApp();
  });
}

start().catch((reason: unknown) => showFatal(root, reason));
