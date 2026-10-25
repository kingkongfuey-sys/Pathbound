# Bindings

A binding is the app's whole look: colours, typefaces, the surface the page is written on, how asides are set. The reader picks one
under **Settings, Binding**. Three ship: **Parchment** (the original, and the default), **Cyberpunk** and **Greenwood**. A binding is one file,
`content/themes/<id>.json`, checked by `content/schema/theme.schema.json`; adding one never touches screen code. `npm run validate`
checks every file, and the app runs the same checks at start.

A binding changes how the book is *dressed*. It never changes a word of the voice (the Weary Chronicler says the same things in either),
the layout, the story, or a save. The choice is kept in the record book's `settings` table as the key `theme`; a book that has never
chosen one reads as Parchment.

## What the file holds

| Field | Notes |
|---|---|
| `id`, `name`, `note` | `id` must equal the file name. `name` is what Settings lists (2 to 24 characters, unique). `note` is the line under it, in the Chronicler's voice; `name` and `note` are run through the same voice rules as `src/copy/voice.ts` (no exclamation marks, emoji, banned phrases or straight apostrophes) |
| `order` | listing order; unique |
| `default` | `true` on exactly one binding: the one a book falls back to |
| `scheme` | `light` or `dark`. Must agree with the paper (above relative luminance 0.179 is light). It sets the system bar icons on the phone and the browser's form controls |
| `colors` | `paper`, `ink`, `inkFaded`, `rule`, `accent`, `accentWet` (required); `choices`, `statsBar`, `combatLog`, `inkRule`, `marginRule` (optional; unset, the first three follow ink, faded ink and ink, and the margin rule follows the accent) |
| `fonts` | `display` and `text` are CSS font stacks; `load` lists the `font` shorthands to wait for before the first paint (`500 20px "Jura"`) |
| `type` | `emphasis` (`italic` or `normal`: how links, asides and epigraphs are set), `scale` (0.8 to 1.2, multiplies every reading size and the ledger line, on top of the reader's text size), `displayScale` (0.6 to 1.2, multiplies the large titles), optional `figures` (`lining` or `oldstyle`; unset, the typeface's own: Greenwood asks for lining because Alegreya's are old-style and a score of 0p read as Op) |
| `surface` | `kind` (`paper`, `screen` or `glade`), `lit` and `edge` washes (`{ color, alpha }`), and for `screen` and `glade` a `trace` wash (the scanlines; the fireflies; refused on `paper`, where nothing would use it) |
| `marks` | `rule` (`hand`, `laser` or `vine`: the line under every title), `leader` (`dotted` or `dashed`), `glow` (0 to 1; 0 is none), `underline` (30 to 100: percent strength of a link's underline) |

Colour roles keep their original CSS names (`--oxblood` is the accent role, whatever colour a binding gives it).

## The rules the validator adds

- Ink, faded ink, accent, accent when pressed, and each optional text colour must reach **4.5 to 1** against the paper. The accent carries
  error text and low HP, so it gets the text figure, not the 3 to 1 a story's accent gets. Ruled lines need 1.3 to 1 (decoration, but it has to be seen); `inkRule` and `marginRule` need 3 to 1.
- Text must stay readable where the surface is brightest: ink, faded ink, the accent and every optional text colour are also checked at 4.5 to 1 against the paper with the `lit` wash laid over it at full strength (a lamp, a shaft of light). Fireflies and other `trace` marks are single points and are not counted.
- The first family of both stacks, and every family named in `fonts.load`, must be declared with `@font-face` in `src/styles/fonts.css`,
  so a binding can't name a typeface the phone doesn't have.
- Exactly one default; ids, names and orders unique; `scheme` consistent with the paper.

## What is data and what is code

Numbers, colours, typefaces and the choice between a few named styles are data. The named styles are implemented once, in CSS (and one
function), and a binding picks among them: `surface.kind` (`paper`, `screen`, `glade`: `src/styles/paper.css`), `marks.rule` (`hand`, `laser`, `vine`:
`src/ui/inkRule.ts` and the rules in `screens.css`). A new *kind* of surface or rule is code; a new binding that reuses the existing
ones is a JSON file. `src/content/themes.ts` turns a binding into one stylesheet rule (`:root[data-theme='<id>'] { ... }`) that
`src/app/theme.ts` swaps in, and sets `data-surface`, `data-rule` and `data-glow` on the root; screens only ever read variables.
`tokens.css` holds Parchment's values as the fallback, and `scripts/themetest.mjs` fails if the two drift apart.

## Stories and bindings

A story's `theme.colors` are applied while the story is played, over whichever binding is on, unless the reader has ticked **Always keep my binding** in Settings (the `bindingOverStory` setting, off by default; no save change). While a story's palette is worn, the binding's surface washes, glow and rule colours are quieted and re-derived from the story's colours so they do not fight its page. The validator checks a story's colours against the story's own background, so they are readable whatever binding sits underneath. Typefaces stay the binding's. One exception to the binding's surface: Greenwood's `glade` has dark and green layers baked in, so a story with a light page is played over plain paper instead, and the glade comes back afterwards. (A story with a dark page keeps it.)

## Greenwood

The forest binding, and the reason the other two kinds of mark exist. Its decisions, so they are not undone by accident:

- **Dark, not green paper.** A pale-green page would read as a second Parchment. Deep forest-floor green with lichen-pale ink keeps the ledger feel and sits apart from both others.
- **Accent is rowan orange, not gold.** The accent carries errors and low HP, so it has to read as warning; it also lights the glow like a lantern in the trees. Links are leaf-green and underlined in the accent.
- **Almendra and Alegreya.** Almendra is calligraphic and slightly wild for names and titles; Alegreya is a bookish text face with a real italic, so links and asides stay italic as in Parchment. Both are the Latin subsets from `@fontsource`, kept in `src/assets/fonts` with their OFL licences (a repo copy, so `package.json` and the lock file did not change).
- **The glade** (`surface.kind`): shafts of light that die before the page's foot, dark leaf-shade dapple, faint lichen, a vignette, and fireflies drawn as fixed points from the `trace` wash. Nothing moves.
- **The vine** (`marks.rule`): the ink rule's counterpart, a swaying stem with a leaf where the ink pooled, two shoots with leaves, and a curl at the end. Drawn deterministically, like the others.
- **The margin rule** is moss (`colors.marginRule`), not the accent, so the page's edge is quiet and the accent stays for things that need acting on.
- Tally marks, stance marks, the account and the leaders (dotted) carry over unchanged.

## Adding a binding

1. Copy `content/themes/greenwood.json`, `cyberpunk.json` or `parchment.json` to `content/themes/<id>.json`; change `id`, `name`, `note`, a free `order`.
2. If it needs a typeface: put a Latin-subset file in `src/assets/fonts/` with its licence beside it, declare it in `src/styles/fonts.css`,
   and name it in `fonts`. (Fonts come from `@fontsource` packages where the package is installed; Cyberpunk's two and Greenwood's are kept in the repo.)
3. Pick colours; run `npm run validate`; it names the file and the field.
4. Open Settings on a phone or in `npm run dev`, and look at every screen: home, a story page, the satchel, a fight, a shop, the closing
   account, the ledger. Check a narrow screen (320 px): titles don't wrap, so a wide display face needs a smaller `displayScale`.
