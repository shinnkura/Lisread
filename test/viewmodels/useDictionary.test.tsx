import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDictionary } from '../../src/viewmodels/useDictionary';
import type { VocabularyEntry } from '../../src/models/types';
import type { PlaybackStatus } from '../../src/viewmodels/usePlayback';

function deps(status: PlaybackStatus) {
  const store: VocabularyEntry[] = [];
  const vocabulary = {
    findByLemma: vi.fn(async (l: string) => store.find((e) => e.lemma === l)),
    save: vi.fn(async (i: Omit<VocabularyEntry, 'id' | 'createdAt'>) => { const e = { ...i, id: 'id1', createdAt: 1 }; store.push(e); return e; }),
    remove: vi.fn(), removeByLemma: vi.fn(async (l: string) => { store.splice(store.findIndex((e) => e.lemma === l), 1); }),
    savedLemmas: vi.fn(async () => new Set(store.map((e) => e.lemma))),
  };
  const playback = { status, pause: vi.fn(), play: vi.fn() };
  const jaDict = { lookup: async (w: string) => (w === 'stumble' ? 'つまずく' : null) };
  const enDict = { lookup: vi.fn(async () => ({ word: 'stumble', meanings: [] })) };
  return { jaDict, enDict, vocabulary, playback };
}
const tap = { word: 'stumbled', sid: 3, wid: 1, sentence: 'He stumbled.' };

describe('useDictionary', () => {
  it('開くと英和が出て、保存・削除が切り替わり、マーカー判定に反映される', async () => {
    const d = deps('idle');
    const { result } = renderHook(() => useDictionary(d, { bookId: 'b', chapterIndex: 2 }));
    act(() => result.current.openFor(tap));
    await waitFor(() => expect(result.current.state.meaningJa).toBe('つまずく'));
    expect(result.current.state.lemma).toBe('stumble');
    expect(result.current.state.saved).toBe(false);
    await act(() => result.current.toggleSave());
    expect(d.vocabulary.save).toHaveBeenCalledWith({ word: 'stumbled', lemma: 'stumble', contextSentence: 'He stumbled.', bookId: 'b', chapterIndex: 2, sentenceIndex: 3 });
    expect(result.current.state.saved).toBe(true);
    expect(result.current.isSaved('Stumbles')).toBe(true);
    await act(() => result.current.toggleSave());
    expect(result.current.state.saved).toBe(false);
    expect(result.current.isSaved('stumbled')).toBe(false);
  });
  it('再生中に開くと一時停止し、閉じると再開する', async () => {
    const d = deps('playing');
    const { result } = renderHook(() => useDictionary(d, { bookId: 'b', chapterIndex: 0 }));
    act(() => result.current.openFor(tap));
    expect(d.playback.pause).toHaveBeenCalled();
    act(() => result.current.close());
    expect(d.playback.play).toHaveBeenCalled();
    expect(result.current.state.open).toBe(false);
  });
  it('ユーザーが一時停止中なら閉じても再生しない', async () => {
    const d = deps('paused');
    const { result } = renderHook(() => useDictionary(d, { bookId: 'b', chapterIndex: 0 }));
    act(() => result.current.openFor(tap));
    act(() => result.current.close());
    expect(d.playback.pause).not.toHaveBeenCalled();
    expect(d.playback.play).not.toHaveBeenCalled();
  });
});
