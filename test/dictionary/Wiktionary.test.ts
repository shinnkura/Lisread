import { describe, it, expect, vi } from 'vitest';
import { Wiktionary } from '../../src/services/dictionary/Wiktionary';

const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const giveUp = { en: [{ partOfSpeech: 'Verb', language: 'English', definitions: [
  { definition: '<span class="usage-label-sense"></span> To <a href="/wiki/surrender">surrender</a> ; to stop trying.' },
  { definition: '' },
  { definition: 'Used other than figuratively or idiomatically: see give,‎ up.' },
  { definition: 'To <a>relinquish</a>.' },
] }] };
const gaveUp = { en: [{ partOfSpeech: 'Verb', language: 'English', definitions: [
  { definition: '<span class="form-of-definition use-with-mention">simple past of <span class="form-of-definition-link"><i><a href="/wiki/give_up#English" title="give up">give up</a></i></span></span>' },
] }] };

describe('Wiktionary', () => {
  it('定義の HTML を文字列にして要約する（空の定義と字義どおりの案内文は除く）', async () => {
    const f = vi.fn(async () => res(giveUp)) as unknown as typeof fetch;
    expect(await new Wiktionary(f).lookup('give up')).toEqual({ word: 'give up', meanings: [{ partOfSpeech: 'verb', definitions: ['To surrender; to stop trying.', 'To relinquish.'] }] });
    expect(f).toHaveBeenCalledWith('https://en.wiktionary.org/api/rest_v1/page/definition/give_up', expect.anything());
  });
  it('活用形の項目しかなければ元の見出し語を引き直す', async () => {
    const f = vi.fn(async (url: string) => res(url.endsWith('/gave_up') ? gaveUp : giveUp)) as unknown as typeof fetch;
    const r = await new Wiktionary(f).lookup('gave up');
    expect(r?.word).toBe('give up');
    expect(r?.meanings[0].definitions[0]).toBe('To surrender; to stop trying.');
  });
  it('404・英語の項目なし・ネットワークエラーは null', async () => {
    expect(await new Wiktionary(vi.fn(async () => res({}, 404)) as unknown as typeof fetch).lookup('zzz')).toBeNull();
    expect(await new Wiktionary(vi.fn(async () => res({ fr: [] })) as unknown as typeof fetch).lookup('zzz')).toBeNull();
    expect(await new Wiktionary(vi.fn(async () => { throw new TypeError('offline'); }) as unknown as typeof fetch).lookup('x')).toBeNull();
  });
});
