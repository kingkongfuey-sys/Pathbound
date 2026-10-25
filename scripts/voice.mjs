// The voice rules, in one place, so the same check reads the app's chrome (src/copy/voice.ts) and the words a binding
// carries (content/themes/*.json). validate.mjs runs it; selftest.mjs proves it catches what it claims to.
const bannedPhrases = ['welcome', 'loading', 'oops', 'tap to continue', 'something went wrong', 'please wait'];
const emoji = /\p{Extended_Pictographic}/u;

/** One line per breach of the Weary Chronicler's rules found in `texts` (each a piece of copy as the reader sees it). */
export function voiceProblems(texts) {
  const problems = [];
  for (const text of texts) {
    if (text.includes('!')) problems.push(`exclamation mark in: "${text}"`);
    if (emoji.test(text)) problems.push(`emoji in: "${text}"`);
    if (text.includes("\\'") || /\w'\w/.test(text)) problems.push(`straight apostrophe (use ’) in: "${text}"`);
    for (const phrase of bannedPhrases) {
      if (text.toLowerCase().includes(phrase)) problems.push(`banned phrase "${phrase}" in: "${text}"`);
    }
  }
  return problems;
}
