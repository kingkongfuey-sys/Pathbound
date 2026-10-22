# Content schemas

Everything a story contains is data under `content/stories/<story-id>/`. Adding or changing a story never touches
code. The JSON Schemas in `content/schema/` are the authority; this page explains them and the rules a schema
can't express. `npm run validate` checks every story, and the app runs the same checks when a story is opened,
reporting the file and the place in it.

```
content/
  schema/            common, story, scenes, monsters, items, encounters (.schema.json)
  stories/<id>/
    story.json       identity, theme, archetypes, chapters, lore, endings
    scenes/*.json    any number of files, each { "scenes": [ ... ] }
    monsters.json    { "monsters": [ ... ] }   (may be empty)
    items.json       { "items": [ ... ] }
    encounters.json  { "pools": [ { "chapterId", "entries": [ ... ] } ] }
```

The folder name must equal `story.json`'s `id`. Ids are lowercase kebab-case (`^[a-z][a-z0-9-]{1,47}$`).

## story.json

| Field | Notes |
|---|---|
| `id`, `title`, `blurb` | shelf text |
| `rating` | `all-ages`, `teen` or `mature`; `toneLine` is one line shown beside it |
| `version` | integer, bump when a change could break a saved run |
| `start` | id of the first scene (not an ending) |
| `theme.colors` | `prose`, `choices`, `statsBar`, `combatLog`, `background`, `accent` as `#rrggbb` |
| `theme.typefaceFeel` | `old-print` (IM Fell English) or `inscribed` (French Canon for prose) |
| `currency` | `name` (used by `{currency.name}`) and `symbol` |
| `archetypes` | exactly 3 (below) |
| `chapters` | ordered `{ id, title, summary }`; every chapter needs scenes and one encounter pool |
| `loreEntries` | `{ id, title, text }`; unlocked by a scene's `unlocksLore` |
| `endings` | `victory[]` and `death[]` of `{ id, sceneId, title }`, plus `defaultDeath` (a death ending id) |
| `codexSummary` | the story's codex blurb |

**Archetype**: `id`, `name`, `tagline`, `stats` (`hp`, `attack`, `defense`, `wits`, `nerve`), `startingSkills` (1 or 2
inline skill objects), `startingEquipment` (item ids, at most one per slot: weapon, head, body, trinket),
`suggestedNames` (3 to 5), `pronouns` (`default` of `they`/`she`/`he`, and `selectable`).

**Skill** (inline, ids unique across the story): `id`, `name`, `description`, `stance` (`strike`, `guard`, `feint`,
`any`), `effect` (`kind` of `bonusDamage`, `reduceDamage` or `heal`, and `amount`), `cooldown` in turns.

## Scenes

Four types, set by `type`. Every scene has `id`, `chapterId`, `prose` (2 to 6 paragraphs) and optional
`unlocksLore` (lore ids, unlocked on entry).

- **narrative**: `choices` (1 to 8). A choice has `text`, optional `hint` (short tag shown after the text, 24 characters
  at most), `target` (a scene id, or `$return`), optional `conditions`, optional `effects`, and optional
  `encounterChance` (1 to 100, percent). At least one choice per scene must have no conditions.
- **fight**: `fight` with `monsterId`, `onVictory` and `onFlee` (each `{ sceneId, effects? }`; fleeing is always
  available) and optional `onDefeat` (a death ending id; otherwise `defaultDeath`).
- **shop**: `shop` with `stock` (`{ itemId, price }`, items must be `purchasable`) and `leaveSceneId`.
- **ending**: no choices. Each ending scene must be listed exactly once under `endings` in story.json.

## Conditions and effects

A choice's `conditions` must all hold. Types: `stat` (`stat`, `op`, `value`; `hp` is current HP, the rest include
equipment), `gold` (`op`, `value`), `item` (`itemId`, `has` default true), `flag` (`flag`, `is` default true).
Operators: `>=`, `<=`, `>`, `<`, `==`, `!=`. A choice whose conditions fail is hidden.

Effects apply in order when the choice is taken. Types: `stat` (permanent change to a base stat, including max
`hp`), `hp` (change current HP; healing stops at the maximum), `gold`, `item` (`give` or `take`, `quantity`
default 1), `flag` (`value` true/false). Every effect except `flag` needs a `note`: one line of narrative, shown
at the top of the next scene. Gains are told as story, never as pop-ups. HP at zero ends the run in the default
death ending.

## Text tokens

Allowed in scene `prose`, choice `text` and effect `note`s.

| Token | Gives |
|---|---|
| `{player.name}` | the hero's name, as typed |
| `{they} {them} {their} {theirs} {themself}` | pronouns from the hero's set; `{They}` capitalises |
| `{v:walk\|walks}` | verb agreement: first form for "they", second for "she"/"he" (`{v:are\|is}`) |
| `{currency.name}` | the story's currency name |
| `{{` and `}}` | literal braces |

Pronouns come from the hero's chosen set, never guessed from a name.

## Monsters, items, encounters

**Monster**: `id`, `name`, `codexEntry`, `hp`, `damage` (`min`, `max`), `styleTendencies` (`strike`, `guard`, `feint`
weights, not all zero), `skills` (up to 2), `lootTable` (`items` of `{ itemId, weight }`, optional `noneWeight`, `gold`
range), `boss`.

**Item**: `id`, `name`, `flavor`, `codexEntry`, `type` (`weapon`, `head`, `body`, `trinket`, `consumable`), `value`,
`purchasable`. Equipment has `modifiers` (any of the five stats, +/-); a consumable has `use` (`{ kind: "heal",
amount }`) instead.

**How items read in the satchel.** The name is the line's title; under it come the item's modifiers (`Attack +2,
Wits +1.`) or, for a consumable, `Restores 6 HP.`, then `flavor`, so keep `flavor` to one short sentence that
still makes sense after the numbers. An `hp` modifier raises the hero's maximum HP while the item is worn
(wearing it does not heal; taking it off lowers current HP to the new maximum). Gear goes in the slot named by
`type`, replacing and returning whatever was there; the engine never creates or loses an item doing so. A choice
that hands out gear should hide itself once the hero holds it, with an `item` condition and `has: false`:
worn gear counts as held, so the pickup stays hidden whether the item is in the backpack or on the body.

**Encounter pool** (one per chapter): `entries` of `fight` (`monsterId`, `weight`, optional `conditions`,
`fleeEffects`) or `discovery`/`flavor` (`sceneId`, `weight`, optional `conditions`). When a choice with
`encounterChance` is taken, the engine rolls the chance; on a hit it picks a weighted entry and plays it before
continuing to the choice's real target. A discovery or flavor scene must be a narrative scene of that chapter,
must send every choice to `$return` (resume the interrupted route), and may not be linked from anywhere else.

## What the validator enforces beyond the schemas

Every id points at something that exists and is unique; every item is obtainable (starting gear, a `give` effect,
a loot table or a shop); every monster is used; every lore entry is unlocked; every flag that is read is set
somewhere; text tokens parse; every scene is reachable from `start` (death endings and encounter scenes have
their own rules); no reachable scene is a trap (each has an always-available path to an ending); `$return` appears
only in encounter scenes.

## Beyond the original spec

Fields added because the build needs them: `story.start`, `story.version`, `scene.unlocksLore`,
`choice.encounterChance` and `$return`, `fight.onDefeat`, inline skills, and the five-stat set
(`hp`, `attack`, `defense`, `wits`, `nerve`).
