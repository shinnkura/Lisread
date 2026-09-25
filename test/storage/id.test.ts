import { describe, it, expect, vi, afterEach } from 'vitest';
import { newId } from '../../src/services/storage/id';

const V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  afterEach(() => vi.restoreAllMocks());

  it('v4 形式の UUID を返す', () => {
    expect(newId()).toMatch(V4_RE);
  });

  it('crypto.randomUUID が無い環境でも v4 形式の UUID を返し、毎回異なる値になる', () => {
    const original = crypto.randomUUID;
    // 非セキュアコンテキスト（http での LAN 実機確認）を模して randomUUID を未定義にする
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const a = newId();
      const b = newId();
      expect(a).toMatch(V4_RE);
      expect(b).toMatch(V4_RE);
      expect(a).not.toBe(b);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
  });
});
