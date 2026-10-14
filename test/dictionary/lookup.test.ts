import { describe, it, expect } from 'vitest';
import { lookupPhrase, lookupWord, matchesSaved, phraseKey } from '../../src/services/dictionary/lookup';

const dict = { lookup: async (w: string) => ({ stumble: 'つまずく', news: 'ニュース', 'give up': 'やめる', new: '新しい', run: '走る' } as Record<string, string>)[w] ?? null };

describe('lookupWord', () => {
  it('活用形は原形で引く', async () => {
    expect(await lookupWord('“stumbled,”', dict)).toEqual({ word: "stumbled", lemma: 'stumble', meaningJa: 'つまずく' });
  });
  it('表記が辞書にあればそれを原形にする（news → new にしない）', async () => {
    expect(await lookupWord('news', dict)).toEqual({ word: 'news', lemma: 'news', meaningJa: 'ニュース' });
  });
  it('どこにもなければ表記のまま、意味は null', async () => {
    expect(await lookupWord('Elizabeth', dict)).toEqual({ word: 'elizabeth', lemma: 'elizabeth', meaningJa: null });
  });
});

describe('matchesSaved', () => {
  it('表記か原形候補が保存済みなら true', () => {
    const saved = new Set(['stumble']);
    expect(matchesSaved('Stumbled', saved)).toBe(true);
    expect(matchesSaved('stumble', saved)).toBe(true);
    expect(matchesSaved('walk', saved)).toBe(false);
  });
});

describe('lookupPhrase', () => {
  it('キーは語を正規化して半角スペースでつなぐ', () => {
    expect(phraseKey(['“Give', 'Up,”'])).toBe('give up');
  });
  it('成句として載っていればその意味を返す', async () => {
    expect(await lookupPhrase(['Give', 'up'], dict)).toEqual({ key: 'give up', meaningJa: 'やめる', parts: [] });
  });
  it('載っていなければ語ごとの意味を返す', async () => {
    const r = await lookupPhrase(['news', 'stumbled'], dict);
    expect(r.meaningJa).toBeNull();
    expect(r.parts).toEqual([{ word: 'news', lemma: 'news', meaningJa: 'ニュース' }, { word: 'stumbled', lemma: 'stumble', meaningJa: 'つまずく' }]);
  });
});
