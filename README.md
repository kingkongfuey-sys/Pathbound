# Pathbound

A text-first RPG kept as a ledger. Android app built with Capacitor; every word of story is data, every
word of chrome is in one voice. Personal project, never published, fully offline.

Current stage: **8 of 8, complete, plus bindings and a second story (0.11.0).** The app's look is selectable in Settings: Parchment (the original), Cyberpunk or Greenwood (a dark fantasy forest), all data (`content/themes`). Two stories ship: *Low Tide at Saltwick* (the demo) and *Load Shedding* (four chapters, in `content/stories/load-shedding`). A story's own palette is worn over any binding while it is played, unless the reader ticks "Always keep my binding" in Settings (`bindingOverStory`). On top of Stage 8 (dev mode, text size, the content-authoring guide, a polish pass), Stage 7 (codex and settings), Stage 6 (growth, shops, theming), Stage 5 (saves), Stage 4 (combat). Build plan: see the stage report.

## Getting the app onto a phone

1. Push this project to GitHub (the workflow in `.github/workflows/android-debug.yml` runs on every push).
2. Open the repo's **Actions** tab, open the latest "Debug APK" run, download **pathbound-debug-apk** from Artifacts.
3. Unzip it, copy `app-debug.apk` to the phone, open it, allow "install unknown apps" if asked.

No local Android tools are needed. To preview in a desktop browser instead: `npm install`, `npm run dev`.

## Identity (do not drift)

Everything below describes **Parchment**, the default binding and the app's identity. Other bindings (see *Bindings* under Subsystem notes) change how the book is dressed, never the voice, the layout, the rhythm or the signature details: each re-draws them in its own medium.

**Voice: the Weary Chronicler.** A tired scribe keeping your record. Dry, wry, quietly fond. Plain sentences,
sentence case, no exclamation marks, no emoji, no apologies, no "welcome", no "loading". Menus are named like
a ledger: *Begin an entry*, *The ledger*, *Settings*. Dying closes an entry. All UI copy
lives in `src/copy/voice.ts`; `npm run validate` rejects banned phrases, exclamation marks, emoji and straight
apostrophes in it.

**Colour** (tokens in `src/styles/tokens.css`, which are Parchment's values and the fallback; `content/themes/parchment.json` holds the same ones and `scripts/themetest.mjs` fails if they drift apart. Paper lit and paper burnt are now the `surface.lit` and `surface.edge` washes of the binding):

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
(roman for prose, italic for every link, epigraph and aside). Cyberpunk's are *Tektur* (titles and names) and *Jura* (everything read); Greenwood's are *Almendra* (titles and names) and *Alegreya*, roman and italic (everything read). All kept in `src/assets/fonts` with their OFL licences.

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
- *Stance marks and the account*: in a fight each stance carries a small hand-inked mark (a slash with a pooled drop, a
  shield, a looping hook; `src/ui/stanceMark.ts`), and the combat log is "the account": ruled entries with the round
  number in oxblood in the margin (`src/ui/combatLog.ts`).
- *Dotted leaders*: in the satchel, each item sits on a ledger line, name, row of dots, action, the way an account
  book ties a name to its figure. The dots are baseline-aligned (`.leader` in `screens.css`).

## Folder map and naming

```
src/
  main.ts            entry: error handler, font wait, home screen, Android back button
  app/               bindings.ts (the bindings as the app reads them), router.ts (screen stack), session.ts (the run as screens hold it), settings.ts (settings as data), codex.ts (what the codex shows), book.ts (the record book as the
                     app uses it: write queue, resume, history), fatal.ts (error screen), theme.ts (the binding, and story colours)
  save/              types, snapshot (save envelope, integrity gates), record (history row, unlocks, what a save writes),
                     sqliteStore (all the SQL), capacitorDriver (the plugin glue), documentStore (browser preview only)
  content/           types, token grammar, schema validators, integrity checks, validate.ts, themes.ts (bindings: checks and
                     the stylesheet rule), loader.ts
  engine/            rng, run state, conditions, effects, play (the narrative loop), combat (the duel), inventory
                     (equip, use), growth (experience and levels), shop (buy and sell), status (numbers for the strip),
                     dev (jump, reseed, listings: dev mode only); no DOM
  copy/voice.ts      all UI copy
  screens/           one file per screen (home, shelf, hero, play, satchel, closing, ledger, codex, entries, settings, dev, resumeProblem,
                     bookTrouble, contentError)
  ui/                dom.ts, page.ts (page frame), inkRule.ts, typewriter.ts, tally.ts, statsStrip.ts,
                     stanceMark.ts, combatLog.ts (the account), combatPanel.ts (the fight panel), shopPanel.ts (the stall),
                     itemText.ts (one way of describing an item, shared by satchel and stall)
  styles/            fonts, tokens, paper (the surface), screens (layout and type)
  assets/fonts/      the Cyberpunk and Greenwood typefaces and their licences
content/             schemas (content/schema), stories (content/stories/<id>) and bindings (content/themes/<id>.json); see docs/schemas.md
docs/themes.md       the binding format, its validator rules, how to add one
docs/schemas.md      the content format, token grammar and validator rules
docs/authoring.md    how to write a story: the order to do it in, the traps, how to test it with dev mode
docs/saves.md        the record book: tables, save format, the integrity gates, recovery
scripts/validate.mjs voice check plus validation of every story
scripts/selftest.mjs checks that the validator catches broken content and that the engine behaves
scripts/savetest.mjs checks the record book: the real SQL (Node's built-in SQLite), integrity gates, save/reload soak
scripts/devtest.mjs  checks dev mode (jump, reseed, god-mode, forced encounters) and how settings are read
scripts/themetest.mjs checks bindings: shipped ones pass (all three), broken ones are caught, Parchment still equals the fallback tokens, typefaces are bundled
scripts/voice.mjs    the voice rules, shared by validate (voice.ts and every binding's name and note)
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

**Combat (`engine/combat.ts`, `ui/combatPanel.ts`).** A duel is rock-paper-scissors with the foe's hand already dealt.
At the start of every round the engine draws the foe's stance from its `styleTendencies` and stores it in the run
(`intent`); the hero's wits may let them read it (`tell`: 10% per point of wits, capped at 80%, and never a lie). Because
the stance is fixed before the hero chooses, closing and reopening the app cannot reroll it, and a saved fight is always
a whole round. Strike beats feint, feint beats guard, guard beats strike. The winner lands a blow, a tie costs both sides
half; a round spent on an item leaves the hero open, and only a guarding foe cannot punish that. Blows are exact:
hero = attack + 1 + a 0 to 2 roll; foe = its damage range; defense takes points off (never below 1), skills turn some
aside. Skills ride on a stance (or any stance, armed first) and then cool down for their stated rounds; foes use theirs
when their stance fits, with no extra dice. Randomness uses three named streams (`combat`, `read`, `loot`), always
drawn in the same order whatever happens, so identical seed and actions replay identically and a fight never shifts the
encounter stream. Flight is always open: the foe lands one parting blow (its weakest hit less defense, at least 1, never
enough to kill), then the story's own flee consequences apply. If hero and foe fall together the hero's entry is the
one that closes. A fight's whole state is plain data in the run, `combatProblem` checks it for soundness (Stage 5 runs
it on every loaded save), and the satchel is shut while a fight is on so gear can't be swapped for free.

**Spoils.** Victory draws gold and one item (or nothing) from the monster's loot table on the `loot` stream and tells it
at the top of the next page with the final round. Loot was pulled forward from Stage 6 because a fight that paid
nothing would have been a stub; XP, levels and shops remain Stage 6.

**The record book (`save/`, `app/book.ts`).** One SQLite database holds four things, and every save changes them in a
single transaction: the open entry (the whole run as JSON, in a single-slot table so there is never doubt which run
resumes), a history row (exact figures, so the ledger lists runs without loading stories), codex unlocks (tale, foes,
items, lore: only ever added, never removed, which is why a death keeps everything earned on the way to it), and a drawer
for saves that could not be read. A crash leaves the book at the old state or the new one. The design is write-behind but
strictly ordered: a screen changes the run and calls `commit`; the write joins one queue, so two saves can't land out of
order and the page never waits on the disk. Resuming, the ledger and the closing account wait for the queue first. All the
SQL sits in `sqliteStore.ts`, written against a four-line driver interface so the same statements run on the phone (through
the Capacitor plugin) and in the self-test (through Node). A desktop browser has no SQLite, so `documentStore.ts` keeps
the same book as one JSON document there; the phone never uses it. Schema changes are numbered migrations; a book from a
newer build is refused untouched.

**Save integrity (`save/snapshot.ts`).** A save is an envelope: save-format number, app version, run. Reading one back
passes four gates and stops at the first failure: is it from the future (newer save format, or made against newer story
content), does it parse, is it the right shape, does it still make sense against the story (every id exists, gear fits its
slot, HP is within the maximum, a closed entry's ending is one the story lists, a fight in progress passes `combatProblem`).
A failure comes back as a verdict, never a crash, and leads to a screen that explains it; the only way forward is to set
the entry aside, which keeps its text in the drawer. The same check guards every write, so a corrupt mid-fight state is
refused before it can replace the last good save. Content that is merely older than the save is carried forward if it still
fits. Bumping a story's `version` is therefore a decision: if the change could strand a save, write a migration.

**Run history and unlocks.** The history row is created with the run and updated at every save, so an entry is in the ledger
from its first page, however it ends: victory, death, abandoned (confirmed, or by beginning another entry over it), or lost
(set aside). Unlocks are derived from the run at each save, and saves happen after every change, so nothing met can slip
between two saves. The seed is stored in the save and in the history row (it is shown and settable only in dev mode).

**The codex (`screens/ledger.ts`, `codex.ts`, `entries.ts`, `app/codex.ts`).** "The ledger" is the codex's front page: the
tales, the bestiary, items, lore, and the history of entries, each with how much is written. It reads the same
`codex_unlocks` the saves already fill, so nothing new is recorded to make it work: unlocks are derived from the run at every
save, only ever added, and survive death and abandonment. `codexOf` (pure, tested) works out, per story, what has been met in
the story's own order and how many there are in all. A section lists only what has been met, by name, and merely counts the
rest ("3 more are still unwritten"), so the codex gives nothing away. Entries open in place instead of becoming screens. An
unlock under an id the story no longer defines is left out of the view and kept in the book.

**Settings (`screens/settings.ts`, `app/settings.ts`).** Settings live in a `settings` table (schema 3) as plain text under a
key. Reading them back never trusts them: `settingsFrom` falls back to the default for anything missing or unknown, so a bad
value can't break a page. Two reader-facing settings: writing speed (slow, steady, quick, instant; it feeds the typewriter,
and a reader who has asked their phone for reduced motion gets the instant page regardless) and text size (small, standard,
large, largest). Each takes effect at once, is written to the book, and shows itself in a sample line. Text size is one CSS
variable, `--size-scale`, which with the binding's own allowance (`--type-scale`) makes `--text-scale`, which multiplies every reading size and the ledger-line rhythm (`--line`), so ruled lines and text
stay in step at every size; the large titles keep their own responsive sizes.

**Dev mode (hidden).** Seven quick taps on the version line on the home screen open or shut it (a line under the version
says which). While open: a seed field on hero creation (blank means random), and a "Dev" link on a run's page leading to the dev
screen. Its tools: show and set the run's seed (every random stream restarts from it); god-mode (the hero loses no HP, in fights
or out of them; the dice are still drawn, so the stream is unchanged); skip story text (scenes show their choices at once with
the prose behind a tap); force the next encounter (pick an entry of the chapter's pool and the next encounter-capable choice
brings it, whatever the dice say); jump to any scene by id. The switches the loop honours are an optional `DevOptions` argument
to `choose`, `fightAction` and `fleeFight` (play.ts), so with dev mode off the engine runs exactly as before; jump and reseed are
pure functions in `engine/dev.ts`. Every dev action produces an ordinary run that passes the same integrity check and is saved
as usual, which is also why jumping into an encounter scene supplies a place to return to. Dev-mode runs are not marked: they
appear in the ledger like any other entry. God-mode and skipped text are stored as settings but do nothing while the hidden
switch is off. Switch it off in Settings.

**The closing account (`screens/closing.ts`).** Victory and death end on the same page: dotted leaders from label to exact
figure, the chapter reached as tally marks, and a line of what is new to the ledger. The run is finalised when its last page
is saved, not when this page is read; reading it (or leaving it) only lets the entry stop being resumable.

**Growth (`engine/growth.ts`).** Experience is plain arithmetic, no dice: a foe is worth its HP plus twice its heaviest blow
(doubled for a boss), so what a fight is worth can be read off the bestiary. Thresholds are 20, 50, 90 and 140 for levels 2
to 5, and five is the cap (experience still counts after it, nothing more is added). Each level adds 3 HP, and 1 attack on
even levels or 1 defense on odd ones; the HP a level adds is healed at once, no more. The numbers live in one file so
a story can be balanced by reading it. Levels are told in the account as "experience" and "level" lines, in the voice.

**Shops (`engine/shop.ts`).** A stall is a scene of type `shop`; it has no choices, only a panel and one way out. Stock is
never exhausted. You buy at the stock price and sell at half the item's value, rounded down, so buying and selling the same
thing can never make money; the validator refuses a stall whose price is below what it would pay back. Worn gear is not
sold (take it off first); items worth under 2 are not bought at all. Each deal is recorded in the account. Leaving carries
only the deals to the next page, and nothing else.

**Bindings (`content/themes`, `src/content/themes.ts`, `src/app/theme.ts`, `src/app/bindings.ts`).** A binding is one JSON file: colours, a display and a text typeface,
how asides are set (italic or upright), which figures the face uses, a size allowance, a surface (`paper`, `screen` or `glade`), and the marks (the rule under titles, the leaders, glow,
underline strength, and optionally the margin rule's own colour). It is checked by `theme.schema.json` and by rules a schema can't hold (readable contrast, exactly one default, typefaces really bundled, scheme
agreeing with the paper); the app runs the same code at start, and if any binding is wrong it offers none and runs on the fallback tokens, which are
Parchment's. `themeCss` turns a binding into one rule, `:root[data-theme='<id>'] { ... }`, which `applyBinding` swaps into a `<style>` element, plus `data-surface`,
`data-rule` and `data-glow` on the root (a `glade` surface is shafts of light, leaf-shade dapple and fixed fireflies, a `vine` rule a swaying stem with leaves); screens read only variables, so none knows which binding is on. The choice is the `theme` setting (an id, kept like any
setting; a book that has none, or one this build lacks, reads as Parchment; no migration, no save change). Startup order is now: open the book, apply binding and
text size, wait for that binding's typefaces, show home. Decisions worth knowing: (1) the voice does not change per binding, only the dress; (2) sentence case holds
in every binding, so no uppercase transforms; (3) a story's own palette is worn over any binding while it is played, unless the reader ticks "Always keep my binding" in Settings (`bindingOverStory`, off by default); the binding's surface, glow and rules are quieted to suit the story's page meanwhile; (4) each of Parchment's signature details has a counterpart rather than being dropped: the ink
rule becomes a straight laser rule with a square node and a dashed second line, the margin rule a glowing double magenta rule, the paper a screen with a violet bloom,
vignette and scanlines, the dotted leaders dashed ones, the italic links upright cyan ones; tally marks, stance marks and the account carry over unchanged. Greenwood's counterparts: the ink rule becomes the vine, the margin rule moss green, the paper a forest glade with fireflies, the italic links stay italic in leaf green; its design reasons are in `docs/themes.md`. The binding validator also checks text contrast where the surface is brightest, not only on the bare paper. See `docs/themes.md`.

**Per-story colours.** `story.theme.colors` is applied by `app/theme.ts` while a story is played, and on the hero screen.
The validator checks the contrast of every readable role against the background (4.5 to 1 for text, 3 to 1 for the accent),
so a story cannot ship a palette that cannot be read.

**Performance (R14).** Cold start measured in headless Chromium with a 4x CPU slowdown reached the home screen in about 1.4
seconds, including the font wait and opening the book. That is a proxy: it was not measured on an Android phone. The typewriter
updates two text nodes per frame and never reflows.

**Known limits.** Bindings: the native splash and window are still parchment (Android resources, not data), so on Cyberpunk the first instants are paper-coloured before the page paints; the system bar icon style is set through Capacitor's `SystemBars` plugin (now imported with its typings; it had failed the type check) and is untested on a device; Greenwood's two typefaces have no slashed zero, so a gold of `0p` still looks close to `Op` (the figures are lining, which helps); Cyberpunk's two typefaces are kept in the repo as WOFF, and Greenwood's three as the `@fontsource` WOFF2 files, rather than as installed packages. Android was never exercised from here: the SQLite plugin glue, the Gradle changes and the APK need the
first CI run and a phone to confirm. A save can be lost if the OS kills the app within milliseconds of a tap (writes are queued,
not awaited). The browser build keeps its book in localStorage and is for previewing only.
