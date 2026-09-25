import { describe, it, expect } from 'vitest';
import { parseTsv, shardKey } from '../../scripts/build-dict.mjs';

describe('parseTsv', () => {
  it('見出しを小文字化し、カンマ区切りは展開する', () => {
    const m = parseTsv('Stumble\tつまずく\ncolor, colour\t色\n\nbad line without tab\n');
    expect(m.get('stumble')).toBe('つまずく');
    expect(m.get('color')).toBe('色');
    expect(m.get('colour')).toBe('色');
    expect(m.size).toBe(3);
  });
});

describe('shardKey', () => {
  it('英字の頭文字か other を返す', () => {
    expect(shardKey('apple')).toBe('a');
    expect(shardKey('Zebra')).toBe('z');
    expect(shardKey('3d')).toBe('other');
    expect(shardKey('éclair')).toBe('other');
  });
});
