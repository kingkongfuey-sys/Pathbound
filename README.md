# Pathbound

A text-first RPG kept as a ledger. Android app built with Capacitor; every word of story is data, every
word of chrome is in one voice. Personal project, never published, fully offline.

Current stage: **3 of 8** (stats strip, the satchel, equipment and items in scenes, on top of the Stage 2 content pipeline and engine). Build plan: see the stage report.

## Getting the app onto a phone

1. Push this project to GitHub (the workflow in `.github/workflows/android-debug.yml` runs on every push).
2. Open the repo's **Actions** tab, open the latest "Debug APK" run, download **pathbound-debug-apk** from Artifacts.
3. Unzip it, copy `app-debug.apk` to the phone, open it, allow "install unknown apps" if asked.

No local Android tools are needed. To preview in a desktop browser instead: `npm install`, `npm run dev`.

## Identity (do not drift)

**Voice: the Weary Chronicler.** A tired scribe keeping your record. Dry, wry, quietly fond. Plain sentences,
sentence case, no exclamation marks, no emoji, no apologies, no "welcome", no "loading". Menus are named like
a ledger: *Begin an entry*, *The ledger*, *House rules* (settings, Stage 7). Dying closes an entry. All UI copy
lives in `src/copy/voice.ts`; `npm run validate` rejects banned phrases, exclamation marks, emoji and straight
apostrophes in it.

**Colour** (tokens in `src/styles/tokens.css`):

| Role | Hex | Use |
|---|---|---|
| Paper | `#E1D8B6` | page base (foxed, slightly green-yellow) |
| Paper lit | `#EEE7CD` | lamp-lit centre (texture only) |
| Paper burnt | `#B8A97B` | edge darkening (texture only) |
| Ink | `#22201C` | text, ink rule |
| Faded ink | `#5B5340` | epigraph, secondary text |
| Ledger rule | `#A89A6C` | ruled lines |
| Oxblood | `#6B1E24` | margin rule, link underlines, errors |
| Oxblood wet | `#8E2E35` | pressed links |

**Typefaces** (bundled, Latin subset, no network): *IM Fell French Canon* for titles; *IM Fell English*
(roman for prose, italic for every link, epigraph and aside).

**Rhythm:** one ledger line unit, `--line: 32px`. Vertical spacing is built from it; a tap row is two lines (64px).

**Texture:** two tiled SVG turbulence layers (fine grain at 180px, soft foxing at 520px), a lamp-lit radial
centre and burnt radial edges, painted once on a fixed layer behind the content (`src/styles/paper.css`).

**Signature details:**
- *The ink rule*: a hand-ruled divider with a pooled drop of ink at its start (`src/ui/inkRule.ts`), under
  every title. Deterministic wobble, so it looks drawn but never changes between renders.
- *The margin rule*: a double oxblood line down the left of every page; all text sits to its right.
- Choices and menu items are italic inline text links with a thin oxblood underline: never buttons.
- *Tally marks*: the chapter indicator in the stats strip is drawn as tally marks, one stroke per chapter, every
  fifth slanting across the four before it (`src/ui/tally.ts`). Strokes up to the current chapter are inked, the
  rest faint, so the reader can see how far the story runs.
- *Dotted leaders*: in the satchel, each item sits on a ledger line, name, row of dots, action, the way an account
  book ties a name to its figure. The dots are baseline-aligned (`.leader` in `screens.css`).

## Folder map and naming

```
src/
  main.ts            entry: error handler, font wait, home screen, Android back button
  app/               router.ts (screen stack), session.ts (the run as screens hold it), fatal.ts (error screen),
                     theme.ts (story colours), reader.ts
  content/           types, token grammar, schema validators, integrity checks, validate.ts, loader.ts
  engine/            rng, run state, conditions, effects, play (the narrative loop), inventory (equip, use),
                     status (numbers for the strip); no DOM
  copy/voice.ts      all UI copy
  screens/           one file per screen (home, shelf, hero, play, satchel, ledger, contentError)
  ui/                dom.ts, page.ts (page frame), inkRule.ts, typewriter.ts, tally.ts, statsStrip.ts
  styles/            fonts, tokens, paper (texture), screens (layout and type)
content/             schemas (content/schema) and stories (content/stories/<id>); see docs/schemas.md
docs/schemas.md      the content format, token grammar and validator rules
scripts/validate.mjs voice check plus validation of every story
scripts/selftest.mjs checks that the validator catches broken content and that the engine behaves
android/             Capacitor Android project (committed; generated bits are git-ignored)
.github/workflows/   debug APK build
```
Files are lower camelCase, one concern each. Screens are `<name>Screen` functions.

## Subsystem notes

**Screen router (`app/router.ts`).** A plain stack of screen-builder functions. Touch-only, one meaning of
"back", shared by the on-screen link and the Android back button, so a URL router would be machinery with
nothing to do. Popping at the bottom returns false and `main.ts` exits the app from home.

**Voice module (`copy/voice.ts`).** One typed object holds every string the chrome says. Keeping it in one file
means the voice can be reviewed in a single read and checked by a script, and nothing in screen code can slip
a stray "Oops" in.

**Fatal screen (`app/fatal.ts`).** Any uncaught error or rejected promise replaces the page with the real
message, in voice, so a failure is never a white screen. It builds its own DOM and uses no screen or router
code, so it still works if those are the broken part.

**Build pipeline.** Vite bundles to `dist/`, `cap sync` copies it into the Android project, Gradle makes the
debug APK. The manifest requests no permissions (offline-first) and locks portrait.

**Content pipeline (`content/`).** A story is validated in three layers: each file is parsed (a syntax error
names the file), checked against its JSON Schema, and only then run through cross-file integrity checks that
assume well-shaped data. One implementation serves the app and `npm run validate`: the schemas are passed in
rather than imported, and the TypeScript is written in Node-runnable form (explicit `.ts` imports, no enums or
parameter properties), so the build script runs the very code the phone runs. Stories load lazily as raw text so a
broken file is reported in-app by name instead of failing the whole bundle.

**Engine (`engine/`).** Plain functions over a plain `RunState` (no classes, no DOM), so a run can be copied,
compared in tests and, from Stage 5, stored as-is. Every change returns a new state. Effects apply before the
move; HP at zero diverts to the story's default death ending; encounter detours push the real destination on a
return stack and `$return` pops it.

**Randomness (`engine/rng.ts`).** One seed per run, split into named streams (sfc32, seeded by hashing seed and
stream name); each stream's state lives in the run. Separate streams mean combat can later roll as often as it
likes without shifting encounter results, and the same seed with the same choices replays identically.
`Math.random` is never used; the only unseeded call is generating the seed itself.

**Typewriter (`ui/typewriter.ts`).** The full text is on the page from the first frame and the unwritten part is
transparent, so revealing never reflows. A frame updates two text nodes in one paragraph. Tapping finishes it;
reduced-motion skips it.

**Satchel and equipment (`engine/inventory.ts`, `screens/satchel.ts`).** Gear moves between the backpack and the four
slots by one rule: equipping puts the item in its slot and sends whatever was there back to the backpack, so an item
is never created or lost by the move, and the tests check the counts. Maximum HP is re-checked after every change,
because gear can carry an `hp` modifier: wearing it raises the ceiling without healing (otherwise swapping a helm
in and out would be a free potion), and taking it off pulls current HP down. Consumables heal up to the maximum and
are only spent when they do something. Each action is told as a short ledger line and also written into the run's
notes, so the next page of the story records it. The engine returns plain data about what changed; every word the
reader sees comes from `copy/voice.ts`. A closed entry can still be read but nothing in it can change.

**Stats strip (`ui/statsStrip.ts`, `engine/status.ts`).** Pinned to the top of the story screen: exact HP (set in
oxblood at a quarter of maximum or less), gold with the story's currency symbol, the chapter as tally marks with its
title, and the satchel link. `statusOf` does all the arithmetic (equipment folded into the stats); the strip only
formats it, and is rebuilt every turn so it can never disagree with the run. Its ink is the story's `statsBar` colour.

**Session (`app/session.ts`).** The router rebuilds a screen from scratch when the reader returns to it, so the run
cannot live in a screen's local variables: going to the satchel and back would have started the scene over. The
session holds the run plus a turn counter; coming back, a page already read is shown in full at the same scroll
position instead of being typed out again. Stage 5 saves the run from here.

Subsystems for saves, combat and shops are documented here as they are built in their own stages.
