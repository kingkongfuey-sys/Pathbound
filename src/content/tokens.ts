// Token grammar for story text (scene prose, choice text, effect notes). One implementation serves
// both the validator (does every token parse?) and the reader (fill them in), so they cannot disagree.
//
//   {player.name}      the hero's name, exactly as typed
//   {currency.name}    the story's currency name
//   {they} {them} {their} {theirs} {themself}   pronouns; capitalise the first letter at a sentence start: {They}
//   {v:walk|walks}     verb agreement: first form for "they", second for "she"/"he"  ({v:are|is}, {v:have|has})
//   {{ and }}          a literal brace
//
// Pronouns come from the hero's chosen set, never guessed from the name, so any name is safe.
import type { PronounSetId } from './types.ts';

export interface TokenContext {
  name: string;
  pronouns: PronounSetId;
  currencyName: string;
}

const SETS: Record<PronounSetId, { they: string; them: string; their: string; theirs: string; themself: string; plural: boolean }> = {
  they: { they: 'they', them: 'them', their: 'their', theirs: 'theirs', themself: 'themself', plural: true },
  she: { they: 'she', them: 'her', their: 'her', theirs: 'hers', themself: 'herself', plural: false },
  he: { they: 'he', them: 'him', their: 'his', theirs: 'his', themself: 'himself', plural: false },
};

const PRONOUN_KEYS = ['they', 'them', 'their', 'theirs', 'themself'] as const;
type PronounKey = (typeof PRONOUN_KEYS)[number];

const pattern = /\{\{|\}\}|\{([^{}]*)\}|[{}]/g;

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function resolve(body: string, ctx: TokenContext): string | null {
  if (body === 'player.name') return ctx.name;
  if (body === 'currency.name') return ctx.currencyName;
  const set = SETS[ctx.pronouns];
  const lower = body.charAt(0).toLowerCase() + body.slice(1);
  if ((PRONOUN_KEYS as readonly string[]).includes(lower)) {
    const word = set[lower as PronounKey];
    return body === lower ? word : capitalise(word);
  }
  const verb = /^v:([A-Za-z']+)\|([A-Za-z']+)$/.exec(body);
  if (verb) return set.plural ? (verb[1] ?? '') : (verb[2] ?? '');
  return null;
}

/** Fill tokens in. Any token that doesn't parse is reported in `errors` and left visible in `text`. */
export function expandTokens(source: string, ctx: TokenContext): { text: string; errors: string[] } {
  const errors: string[] = [];
  const text = source.replace(pattern, (match, body: string | undefined) => {
    if (match === '{{') return '{';
    if (match === '}}') return '}';
    if (body === undefined) {
      errors.push(`stray "${match}" (write "${match}${match}" for a literal brace)`);
      return match;
    }
    const value = resolve(body, ctx);
    if (value === null) {
      errors.push(`unknown token "{${body}}"`);
      return match;
    }
    return value;
  });
  return { text, errors };
}

const CHECK_CONTEXT: TokenContext = { name: 'Name', pronouns: 'they', currencyName: 'coin' };

/** Problems with the tokens in one piece of story text (empty when it is fine). */
export function tokenProblems(source: string): string[] {
  return expandTokens(source, CHECK_CONTEXT).errors;
}

export function render(source: string, ctx: TokenContext): string {
  return expandTokens(source, ctx).text;
}
