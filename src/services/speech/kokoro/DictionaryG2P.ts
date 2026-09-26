// 辞書ベースの音素化（G2P）。Kokoro 本家（Python の misaki）と同じ英語辞書（gold / silver、Apache-2.0）を使い、
// espeak-ng の wasm を使わずに JS だけで音素列を作る。iPhone Safari で espeak の wasm が固まるための代替。
// 辞書にない語（固有名詞など）は fallback（espeak など）に回し、それも無ければ簡易の綴り字規則で近似する。

export type LexiconEntry = string | Record<string, string>;
export type Lexicon = Record<string, LexiconEntry>;
export type OovFallback = (word: string) => Promise<string | null>;

const PUNCT_TOKEN = /^[;:,.!?¡¿—…"«»“”()]+$/;

function pick(entry: LexiconEntry | undefined | null): string | null {
  if (!entry) return null;
  if (typeof entry === 'string') return entry;
  return entry.DEFAULT ?? Object.values(entry)[0] ?? null;
}

/** 語尾の活用を外して語幹を引く（misaki の簡易版）。見つかれば音素列を返す */
export function lookupWord(word: string, lex: Lexicon[]): string | null {
  const w = word.toLowerCase();
  const direct = (x: string) => { for (const l of lex) { const p = pick(l[x]); if (p) return p; } return null; };
  const hit = direct(w);
  if (hit) return hit;
  // 所有格・複数形・過去形・進行形・副詞
  const rules: [RegExp, (stem: string, ps: string) => string][] = [
    [/'s$/, (_, ps) => ps + (/[sʃʧzʒʤ]$/.test(ps) ? 'ɪz' : /[ptkfθ]$/.test(ps) ? 's' : 'z')],
    [/s$/, (_, ps) => ps + (/[sʃʧzʒʤ]$/.test(ps) ? 'ɪz' : /[ptkfθ]$/.test(ps) ? 's' : 'z')],
    [/ed$/, (_, ps) => ps + (/[td]$/.test(ps) ? 'ɪd' : /[ptkfθsʃʧ]$/.test(ps) ? 't' : 'd')],
    [/ing$/, (_, ps) => ps + 'ɪŋ'],
    [/ly$/, (_, ps) => ps + 'li'],
  ];
  for (const [re, join] of rules) {
    if (!re.test(w)) continue;
    const stem = w.replace(re, '');
    if (stem.length < 2) continue;
    const candidates = [stem, stem + 'e'];
    if (/^(.*)([bdfglmnprst])\2$/.test(stem)) candidates.push(stem.slice(0, -1)); // stopped → stop
    if (stem.endsWith('i')) candidates.push(stem.slice(0, -1) + 'y'); // tried → try
    for (const c of candidates) { const p = direct(c); if (p) return join(c, p); }
  }
  return null;
}

/** 辞書に無い語の近似（綴り字 → 音素の粗い規則）。固有名詞向けの最後の手段 */
export function approximateSpelling(word: string): string {
  const w = word.toLowerCase();
  let out = '';
  const rules: [RegExp, string][] = [
    [/^ch/, 'ʧ'], [/^sh/, 'ʃ'], [/^th/, 'θ'], [/^ph/, 'f'], [/^wh/, 'w'], [/^ck/, 'k'], [/^ng$/, 'ŋ'], [/^ng/, 'ŋg'], [/^qu/, 'kw'],
    [/^ee/, 'i'], [/^ea/, 'i'], [/^oo/, 'u'], [/^ou/, 'W'], [/^ow/, 'O'], [/^ai/, 'A'], [/^ay/, 'A'], [/^oi/, 'Q'], [/^oy/, 'Q'], [/^au/, 'ɔ'], [/^aw/, 'ɔ'], [/^ey$/, 'i'], [/^ey/, 'A'], [/^ie/, 'i'],
    [/^a$/, 'ə'], [/^a(?=r)/, 'ɑ'], [/^a/, 'æ'], [/^e$/, ''], [/^e/, 'ɛ'], [/^i/, 'ɪ'], [/^o/, 'ɑ'], [/^u/, 'ʌ'], [/^y$/, 'i'], [/^y/, 'j'],
    [/^c(?=[eiy])/, 's'], [/^c/, 'k'], [/^g(?=[eiy])/, 'ʤ'], [/^g/, 'g'], [/^j/, 'ʤ'], [/^x/, 'ks'], [/^r/, 'ɹ'],
    [/^([bdfhklmnpstvwz])\1?/, '$1'],
  ];
  let rest = w;
  while (rest.length) {
    let matched = false;
    for (const [re, rep] of rules) {
      const m = re.exec(rest);
      if (m) { out += rep === '$1' ? m[1] : rep; rest = rest.slice(m[0].length); matched = true; break; }
    }
    if (!matched) rest = rest.slice(1);
  }
  // 最初の母音に第一強勢を付ける
  return out.replace(/([iuæɛɪɑʌəɔAOWQ])/, 'ˈ$1');
}

export class DictionaryG2P {
  constructor(private lexicons: Lexicon[], private fallback?: OovFallback) {}

  /** テキスト（正規化済み）を Kokoro 用の音素文字列に変換する。句読点はそのまま残す */
  async phonemize(text: string): Promise<string> {
    const tokens = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?|[0-9]+|[;:,.!?¡¿—…"«»“”()]+|\s+|./g) ?? [];
    const parts: string[] = [];
    for (const tok of tokens) {
      if (/^\s+$/.test(tok)) { parts.push(' '); continue; }
      if (PUNCT_TOKEN.test(tok)) { parts.push(tok); continue; }
      if (!/[A-Za-z]/.test(tok)) continue;
      let ps = lookupWord(tok, this.lexicons);
      if (!ps && tok.includes("'")) { const [a, b] = tok.split("'"); const pa = lookupWord(a, this.lexicons); if (pa) ps = pa + (b === 's' ? 'z' : lookupWord(b, this.lexicons) ?? ''); }
      if (!ps && this.fallback) { try { ps = await this.fallback(tok); } catch { ps = null; } }
      if (!ps) ps = approximateSpelling(tok);
      parts.push(ps);
    }
    return parts.join('').replace(/\s+([;:,.!?…])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  }
}
