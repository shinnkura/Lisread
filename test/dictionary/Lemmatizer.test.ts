import { describe, it, expect } from 'vitest';
import { normalizeWord, lemmaCandidates } from '../../src/services/dictionary/Lemmatizer';

describe('normalizeWord', () => {
  it('引用符と句読点を除いて小文字化する', () => {
    expect(normalizeWord('“Don’t”')).toBe("don't");
    expect(normalizeWord('Elizabeth,')).toBe('elizabeth');
    expect(normalizeWord("‘Tis")).toBe('tis');
    expect(normalizeWord('well-known')).toBe('well-known');
  });
});

describe('lemmaCandidates', () => {
  it('活用形から原形候補を返す', () => {
    expect(lemmaCandidates('stumbled')[0]).toBe('stumble');
    expect(lemmaCandidates('running')[0]).toBe('run');
    expect(lemmaCandidates('books')).toContain('book');
    expect(lemmaCandidates('was')[0]).toBe('be');
  });
  it('原形そのものは候補に含めない', () => {
    expect(lemmaCandidates('book')).not.toContain('book');
  });
});
