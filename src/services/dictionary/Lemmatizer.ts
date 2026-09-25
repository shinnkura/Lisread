import lemmatizer from 'wink-lemmatizer';

const EDGE_PUNCT = /^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g;

export function normalizeWord(raw: string): string {
  return raw.replace(/[‘’ʼ]/g, "'").replace(EDGE_PUNCT, '').toLowerCase();
}

export function lemmaCandidates(word: string): string[] {
  const w = word.toLowerCase();
  const out: string[] = [];
  for (const fn of [lemmatizer.verb, lemmatizer.noun, lemmatizer.adjective]) {
    const l = fn(w);
    if (l && l !== w && !out.includes(l)) out.push(l);
  }
  return out;
}
