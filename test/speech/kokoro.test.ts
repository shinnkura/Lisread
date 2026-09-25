import { describe, it, expect, vi } from 'vitest';
import { KokoroEngine, vocabFromTokenizerJson } from '../../src/services/speech/kokoro/KokoroEngine';
import { normalizeText, textToPhonemes } from '../../src/services/speech/kokoro/phonemes';

describe('Kokoro phonemes', () => {
  it('normalizeText は略語・金額・小数を読める形にする', () => {
    expect(normalizeText('Mr. Bennet paid $5.')).toBe('Mister Bennet paid 5 dollars.');
    expect(normalizeText('Dr. Smith, 3.14')).toBe('Doctor Smith, 3 point 1 4');
  });
  it('textToPhonemes は句読点を残し、区間ごとに音素化して結合する', async () => {
    const fake = vi.fn(async (t: string) => [t.trim().split(' ').map((w) => `<${w}>`).join(' ')]);
    const ps = await textToPhonemes('Hello, big day. Go!', 'a', fake);
    expect(ps).toBe('<Hello>, <big> <day>. <Go>!');
    expect(fake).toHaveBeenCalledWith('Hello', 'en-us');
    expect(fake).toHaveBeenCalledWith('big day', 'en-us');
  });
  it('英国音声は en で音素化し、r を ɹ に正規化する', async () => {
    const fake = vi.fn(async () => ['rɪd']);
    expect(await textToPhonemes('red', 'b', fake)).toBe('ɹɪd');
    expect(fake).toHaveBeenCalledWith('red', 'en');
  });
});

describe('KokoroEngine', () => {
  const vocab = vocabFromTokenizerJson({ model: { vocab: { $: 0, h: 20, ə: 30, l: 40, ',': 3 } } });
  function fakeOrt() {
    const runs: Record<string, unknown>[] = [];
    const ort = {
      InferenceSession: { create: vi.fn(async () => ({ inputNames: ['input_ids', 'style', 'speed'], run: async (f: Record<string, unknown>) => { runs.push(f); return { waveform: { data: new Float32Array(2400) } }; } })) },
      Tensor: class { constructor(public type: string, public data: unknown, public dims: number[]) {} },
    };
    return { ort, runs };
  }
  it('tokenize は既知の文字だけを id にし、前後に 0 を付ける', async () => {
    const { ort } = fakeOrt();
    const e = await KokoroEngine.create(ort as never, new Uint8Array(1), vocab);
    expect(e.tokenize('həl,x')).toEqual([0, 20, 30, 40, 3, 0]);
  });
  it('synthesize はトークン数に応じた style 行と speed を渡し、波形を返す', async () => {
    const { ort, runs } = fakeOrt();
    const e = await KokoroEngine.create(ort as never, new Uint8Array(1), vocab);
    const voice = new Float32Array(510 * 256).map((_, i) => Math.floor(i / 256));
    const pcm = await e.synthesize('həl', voice, 1.2);
    expect(pcm.length).toBe(2400);
    const feeds = runs[0] as Record<string, { type: string; data: Float32Array | BigInt64Array; dims: number[] }>;
    expect(feeds.input_ids.dims).toEqual([1, 5]);
    expect(Array.from(feeds.input_ids.data as BigInt64Array)).toEqual([0n, 20n, 30n, 40n, 0n]);
    expect(feeds.style.dims).toEqual([1, 256]);
    expect((feeds.style.data as Float32Array)[0]).toBe(3); // 3 トークンなので 3 行目の style
    expect((feeds.speed.data as Float32Array)[0]).toBeCloseTo(1.2);
  });
});
