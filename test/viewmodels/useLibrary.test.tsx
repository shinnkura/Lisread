import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLibrary, progressPercent } from '../../src/viewmodels/useLibrary';
import { EpubParseError } from '../../src/services/epub/EpubParser';
import type { Book, ParsedEpub } from '../../src/models/types';

const book = (id: string): Book => ({ id, title: id, chapterCount: 10, lastChapterIndex: 2, lastScrollProgress: 0.5, addedAt: 1 });
function deps(over: Partial<{ parse: (d: ArrayBuffer) => Promise<ParsedEpub> }> = {}) {
  const store: Book[] = [book('a')];
  const books = {
    listBooks: vi.fn(async () => [...store]),
    getBook: vi.fn(), getChapter: vi.fn(), getAsset: vi.fn(), updateProgress: vi.fn(),
    addBook: vi.fn(async (p: ParsedEpub) => { const b = { ...book(p.title), chapterCount: p.chapters.length }; store.push(b); return b; }),
    deleteBook: vi.fn(async (id: string) => { store.splice(store.findIndex((b) => b.id === id), 1); }),
  };
  const epub = { parse: over.parse ?? vi.fn(async () => ({ title: 'new', chapters: [{ index: 0, href: 'c', html: '' }], assets: [] })) };
  return { books, epub };
}

describe('useLibrary', () => {
  it('初期表示で一覧を読み、取り込みで増える', async () => {
    const d = deps();
    const { result } = renderHook(() => useLibrary(d));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.books.map((b) => b.id)).toEqual(['a']);
    await act(() => result.current.importFile(new File([new Uint8Array([1])], 'x.epub')));
    expect(result.current.books.map((b) => b.id)).toEqual(['a', 'new']);
    expect(result.current.error).toBeNull();
  });
  it('壊れた EPUB はエラー文言になり一覧は変わらない', async () => {
    const d = deps({ parse: async () => { throw new EpubParseError('OPF がありません'); } });
    const { result } = renderHook(() => useLibrary(d));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.importFile(new File([new Uint8Array([1])], 'x.epub')));
    expect(result.current.error).toBe('OPF がありません');
    expect(result.current.books).toHaveLength(1);
  });
  it('削除で一覧から消える', async () => {
    const d = deps();
    const { result } = renderHook(() => useLibrary(d));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.deleteBook('a'));
    expect(result.current.books).toHaveLength(0);
  });
  it('progressPercent', () => {
    expect(progressPercent(book('a'))).toBe(25);
    expect(progressPercent({ ...book('a'), chapterCount: 0 })).toBe(0);
  });
});
