import { describe, it, expect } from 'vitest';
import { lookupPhrase, lookupWord, matchesSaved, phraseCandidates, phraseKey, phraseTokenMatches } from '../../src/services/dictionary/lookup';

const dict = { lookup: async (w: string) => ({ stumble: 'つまずく', news: 'ニュース', 'give up': 'やめる', "make up one's mind": '決心する', new: '新しい', run: '走る' } as Record<string, string>)[w] ?? null };

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

describe('phraseCandidates', () => {
  it('元の形を先頭に、先頭の語の原形や代名詞の置き換えを候補にする', () => {
    expect(phraseCandidates(['gave', 'up'])).toEqual(['gave up', 'give up']);
    expect(phraseCandidates(['made', 'up', 'his', 'mind'])).toContain("make up one's mind");
    expect(phraseCandidates(['look', 'it', 'up'])).toEqual(['look it up', 'look up']);
    expect(phraseCandidates(['enjoyed', 'herself'])).toContain('enjoy oneself');
  });
  it('候補は 8 個までに抑える', () => {
    expect(phraseCandidates(['made', 'his', 'her', 'their', 'my', 'mind']).length).toBeLessThanOrEqual(8);
  });
});

describe('lookupPhrase の候補引き', () => {
  it('活用形や代名詞を含んでいても、辞書の見出しの形で見つかればそれをキーにする', async () => {
    expect(await lookupPhrase(['gave', 'up'], dict)).toEqual({ key: 'give up', meaningJa: 'やめる', parts: [] });
    expect((await lookupPhrase(['made', 'up', 'her', 'mind'], dict)).key).toBe("make up one's mind");
  });
});

describe('phraseTokenMatches', () => {
  it('活用形と、one\'s / oneself に当たる代名詞を同じ語とみなす', () => {
    expect(phraseTokenMatches('Gave', 'give')).toBe(true);
    expect(phraseTokenMatches('up,', 'up')).toBe(true);
    expect(phraseTokenMatches('their', "one's")).toBe(true);
    expect(phraseTokenMatches('himself', 'oneself')).toBe(true);
    expect(phraseTokenMatches('take', 'give')).toBe(false);
  });
});
