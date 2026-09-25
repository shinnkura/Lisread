import { describe, it, expect, vi } from 'vitest';
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
  it('next / prev は再生中なら読み直し、停止中なら位置だけ動かす', async () => {
    const speech = fakeSpeech(false);
    const { result } = renderHook(() => usePlayback({ speech, getSentenceText: (i) => ['a', 'b', 'c'][i] ?? null, onSentenceChange: () => {}, onChapterEnd: async () => false }));
    act(() => result.current.next());
    expect(result.current.sid).toBe(1);
    expect(result.current.status).toBe('idle');
    act(() => result.current.play());
    act(() => result.current.next());
    expect(speech.spoken).toEqual(['b', 'c']);
    act(() => result.current.prev());
    expect(speech.spoken).toEqual(['b', 'c', 'b']);
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
