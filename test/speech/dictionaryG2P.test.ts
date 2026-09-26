import { describe, it, expect, vi } from 'vitest';
import { DictionaryG2P, lookupWord, approximateSpelling } from '../../src/services/speech/kokoro/DictionaryG2P';

const gold = { hello: 'həlˈO', how: 'hˌW', are: 'ɑɹ', you: 'ju', today: 'tədˈA', stumble: 'stˈʌmbᵊl', read: { DEFAULT: 'ɹˈid', VBD: 'ɹˈɛd' }, stop: 'stˈɑp', try: 'tɹˈI', cat: 'kˈæt', dog: 'dˈɔg' };
const silver = { bennet: 'bˈɛnɪt', apple: 'ˈæpəl' };

describe('lookupWord', () => {
  it('直接ヒット・品詞付き・大文字', () => {
    expect(lookupWord('Hello', [gold])).toBe('həlˈO');
    expect(lookupWord('read', [gold])).toBe('ɹˈid');
    expect(lookupWord('bennet', [gold, silver])).toBe('bˈɛnɪt');
  });
  it('活用形は語幹から作る', () => {
    expect(lookupWord('stumbled', [gold])).toBe('stˈʌmbᵊld');
    expect(lookupWord('cats', [gold])).toBe('kˈæts');
    expect(lookupWord('dogs', [gold])).toBe('dˈɔgz');
    expect(lookupWord('stopped', [gold])).toBe('stˈɑpt');
    expect(lookupWord('tried', [gold])).toBe('tɹˈId');
    expect(lookupWord("cat's", [gold])).toBe('kˈæts');
  });
  it('無ければ null', () => {
    expect(lookupWord('darcy', [gold])).toBeNull();
  });
});

describe('approximateSpelling', () => {
  it('固有名詞をそれらしく近似する', () => {
    expect(approximateSpelling('Darcy')).toBe('dˈɑɹsi');
    expect(approximateSpelling('Bingley')).toBe('bˈɪŋgli');
  });
});

describe('DictionaryG2P', () => {
  it('句読点を残し、辞書→fallback→近似の順で音素化する', async () => {
    const fb = vi.fn(async (w: string) => (w === 'Darcy' ? 'dˈɑɹsi' : null));
    const g2p = new DictionaryG2P([gold, silver], fb);
    expect(await g2p.phonemize('Hello, how are you today?')).toBe('həlˈO, hˌW ɑɹ ju tədˈA?');
    expect(await g2p.phonemize('Darcy and Bennet read.')).toBe('dˈɑɹsi ənd bˈɛnɪt ɹˈid.');
    expect(await g2p.phonemize('the cat, the apple, a dog')).toBe('ðə kˈæt, ði ˈæpəl, ə dˈɔg');
    expect(fb).toHaveBeenCalledWith('Darcy');
  });
});
