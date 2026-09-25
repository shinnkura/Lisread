import { useCallback, useEffect, useRef, useState } from 'react';
import type { Book, Chapter } from '../models/types';
import type { BookRepositoryPort } from '../services/storage/BookRepository';
import { collectAssetRefs, type AssetResolver } from '../services/reader/sanitize';
import { toBlob } from '../services/storage/blob';

export interface LoadedChapter { chapter: Chapter; resolve: AssetResolver; revoke(): void }

async function loadChapter(books: BookRepositoryPort, bookId: string, index: number): Promise<LoadedChapter | null> {
  const chapter = await books.getChapter(bookId, index);
  if (!chapter) return null;
  const urls = new Map<string, string>();
  for (const path of collectAssetRefs(chapter.html, chapter.href)) {
    const asset = await books.getAsset(bookId, path);
    if (asset) urls.set(path, URL.createObjectURL(toBlob(asset)));
  }
  return { chapter, resolve: (p) => urls.get(p) ?? null, revoke: () => urls.forEach((u) => URL.revokeObjectURL(u)) };
}

export function useReader(deps: { books: BookRepositoryPort }, bookId: string) {
  const [book, setBook] = useState<Book | null>(null);
  const [loaded, setLoaded] = useState<LoadedChapter | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [initialProgress, setInitialProgress] = useState(0);
  const [sentenceCount, setSentenceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const readyResolver = useRef<((ok: boolean) => void) | null>(null);
  const indexRef = useRef(0);

  const open = useCallback(async (index: number) => {
    setLoading(true);
    const next = await loadChapter(deps.books, bookId, index);
    setLoaded(next);
    indexRef.current = index;
    setChapterIndex(index);
    setLoading(false);
    if (!next) setError('この章を表示できません');
    return next !== null;
  }, [deps.books, bookId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const b = await deps.books.getBook(bookId);
      if (!alive) return;
      if (!b) { setError('本が見つかりません'); setLoading(false); return; }
      setBook(b);
      setInitialProgress(b.lastScrollProgress);
      await open(Math.min(b.lastChapterIndex, Math.max(0, b.chapterCount - 1)));
    })();
    return () => { alive = false; };
  }, [deps.books, bookId, open]);

  // 章が切り替わったとき・アンマウント時に前の blob URL を解放する
  useEffect(() => () => loaded?.revoke(), [loaded]);

  const goToChapter = useCallback(async (index: number) => {
    if (!book || index < 0 || index >= book.chapterCount) return false;
    readyResolver.current?.(false);
    const ready = new Promise<boolean>((res) => { readyResolver.current = res; });
    setInitialProgress(0);
    await deps.books.updateProgress(bookId, index, 0);
    if (!(await open(index))) { readyResolver.current = null; return false; }
    return ready;
  }, [book, bookId, deps.books, open]);

  const notifyReady = useCallback((count: number) => {
    setSentenceCount(count);
    readyResolver.current?.(true);
    readyResolver.current = null;
  }, []);

  const saveProgress = useCallback(async (progress: number) => {
    await deps.books.updateProgress(bookId, indexRef.current, progress);
  }, [deps.books, bookId]);

  return { book, loaded, chapterIndex, loading, error, initialProgress, sentenceCount, goToChapter, notifyReady, saveProgress };
}
