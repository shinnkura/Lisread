import { describe, it, expect } from 'vitest';
import { parseHash, toHash } from '../../src/app/router';

describe('router', () => {
  it('ハッシュと Route を相互変換する', () => {
    expect(parseHash('#/book/abc-1')).toEqual({ name: 'reader', bookId: 'abc-1' });
    expect(parseHash('')).toEqual({ name: 'library' });
    expect(parseHash('#/nope')).toEqual({ name: 'library' });
    expect(toHash({ name: 'reader', bookId: 'x' })).toBe('#/book/x');
    expect(toHash({ name: 'library' })).toBe('#/');
  });
});
