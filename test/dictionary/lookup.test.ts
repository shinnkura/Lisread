import { describe, it, expect } from 'vitest';
import { lookupWord, matchesSaved } from '../../src/services/dictionary/lookup';

const dict = { lookup: async (w: string) => ({ stumble: 'つまずく', news: 'ニュース', new: '新しい', run: '走る' } as Record<string, string>)[w] ?? null };

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
