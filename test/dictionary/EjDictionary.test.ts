import { describe, it, expect, vi } from 'vitest';
import { EjDictionary } from '../../src/services/dictionary/EjDictionary';

function fakeFetch(shards: Record<string, Record<string, string>>) {
  return vi.fn(async (url: string) => {
    const key = url.split('/').pop()!.replace('.json', '');
    const body = shards[key];
    return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response('', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('EjDictionary', () => {
  it('頭文字のシャードだけ取得して引く', async () => {
    const f = fakeFetch({ s: { stumble: 'つまずく' } });
    const d = new EjDictionary('/dict', f);
    expect(await d.lookup('Stumble')).toBe('つまずく');
    expect(await d.lookup('stumbled')).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledWith('/dict/s.json');
  });
  it('シャードがなければ null', async () => {
    const d = new EjDictionary('/dict', fakeFetch({}));
    expect(await d.lookup('zzz')).toBeNull();
  });
  it('取得に失敗したシャードは再度取得を試みる', async () => {
    const shards: Record<string, Record<string, string>> = { a: { apple: 'りんご' } };
    let callCount = 0;
    const f = vi.fn(async (url: string) => {
      callCount++;
      if (callCount === 1) {
        throw new TypeError('offline');
      }
      const key = url.split('/').pop()!.replace('.json', '');
      const body = shards[key];
      return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    const d = new EjDictionary('/dict', f);

    // 最初の検索: fetch失敗
    expect(await d.lookup('apple')).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);

    // 2番目の検索: リトライして成功
    expect(await d.lookup('apple')).toBe('りんご');
    expect(f).toHaveBeenCalledTimes(2);
  });
});
