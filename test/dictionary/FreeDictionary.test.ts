import { describe, it, expect, vi } from 'vitest';
import { FreeDictionary } from '../../src/services/dictionary/FreeDictionary';

const sample = [{ word: 'stumble', phonetic: '/ˈstʌmbəl/', meanings: [{ partOfSpeech: 'verb', definitions: [{ definition: 'To trip.' }, { definition: 'To falter.' }] }] }];

describe('FreeDictionary', () => {
  it('API の応答を要約する', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(sample), { status: 200 })) as unknown as typeof fetch;
    const r = await new FreeDictionary(f).lookup('stumble');
    expect(r).toEqual({ word: 'stumble', phonetic: '/ˈstʌmbəl/', meanings: [{ partOfSpeech: 'verb', definitions: ['To trip.', 'To falter.'] }] });
    expect(f).toHaveBeenCalledWith('https://api.dictionaryapi.dev/api/v2/entries/en/stumble', expect.anything());
  });
  it('404 やネットワークエラーは null', async () => {
    expect(await new FreeDictionary(vi.fn(async () => new Response('{}', { status: 404 })) as unknown as typeof fetch).lookup('zzz')).toBeNull();
    expect(await new FreeDictionary(vi.fn(async () => { throw new TypeError('offline'); }) as unknown as typeof fetch).lookup('x')).toBeNull();
  });
});
