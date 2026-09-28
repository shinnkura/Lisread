import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePlayback } from '../../src/viewmodels/usePlayback';
import type { SpeechService, SpeakResult } from '../../src/services/speech/SpeechService';

function fakeSpeech(auto = true) {
  let resolver: ((r: SpeakResult) => void) | null = null;
  const speech: SpeechService & { spoken: string[]; finish(r?: SpeakResult): void } = {
    spoken: [],
    isSupported: () => true,
    getVoices: async () => [{ id: 'v1', name: 'Samantha', lang: 'en-US' }],
    speak: vi.fn((text: string) => { speech.spoken.push(text); return new Promise<SpeakResult>((res) => { resolver = res; if (auto) queueMicrotask(() => res('ended')); }); }),
    cancel: vi.fn(() => { resolver?.('cancelled'); resolver = null; }),
    finish: (r: SpeakResult = 'ended') => { resolver?.(r); resolver = null; },
  };
  return speech;
}

describe('usePlayback', () => {
  beforeEach(() => localStorage.clear());

  it('文を順に読み、章末で次章に進み、最終章末で idle になる', async () => {
    let chapter = ['a', 'b'];
    const speech = fakeSpeech();
    const changes: (number | null)[] = [];
    const onChapterEnd = vi.fn(async () => { if (chapter[0] === 'a') { chapter = ['c']; return true; } return false; });
    const { result } = renderHook(() => usePlayback({ speech, getSentenceText: (i) => chapter[i] ?? null, onSentenceChange: (s) => changes.push(s), onChapterEnd }));
    act(() => result.current.play());
    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(speech.spoken).toEqual(['a', 'b', 'c']);
    expect(onChapterEnd).toHaveBeenCalledTimes(2);
    expect(changes).toEqual([0, 1, 0, null]);
  });
  it('一時停止は cancel して sid を保持し、再開は同じ文から', async () => {
    const speech = fakeSpeech(false);
    const { result } = renderHook(() => usePlayback({ speech, getSentenceText: (i) => ['a', 'b', 'c'][i] ?? null, onSentenceChange: () => {}, onChapterEnd: async () => false }));
    act(() => result.current.play());
    await act(async () => speech.finish());
    await waitFor(() => expect(result.current.sid).toBe(1));
    act(() => result.current.pause());
    expect(speech.cancel).toHaveBeenCalled();
    expect(result.current.status).toBe('paused');
    expect(result.current.sid).toBe(1);
    act(() => result.current.play());
    expect(speech.spoken).toEqual(['a', 'b', 'b']);
  });
  it('再生中に play(sid) すると進行中の発話を cancel してから新しい文だけ読む', async () => {
    const speech = fakeSpeech(false);
    const { result } = renderHook(() => usePlayback({ speech, getSentenceText: (i) => ['a', 'b', 'c'][i] ?? null, onSentenceChange: () => {}, onChapterEnd: async () => false }));
    act(() => result.current.play());
    expect(speech.spoken).toEqual(['a']);
    act(() => result.current.play(2));
    expect(speech.cancel).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('playing');
    // iOS Safari では cancel() 直後の speak() が無視されることがあるため、新しい発話は 120ms 遅延される
    await waitFor(() => expect(speech.spoken).toEqual(['a', 'c']));
    expect(result.current.sid).toBe(2);
  });
  it('next / prev は再生中なら読み直し、停止中なら位置だけ動かす', async () => {
    const speech = fakeSpeech(false);
    const { result } = renderHook(() => usePlayback({ speech, getSentenceText: (i) => ['a', 'b', 'c'][i] ?? null, onSentenceChange: () => {}, onChapterEnd: async () => false }));
    act(() => result.current.next());
    expect(result.current.sid).toBe(1);
    expect(result.current.status).toBe('idle');
    act(() => result.current.play());
    act(() => result.current.next());
    // iOS Safari では cancel() 直後の speak() が無視されることがあるため、新しい発話は 120ms 遅延される
    await waitFor(() => expect(speech.spoken).toEqual(['b', 'c']));
    act(() => result.current.prev());
    await waitFor(() => expect(speech.spoken).toEqual(['b', 'c', 'b']));
  });
  it('速度と音声は localStorage に残る', async () => {
    const speech = fakeSpeech(false);
    const { result } = renderHook(() => usePlayback({ speech, getSentenceText: () => null, onSentenceChange: () => {}, onChapterEnd: async () => false }));
    await waitFor(() => expect(result.current.voices).toHaveLength(1));
    act(() => { result.current.setRate(1.3); result.current.setVoice('v1'); });
    expect(localStorage.getItem('lisread.rate')).toBe('1.3');
    expect(localStorage.getItem('lisread.voice')).toBe('v1');
  });
});

describe('usePlayback（準備が要るエンジン）', () => {
  function preparable() {
    const calls: string[] = [];
    let prepared = false;
    const speech = {
      isSupported: () => true,
      getVoices: async () => [{ id: 'kokoro:af_heart', name: 'Heart', lang: 'en-US', engine: 'kokoro' as const }],
      speak: vi.fn(async (t: string) => { calls.push(`speak:${t}`); return 'ended' as const; }),
      cancel: vi.fn(),
      isPrepared: (id: string | null) => !id?.startsWith('kokoro:') || prepared,
      prepare: vi.fn(async (_id: string | null, onProgress?: (m: string) => void) => { onProgress?.('音声モデル 50%'); prepared = true; calls.push('prepare'); }),
      prefetch: vi.fn((t: string) => { calls.push(`prefetch:${t}`); }),
    };
    return { speech, calls };
  }

  it('音声を選んだ時点で準備を始め、進捗を表示する', async () => {
    const { speech } = preparable();
    const { result } = renderHook(() => usePlayback({ speech, getSentenceText: () => null, onSentenceChange: () => {}, onChapterEnd: async () => false }));
    await act(async () => { result.current.setVoice('kokoro:af_heart'); });
    expect(speech.prepare).toHaveBeenCalledWith('kokoro:af_heart', expect.any(Function));
    await waitFor(() => expect(result.current.preparing).toBeNull());
  });

  it('再生時は準備を待ってから話し、次の文を先読みする', async () => {
    const { speech, calls } = preparable();
    const sentences = ['one', 'two', 'three'];
    const { result } = renderHook(() => usePlayback({ speech, getSentenceText: (i) => sentences[i] ?? null, onSentenceChange: () => {}, onChapterEnd: async () => false }));
    await act(async () => { localStorage.setItem('lisread.voice', 'kokoro:af_heart'); });
    act(() => { result.current.setVoice('kokoro:af_heart'); });
    await waitFor(() => expect(result.current.preparing).toBeNull());
    act(() => result.current.play(0));
    await waitFor(() => expect(result.current.status).toBe('idle'));
    // prepare は 1 回だけ。各文の前に次の文が予約される
    expect(calls.filter((c) => c === 'prepare')).toHaveLength(1);
    expect(calls).toContain('prefetch:two');
    expect(calls).toContain('prefetch:three');
    expect(calls.indexOf('prefetch:two')).toBeLessThan(calls.indexOf('speak:one'));
  });

  it('準備に失敗したら理由を表示して再生を止める', async () => {
    const { speech } = preparable();
    speech.prepare = vi.fn(async () => { throw new Error('通信に失敗しました'); });
    speech.isPrepared = () => false;
    const { result } = renderHook(() => usePlayback({ speech, getSentenceText: () => 'one', onSentenceChange: () => {}, onChapterEnd: async () => false }));
    act(() => { result.current.setVoice('kokoro:af_heart'); });
    act(() => result.current.play(0));
    await waitFor(() => expect(result.current.preparing).toMatch(/通信に失敗しました/));
    expect(result.current.status).toBe('idle');
    expect(speech.speak).not.toHaveBeenCalled();
  });
});

describe('usePlayback（音声出力の解禁と生成中の表示）', () => {
  it('再生ボタンと音声選択のたびに unlock を呼ぶ', () => {
    const speech = {
      isSupported: () => true,
      getVoices: async () => [],
      speak: vi.fn(async () => 'ended' as const),
      cancel: vi.fn(),
      unlock: vi.fn(),
    };
    const { result } = renderHook(() => usePlayback({ speech, getSentenceText: (i) => (i === 0 ? 'one' : null), onSentenceChange: () => {}, onChapterEnd: async () => false }));
    act(() => result.current.play(0));
    expect(speech.unlock).toHaveBeenCalledTimes(1);
    act(() => { result.current.setVoice('v1'); });
    expect(speech.unlock).toHaveBeenCalledTimes(2);
  });

  it('鳴り出すまで待つ場合は「音声を作っています…」と出し、鳴ったら消す', async () => {
    let start: (() => void) | null = null;
    let finish: ((r: 'ended') => void) | null = null;
    const speech = {
      isSupported: () => true,
      getVoices: async () => [],
      speak: vi.fn((_t: string, o: { onStart?: () => void }) => { start = () => o.onStart?.(); return new Promise<'ended'>((r) => { finish = r; }); }),
      cancel: vi.fn(),
    };
    const { result } = renderHook(() => usePlayback({ speech, getSentenceText: (i) => (i === 0 ? 'one' : null), onSentenceChange: () => {}, onChapterEnd: async () => false }));
    act(() => result.current.play(0));
    await waitFor(() => expect(result.current.preparing).toBe('音声を作っています…'));
    act(() => start!());
    expect(result.current.preparing).toBeNull();
    await act(async () => { finish!('ended'); });
  });
});
