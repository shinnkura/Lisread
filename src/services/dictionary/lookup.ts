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

// 複数語の選択を英和辞書で引く。成句として載っていなければ、語ごとの意味を並べて返す
export async function lookupPhrase(words: string[], dict: JaDictionary): Promise<PhraseLookupResult> {
  const key = phraseKey(words);
  const meaningJa = key ? await dict.lookup(key) : null;
  const parts = meaningJa ? [] : await Promise.all(words.filter((w) => normalizeWord(w)).map((w) => lookupWord(w, dict)));
  return { key, meaningJa, parts };
}
