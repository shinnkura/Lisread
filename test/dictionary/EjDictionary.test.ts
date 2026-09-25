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
});
