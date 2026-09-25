import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useReader } from '../../src/viewmodels/useReader';
import type { Book, Chapter } from '../../src/models/types';

let originalCreate: typeof URL.createObjectURL;
let originalRevoke: typeof URL.revokeObjectURL;

beforeEach(() => {
  originalCreate = URL.createObjectURL;
  originalRevoke = URL.revokeObjectURL;
  let n = 0;
  // jsdom は createObjectURL/revokeObjectURL を持たないため vi.fn でスタブする
  URL.createObjectURL = vi.fn(() => `blob:mock-${++n}`) as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
});

afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

const book: Book = { id: 'b', title: 'T', chapterCount: 2, lastChapterIndex: 1, lastScrollProgress: 0.3, addedAt: 1 };
const chapters: Chapter[] = [
  { id: 'b:0', bookId: 'b', index: 0, href: 'OEBPS/c0.xhtml', html: '<p>zero</p>' },
  { id: 'b:1', bookId: 'b', index: 1, href: 'OEBPS/c1.xhtml', html: '<p>one</p><img src="i.png"/>' },
];
function deps() {
  return { books: {
    listBooks: vi.fn(), addBook: vi.fn(), deleteBook: vi.fn(),
    getBook: vi.fn(async () => book),
    getChapter: vi.fn(async (_: string, i: number) => chapters[i]),
    getAsset: vi.fn(async (_: string, p: string) => (p === 'OEBPS/i.png' ? { id: 'b:OEBPS/i.png', bookId: 'b', path: p, mime: 'image/png', bytes: new Uint8Array([1]) } : undefined)),
    updateProgress: vi.fn(async () => {}),
  } };
}

describe('useReader', () => {
  it('最後に読んだ章と位置から始まり、アセットを解決できる', async () => {
    const d = deps();
    const { result } = renderHook(() => useReader(d, 'b'));
    await waitFor(() => expect(result.current.loaded).not.toBeNull());
    expect(result.current.chapterIndex).toBe(1);
    expect(result.current.initialProgress).toBeCloseTo(0.3);
    expect(result.current.loaded!.resolve('OEBPS/i.png')).toMatch(/^blob:/);
    expect(result.current.loaded!.resolve('OEBPS/none.png')).toBeNull();
  });
  it('goToChapter は ready 通知まで待ち、範囲外は false', async () => {
    const d = deps();
    const { result } = renderHook(() => useReader(d, 'b'));
    await waitFor(() => expect(result.current.loaded).not.toBeNull());
    expect(await result.current.goToChapter(5)).toBe(false);
    let done = false;
    let p: Promise<boolean>;
    act(() => { p = result.current.goToChapter(0).then((ok) => { done = true; return ok; }); });
    await waitFor(() => expect(result.current.chapterIndex).toBe(0));
    expect(done).toBe(false);
    act(() => result.current.notifyReady(4));
    expect(await p!).toBe(true);
    expect(result.current.sentenceCount).toBe(4);
    expect(d.books.updateProgress).toHaveBeenCalledWith('b', 0, 0);
  });
  it('章の読み込みに失敗してもエラー表示のまま別の章へ移動できる', async () => {
    const d = deps();
    d.books.getChapter = vi.fn(async (_: string, i: number) => (i === 1 ? undefined : chapters[0])) as unknown as typeof d.books.getChapter;
    d.books.getBook = vi.fn(async () => ({ ...book, lastChapterIndex: 1 }));
    const { result } = renderHook(() => useReader(d, 'b'));
    await waitFor(() => expect(result.current.error).toBe('この章を表示できません'));
    expect(result.current.loaded).toBeNull();
    act(() => { void result.current.goToChapter(0); });
    await waitFor(() => expect(result.current.loaded).not.toBeNull());
    expect(result.current.error).toBeNull();
  });
  it('saveProgress は現在の章で保存する', async () => {
    const d = deps();
    const { result } = renderHook(() => useReader(d, 'b'));
    await waitFor(() => expect(result.current.loaded).not.toBeNull());
    await act(() => result.current.saveProgress(0.75));
    expect(d.books.updateProgress).toHaveBeenLastCalledWith('b', 1, 0.75);
  });
});
