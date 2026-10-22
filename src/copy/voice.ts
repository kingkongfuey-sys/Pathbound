// Every word the app's own chrome says, in one place, in the Weary Chronicler's voice.
// Story prose never lives here (it belongs to content files); this is only the app talking.
// Voice rules: dry, tired, quietly fond. Plain sentences, no exclamation marks, no emoji,
// no "welcome", no "loading", no apologies. Run `npm run validate` after editing; it checks these.

export const voice = {
  home: {
    title: 'Pathbound',
    epigraph: 'I keep the record. You supply the misfortune.',
    newRun: 'Begin an entry',
    ledger: 'The ledger',
    version: (v: string): string => `Version ${v}`,
  },
  shelf: {
    heading: 'Begin an entry',
    reading: 'Reading the shelf.',
    empty: 'The shelf is bare. The first tale hasn’t been set down yet.',
    emptyHint: 'Come back once it has.',
    damaged: 'The pages are damaged. Open it to see what’s wrong.',
    ratings: { 'all-ages': 'All ages', teen: 'Teen', mature: 'Mature' },
  },
  hero: {
    heading: 'Open the entry',
    lead: 'Choose who the entry is about.',
    stats: (s: { hp: number; attack: number; defense: number; wits: number; nerve: number }): string =>
      `Hit points ${s.hp}. Attack ${s.attack}. Defense ${s.defense}. Wits ${s.wits}. Nerve ${s.nerve}.`,
    skills: (names: string): string => `Skills: ${names}.`,
    nameLabel: 'Name for the entry',
    suggestions: 'Or take one that’s lying about:',
    pronounsLabel: 'Referred to as',
    pronouns: { they: 'they', she: 'she', he: 'he' },
    begin: 'Write it down',
    nameMissing: 'An entry needs a name.',
  },
  play: {
    leave: 'Leave the entry',
    confirmLead: 'Leave this entry? It can’t be picked up again.',
    confirmLeave: 'Leave it',
    confirmStay: 'Keep writing',
    closed: (title: string): string => `Entry closed: ${title}.`,
    closedDeath: (title: string): string => `Entry closed, cause noted: ${title}.`,
    returnToDesk: 'Return to the desk',
  },
  statNames: { hp: 'HP', attack: 'Attack', defense: 'Defense', wits: 'Wits', nerve: 'Nerve' },
  strip: {
    hp: (now: number, max: number): string => `HP ${now}/${max}`,
    gold: (amount: number, symbol: string): string => `${amount}${symbol}`,
    satchel: 'Satchel',
    chapter: (number: number, total: number, title: string): string => `Chapter ${number} of ${total}: ${title}`,
  },
  satchel: {
    heading: 'The satchel',
    close: 'Close the satchel',
    reckoning: (now: number, max: number, s: { attack: number; defense: number; wits: number; nerve: number }): string =>
      `Hit points ${now}/${max}. Attack ${s.attack}. Defense ${s.defense}. Wits ${s.wits}. Nerve ${s.nerve}.`,
    worn: 'Worn',
    carried: 'Carried',
    slots: { weapon: 'Weapon', head: 'Head', body: 'Body', trinket: 'Trinket' },
    slotEmpty: 'Nothing entered.',
    packEmpty: 'Nothing carried. Lighter, at least.',
    take: { weapon: 'Wield', head: 'Put on', body: 'Put on', trinket: 'Wear' },
    takeOff: 'Take off',
    use: 'Use',
    count: (n: number): string => `×${n}`,
    heals: (n: number): string => `Restores ${n} HP.`,
    change: (stat: string, delta: number): string => `${stat} ${delta > 0 ? '+' : '−'}${Math.abs(delta)}`,
    equipped: {
      weapon: (item: string): string => `${item}, wielded.`,
      head: (item: string): string => `${item}, put on.`,
      body: (item: string): string => `${item}, put on.`,
      trinket: (item: string): string => `${item}, worn.`,
    },
    returned: (item: string): string => `${item} goes back in the satchel.`,
    removed: (item: string): string => `${item}, put away.`,
    used: (item: string, healed: number): string => `${item}, used. ${healed} HP restored.`,
    fullHealth: 'There is nothing to mend. Keep it for later.',
    closed: 'The entry is closed. Nothing in the satchel can change now.',
  },
  contentError: {
    heading: 'The record is damaged',
    lead: 'These pages need mending before the tale can be read:',
    more: (count: number): string => `And ${count} more.`,
  },
  ledger: {
    heading: 'The ledger',
    empty: 'The ledger is bare. Go and give me something to write.',
  },
  nav: {
    back: 'Back to the desk',
  },
  fatal: {
    heading: 'The page won’t turn',
    lead: 'Something in the record is broken. This is what it says:',
    unknown: 'It says nothing useful, which is its own kind of answer.',
  },
} as const;
