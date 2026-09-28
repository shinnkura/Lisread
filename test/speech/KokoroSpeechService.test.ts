import { describe, it, expect, vi } from 'vitest';
import { KokoroSpeechService, KOKORO_VOICES, isKokoroVoice, type AudioSink } from '../../src/services/speech/kokoro/KokoroSpeechService';
import { HybridSpeechService } from '../../src/services/speech/HybridSpeechService';
import type { SpeechService } from '../../src/services/speech/SpeechService';

/** 再生を手動で終わらせられる差し替え用の再生先 */
function fakeSink() {
  const played: number[] = [];
  let finish: (() => void) | null = null;
  const sink: AudioSink & { played: number[]; end(): void; unlocked: number } = {
    played, unlocked: 0,
    unlock() { sink.unlocked++; },
    play(pcm) {
      played.push(pcm.length);
      return { done: new Promise<void>((r) => { finish = r; }), stop: () => finish?.() };
    },
    end() { finish?.(); },
  };
  return sink;
}

function fakeBackend(onSynth?: (text: string) => void) {
  const synthesize = vi.fn(async (text: string) => { onSynth?.(text); return new Float32Array(2400); });
  const load = vi.fn(async (onStage: (m: string) => void) => { onStage('読み込み中'); });
  return { backend: { load, synthesize, dispose: () => {} }, synthesize, load };
}

const heart = KOKORO_VOICES[0].id;

describe('KokoroSpeechService', () => {
  it('声の一覧を返し、ID で Kokoro 用と判別できる', async () => {
    const svc = new KokoroSpeechService({ backend: fakeBackend().backend, sink: fakeSink() });
    const voices = await svc.getVoices();
    expect(voices.length).toBeGreaterThan(0);
    expect(voices.every((v) => v.engine === 'kokoro')).toBe(true);
    expect(isKokoroVoice(heart)).toBe(true);
    expect(isKokoroVoice('com.apple.voice.Samantha')).toBe(false);
  });

  it('未準備なら isPrepared は false、prepare 後は true。進捗が通知される', async () => {
    const { backend, load } = fakeBackend();
    const svc = new KokoroSpeechService({ backend, sink: fakeSink() });
    expect(svc.isPrepared(heart)).toBe(false);
    expect(svc.isPrepared('com.apple.voice.Samantha')).toBe(true); // 標準音声は準備不要
    const messages: string[] = [];
    await svc.prepare(heart, (m) => messages.push(m));
    expect(svc.isPrepared(heart)).toBe(true);
    expect(messages).toContain('読み込み中');
    await svc.prepare(heart);
    expect(load).toHaveBeenCalledTimes(1); // 2 回目は読み込み直さない
  });

  it('speak は音声を生成して再生し、再生完了で ended を返す', async () => {
    const sink = fakeSink();
    const { backend, synthesize } = fakeBackend();
    const svc = new KokoroSpeechService({ backend, sink });
    const p = svc.speak('Hello.', { voiceId: heart, rate: 1 });
    expect(sink.unlocked).toBe(1); // 音声出力の解禁は await より前
    await vi.waitFor(() => expect(sink.played.length).toBe(1));
    sink.end();
    expect(await p).toBe('ended');
    expect(synthesize).toHaveBeenCalledOnce();
  });

  it('cancel すると cancelled を返し、再生が止まる', async () => {
    const sink = fakeSink();
    const svc = new KokoroSpeechService({ backend: fakeBackend().backend, sink });
    const p = svc.speak('Hello.', { voiceId: heart, rate: 1 });
    await vi.waitFor(() => expect(sink.played.length).toBe(1));
    svc.cancel();
    expect(await p).toBe('cancelled');
  });

  it('同じ文は作り直さない', async () => {
    const sink = fakeSink();
    const { backend, synthesize } = fakeBackend();
    const svc = new KokoroSpeechService({ backend, sink });
    const first = svc.speak('Hello.', { voiceId: heart, rate: 1 });
    await vi.waitFor(() => expect(sink.played.length).toBe(1));
    sink.end(); await first;
    const second = svc.speak('Hello.', { voiceId: heart, rate: 1 });
    await vi.waitFor(() => expect(sink.played.length).toBe(2));
    sink.end(); await second;
    expect(synthesize).toHaveBeenCalledTimes(1);
  });

  it('prefetch は予約だけで、現在の文の再生が始まってから生成する', async () => {
    const sink = fakeSink();
    const order: string[] = [];
    const { backend, synthesize } = fakeBackend((t) => order.push(t));
    const svc = new KokoroSpeechService({ backend, sink });
    svc.prefetch('Next.', { voiceId: heart, rate: 1 });
    expect(synthesize).not.toHaveBeenCalled(); // まだ生成しない
    const p = svc.speak('Now.', { voiceId: heart, rate: 1 });
    await vi.waitFor(() => expect(order).toEqual(['Now.', 'Next.']));
    sink.end();
    expect(await p).toBe('ended');
    // 先読み済みなので次の speak では生成が増えない
    const q = svc.speak('Next.', { voiceId: heart, rate: 1 });
    await vi.waitFor(() => expect(sink.played.length).toBe(2));
    sink.end(); await q;
    expect(synthesize).toHaveBeenCalledTimes(2);
  });

  it('生成に失敗したら理由つきで例外にする（無音のまま進めない）', async () => {
    const svc = new KokoroSpeechService({ backend: { load: vi.fn(async () => { throw new Error('取得失敗'); }), synthesize: vi.fn(), dispose: () => {} } as never, sink: fakeSink() });
    await expect(svc.speak('Hello.', { voiceId: heart, rate: 1 })).rejects.toThrow(/音声を作れませんでした: 取得失敗/);
  });
});

describe('HybridSpeechService', () => {
  function stub(name: string, calls: string[]): SpeechService {
    return {
      isSupported: () => true,
      getVoices: async () => [{ id: `${name}-1`, name, lang: 'en-US' }],
      speak: async () => { calls.push(`${name}.speak`); return 'ended'; },
      cancel: () => calls.push(`${name}.cancel`),
      isPrepared: () => name === 'web',
      prepare: async () => { calls.push(`${name}.prepare`); },
      prefetch: () => calls.push(`${name}.prefetch`),
    };
  }

  it('音声 ID で振り分け、一覧は両方を並べる', async () => {
    const calls: string[] = [];
    const h = new HybridSpeechService(stub('web', calls), stub('kokoro', calls));
    expect((await h.getVoices()).map((v) => v.id)).toEqual(['web-1', 'kokoro-1']);
    await h.speak('a', { voiceId: 'com.apple.Samantha', rate: 1 });
    await h.speak('b', { voiceId: heart, rate: 1 });
    h.prefetch('c', { voiceId: heart, rate: 1 });
    expect(calls).toEqual(['web.speak', 'kokoro.speak', 'kokoro.prefetch']);
    expect(h.isPrepared('com.apple.Samantha')).toBe(true);
    expect(h.isPrepared(heart)).toBe(false);
  });

  it('cancel は両方のエンジンを止める', () => {
    const calls: string[] = [];
    const h = new HybridSpeechService(stub('web', calls), stub('kokoro', calls));
    h.cancel();
    expect(calls).toEqual(['web.cancel', 'kokoro.cancel']);
  });
});
