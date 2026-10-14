import type { JaDictionary } from './EjDictionary';
import { lemmaCandidates, normalizeWord } from './Lemmatizer';

export interface LookupResult { word: string; lemma: string; meaningJa: string | null }

// タップされた語を正規化し、表記→活用形の原形候補の順で英和辞書を引く
export async function lookupWord(raw: string, dict: JaDictionary): Promise<LookupResult> {
  const word = normalizeWord(raw);
  if (!word) return { word, lemma: word, meaningJa: null };
  for (const c of [word, ...lemmaCandidates(word)]) {
    const m = await dict.lookup(c);
    if (m) return { word, lemma: c, meaningJa: m };
  }
  return { word, lemma: lemmaCandidates(word)[0] ?? word, meaningJa: null };
}

const cache = new Map<string, string[]>();
// 表記または原形候補のいずれかが保存済みセットに含まれるかを判定する（常時マーカー用）
export function matchesSaved(raw: string, saved: Set<string>): boolean {
  if (saved.size === 0) return false;
  const w = normalizeWord(raw);
  if (!w) return false;
  let c = cache.get(w);
  if (!c) { c = [w, ...lemmaCandidates(w)]; cache.set(w, c); }
  return c.some((x) => saved.has(x));
}

export interface PhrasePart { word: string; lemma: string; meaningJa: string | null }
export interface PhraseLookupResult { key: string; meaningJa: string | null; parts: PhrasePart[] }

// 複数語の保存キー。語だけを正規化して半角スペースでつなぐ（句読点や改行の違いを無視して同じフレーズとみなす）
export function phraseKey(words: string[]): string {
  return words.map(normalizeWord).filter(Boolean).join(' ');
}

// 辞書の見出しでは、所有格・再帰代名詞は one's / oneself で書かれる（make up one's mind など）
const POSSESSIVE = new Set(['my', 'your', 'his', 'her', 'its', 'our', 'their']);
const REFLEXIVE = new Set(['myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'yourselves', 'themselves']);
// 句動詞の間に挟まる目的語（look it up → look up）
const OBJECT = new Set(['me', 'you', 'him', 'her', 'it', 'us', 'them']);
const MAX_CANDIDATES = 8;

/**
 * 選択したフレーズを辞書の見出しの形に寄せた候補を、元の形に近い順に返す。
 * 先頭の語の活用形を原形に戻し（gave up → give up）、代名詞を辞書の書き方に置き換える（his → one's）
 */
export function phraseCandidates(words: string[]): string[] {
  const ws = words.map(normalizeWord).filter(Boolean);
  const options = ws.map((w, i) => {
    const o: (string | null)[] = [w];
    if (i === 0) o.push(...lemmaCandidates(w));
    if (POSSESSIVE.has(w)) o.push("one's");
    if (REFLEXIVE.has(w)) o.push('oneself');
    if (OBJECT.has(w) && i > 0 && i < ws.length - 1) o.push(null);
    return o;
  });
  let acc: string[][] = [[]];
  for (const o of options) acc = acc.flatMap((prefix) => o.map((w) => (w === null ? prefix : [...prefix, w])));
  const out: string[] = [];
  for (const c of acc) {
    const key = c.join(' ');
    if (c.length >= 2 && !out.includes(key)) out.push(key);
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

// 複数語の選択を英和辞書で引く。候補のどれかが成句として載っていればそれを、なければ語ごとの意味を返す
export async function lookupPhrase(words: string[], dict: JaDictionary): Promise<PhraseLookupResult> {
  const candidates = phraseCandidates(words);
  for (const c of candidates) {
    const m = await dict.lookup(c);
    if (m) return { key: c, meaningJa: m, parts: [] };
  }
  const parts = await Promise.all(words.filter((w) => normalizeWord(w)).map((w) => lookupWord(w, dict)));
  return { key: candidates[0] ?? '', meaningJa: null, parts };
}

/** 本文の語 raw が、保存済みフレーズの語 token に当たるか（活用形と、one's / oneself の代名詞も同じとみなす） */
export function phraseTokenMatches(raw: string, token: string): boolean {
  const w = normalizeWord(raw);
  if (w === token) return true;
  if (token === "one's") return POSSESSIVE.has(w);
  if (token === 'oneself') return REFLEXIVE.has(w);
  let c = cache.get(w);
  if (!c) { c = [w, ...lemmaCandidates(w)]; cache.set(w, c); }
  return c.includes(token);
}
