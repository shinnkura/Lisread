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
