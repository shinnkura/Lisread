import { useCallback, useEffect, useState } from 'react';
import type { Book } from '../models/types';
import type { BookRepositoryPort } from '../services/storage/BookRepository';
import { EpubParseError, type EpubParserPort } from '../services/epub/EpubParser';

export function progressPercent(book: Book): number {
  if (book.chapterCount <= 0) return 0;
  return Math.min(100, Math.round(((book.lastChapterIndex + book.lastScrollProgress) / book.chapterCount) * 100));
}

export function coverUrl(book: Book): string | null {
  // @types/node の Uint8Array<ArrayBufferLike> 定義と lib.dom の BlobPart（Uint8Array<ArrayBuffer> 前提）が
  // 噛み合わないため、bytes を ArrayBuffer とみなしてキャストする（実行時の値は変わらない）。
  return book.cover ? URL.createObjectURL(new Blob([book.cover.bytes as Uint8Array<ArrayBuffer>], { type: book.cover.mime })) : null;
}

/** jsdom など Blob.arrayBuffer がない環境でも動くように FileReader にフォールバックする */
export function readFileBytes(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as ArrayBuffer);
    r.onerror = () => rej(r.error);
    r.readAsArrayBuffer(file);
  });
}

export function useLibrary(deps: { books: BookRepositoryPort; epub: EpubParserPort }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setBooks(await deps.books.listBooks());
    setLoading(false);
  }, [deps.books]);

  useEffect(() => { void reload(); }, [reload]);

  const importFile = useCallback(async (file: File) => {
    setImporting(true);
    try {
      const parsed = await deps.epub.parse(await readFileBytes(file));
      await deps.books.addBook(parsed);
      await reload();
    } catch (e) {
      setError(e instanceof EpubParseError ? e.message : `取り込みに失敗しました: ${(e as Error).message ?? e}`);
    } finally {
      setImporting(false);
    }
  }, [deps, reload]);

  const deleteBook = useCallback(async (id: string) => {
    await deps.books.deleteBook(id);
    await reload();
  }, [deps.books, reload]);

  return { books, loading, importing, error, importFile, deleteBook, clearError: () => setError(null) };
}
