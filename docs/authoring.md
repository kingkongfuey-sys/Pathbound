# Writing a story

For future me, when the plot comes before the memory of how any of this works. Schemas and every field are in
`docs/schemas.md`; this page is the order to do things in, and the places where a story goes wrong.

## The order

1. **Copy `content/stories/saltwick/` to a new folder.** The folder name is the story's `id` and must match the `id` inside
   `story.json`. Edit the copy rather than starting blank; the demo is a working example of every part.
2. **Decide the spine before writing prose.** Chapters (each needs scenes and one encounter pool), the endings (at least one
   victory, at least one death, and a `defaultDeath`), and three archetypes. Three is exact.
3. **Write `story.json`.** Theme colours last (they show over the Parchment binding only; under Cyberpunk or Greenwood the reader's binding wins, so write them for paper): the validator checks contrast (prose, choices, statsBar and combatLog 4.5 to 1
   against the background; accent 3 to 1), so pick the background first.
4. **Items, then monsters, then scenes, then encounters.** Scenes point at the rest by id, and the validator reports an id that
   points nowhere. Run `npm run validate` after every file; it names the file and the place.
5. **Play it.** Use dev mode (below) to reach each scene without playing the whole way.

## Prose and choices

- Two to six paragraphs a scene. Choices are one line; a `hint` is a short tag (24 characters at most) after the text.
- At least one choice in a scene must have no conditions, so no scene can trap the reader. A scene whose only way on
  needs an item or flag the reader might not hold is an error.
- Use `{player.name}` and the pronoun tokens (`{they}`, `{v:walk|walks}`) for the hero; never assume a pronoun.
- Every effect except a flag needs a `note`, one line, told at the top of the next page. Gains are narrated, not announced.
- Numbers belong to the app. Never put an HP or damage figure in prose; the app prints exact figures beside it.

## Fights and encounters

- A `fight` scene needs a victory scene and a flee scene, both ordinary narrative scenes. Fleeing is always available and always
  costs a small blow, so make `onFlee.effects` the story's own price for running.
- An encounter pool entry is a `fight` or a discovery scene. A discovery scene's every choice goes to `$return`, and nothing else
  may link to it. To make one happen once, give its pool entry a flag condition and set the flag in the scene.
- Only a choice with `encounterChance` can start an encounter. Put it on a choice that is worth interrupting.
- Foes: keep a blow small against the weakest archetype's HP, so a fight lasts several rounds. The demo's numbers (heroes at
  12 to 18 HP, foes dealing 1 to 4 a blow) are a sound starting point. Experience is `(hp + damage.max * 2)`, doubled for a boss; levels come at 20,
  50, 90, 140 and the cap is level 5.

## Items and shops

- Gear goes in the slot named by its `type`. A choice that hands out gear should hide itself once the hero holds it
  (an `item` condition with `has: false`), or it can be taken forever.
- A shop's price must be at least half the item's `value`, rounded down, because the player sells for that. Every item must be
  obtainable somewhere: starting gear, a `give` effect, a loot table or a shop.

## Testing with dev mode

Open it with seven quick taps on the version line on the home screen. Then:

- **Jump to any scene** from the dev screen (the "Dev" link on a run's page). Entering a scene does what it normally does, so
  jumping to an ending closes the run and jumping to a fight opens the fight.
- **Force the next encounter** to see a specific pool entry without waiting for the dice.
- **God-mode** to read a whole story without dying; **skip story text** to click through scenes you have already written.
- **Seed**: set one when you begin an entry (a seed field appears on hero creation) or from the dev screen. The same seed with
  the same choices plays out identically, so a bug can be replayed exactly. A run's seed is shown on the dev screen.

Dev-mode runs are ordinary entries in the ledger. Switch dev mode off in Settings before you hand the phone to anyone.

## Changing a story that has saves

A save records the story's `version`. A save made against a higher version than the app has is set aside, not played. A save
made against an older version is played if it still makes sense (every scene, item and lore id it holds still exists, gear still
fits, and so on) and is otherwise offered for setting aside. So: **bump `version` when a change could strand a saved run**
(renaming or removing a scene, item or lore id, changing what an ending is), and expect old entries to be set aside when you
do. Adding scenes, items or monsters never needs a bump.

## When validate complains

| It says | Usually means |
|---|---|
| a scene is unreachable | nothing links to it; add a choice, or delete the scene |
| a scene is a trap | none of its choices can lead on without a condition; add an unconditional choice |
| an item can't be obtained | give it to someone: an effect, loot, a shop, or starting gear |
| a flag is read but never set | a typo, or an effect is missing |
| `$return` outside an encounter scene | `$return` is for discovery scenes only |
| contrast too low | the colour is too close to the background; darken the text or lighten the page |
| an ending isn't listed | every ending scene must appear once under `endings` in `story.json` |
