// A deliberately small screen stack. Screens are builder functions; showing one replaces the whole page.
// A stack (not URLs) because the app is touch-only and has exactly one "back" meaning, shared by the
// on-screen back link and the Android back button. A screen may install a back guard (to ask "really leave?")
// and a leave hook (to undo anything it changed globally, such as a story's colours); both reset on every change.

export type ScreenBuilder = (nav: Navigator) => HTMLElement;

export class Navigator {
  private readonly root: HTMLElement;
  private readonly stack: ScreenBuilder[] = [];
  private guard: (() => boolean) | null = null;
  private leaveHook: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  push(build: ScreenBuilder): void {
    this.stack.push(build);
    this.show();
  }

  /** Replace the whole stack with one screen. For moving from the first screen (or an error) to home. */
  reset(build: ScreenBuilder): void {
    this.stack.length = 0;
    this.push(build);
  }

  /** Go back one screen. Returns false when already on the first screen (nothing to pop). */
  pop(): boolean {
    if (this.guard?.()) return true;
    if (this.stack.length <= 1) return false;
    this.stack.pop();
    this.show();
    return true;
  }

  /** Return to the first screen, skipping any back guard. */
  popToRoot(): void {
    this.stack.length = Math.min(this.stack.length, 1);
    this.show();
  }

  /** While this screen is showing, back presses go to `guard` first. It returns true if it handled the press. */
  setGuard(guard: () => boolean): void {
    this.guard = guard;
  }

  /** Run `hook` once when this screen is replaced. */
  onLeave(hook: () => void): void {
    this.leaveHook = hook;
  }

  private show(): void {
    const build = this.stack[this.stack.length - 1];
    if (!build) return;
    this.leaveHook?.();
    this.leaveHook = null;
    this.guard = null;
    this.root.replaceChildren(build(this));
    window.scrollTo(0, 0);
  }
}
