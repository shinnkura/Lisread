import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSpeechService } from '../../src/services/speech/SpeechService';

class FakeUtterance { text: string; rate = 1; voice: unknown = null; lang = ''; onend: null | (() => void) = null; onerror: null | ((e: { error: string }) => void) = null; constructor(t: string) { this.text = t; } }
function fakeSynth(voices: { voiceURI: string; name: string; lang: string }[] = []) {
  const listeners: (() => void)[] = [];
  const s = {
    current: null as FakeUtterance | null,
    getVoices: vi.fn(() => voices),
    speak: vi.fn((u: FakeUtterance) => { s.current = u; }),
    cancel: vi.fn(() => { const u = s.current; s.current = null; u?.onerror?.({ error: 'interrupted' }); }),
    addEventListener: vi.fn((_: string, fn: () => void) => listeners.push(fn)),
    removeEventListener: vi.fn(),
    fire: () => listeners.forEach((l) => l()),
  };
  return s;
}

beforeEach(() => { (globalThis as any).SpeechSynthesisUtterance = FakeUtterance; });
afterEach(() => { vi.useRealTimers(); });

describe('WebSpeechService', () => {
  it('英語音声だけ返す。最初が空なら voiceschanged を待つ', async () => {
    const s = fakeSynth();
    const svc = new WebSpeechService(s as unknown as SpeechSynthesis);
    const p = svc.getVoices();
    s.getVoices.mockReturnValue([{ voiceURI: 'a', name: 'Samantha', lang: 'en-US' }, { voiceURI: 'b', name: 'Kyoko', lang: 'ja-JP' }, { voiceURI: 'c', name: 'Daniel', lang: 'en_GB' }]);
    s.fire();
    expect((await p).map((v) => v.id)).toEqual(['a', 'c']);
  });
  it('英語なら他の地域も含め、en-US・en-GB を先頭に並べる', async () => {
    const s = fakeSynth([{ voiceURI: 'au', name: 'Karen', lang: 'en-AU' }, { voiceURI: 'gb', name: 'Daniel', lang: 'en-GB' }, { voiceURI: 'ja', name: 'Kyoko', lang: 'ja-JP' }, { voiceURI: 'us', name: 'Ava', lang: 'en-US' }]);
    const svc = new WebSpeechService(s as unknown as SpeechSynthesis);
    expect((await svc.getVoices()).map((v) => v.id)).toEqual(['us', 'gb', 'au']);
  });
  it('音声未指定なら英語音声を自動で割り当てる（iOS は lang だけでは日本語で読むため）', async () => {
    const s = fakeSynth([{ voiceURI: 'ja', name: 'Kyoko', lang: 'ja-JP' }, { voiceURI: 'gb', name: 'Daniel', lang: 'en-GB' }, { voiceURI: 'us', name: 'Samantha', lang: 'en-US' }]);
    const svc = new WebSpeechService(s as unknown as SpeechSynthesis);
    void svc.speak('Hello.', { voiceId: null, rate: 1 });
    expect((s.current!.voice as { voiceURI: string }).voiceURI).toBe('us');
    expect(s.current!.lang).toBe('en-US');
  });
  it('保存済みの音声 ID が見つからなくても英語音声にフォールバックする', async () => {
    const s = fakeSynth([{ voiceURI: 'ja', name: 'Kyoko', lang: 'ja-JP' }, { voiceURI: 'gb', name: 'Daniel', lang: 'en-GB' }]);
    const svc = new WebSpeechService(s as unknown as SpeechSynthesis);
    void svc.speak('Hello.', { voiceId: 'gone', rate: 1 });
    expect((s.current!.voice as { voiceURI: string }).voiceURI).toBe('gb');
  });
  it('end で ended、cancel で cancelled', async () => {
    const s = fakeSynth();
    const svc = new WebSpeechService(s as unknown as SpeechSynthesis);
    const p1 = svc.speak('Hello.', { voiceId: null, rate: 1.2 });
    expect(s.current?.rate).toBe(1.2);
    s.current!.onend!();
    expect(await p1).toBe('ended');
    const p2 = svc.speak('Again.', { voiceId: null, rate: 1 });
    svc.cancel();
    expect(await p2).toBe('cancelled');
  });
  it('end が来なければ見張りタイマーで ended にする', async () => {
    vi.useFakeTimers();
    const s = fakeSynth();
    const svc = new WebSpeechService(s as unknown as SpeechSynthesis);
    const p = svc.speak('Short.', { voiceId: null, rate: 1 });
    await vi.advanceTimersByTimeAsync(3100);
    expect(await p).toBe('ended');
    expect(s.cancel).toHaveBeenCalled();
  });
  it('speechSynthesis がなければ非対応', () => {
    expect(new WebSpeechService(undefined).isSupported()).toBe(false);
  });
});
