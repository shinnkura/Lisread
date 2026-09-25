// アプリ全体で使うドメインモデル。
// バイナリデータ（表紙・アセット）は Blob ではなく Uint8Array + mime で保持する。
// iOS Safari の IndexedDB は Blob の扱いが不安定なため。

export interface BinaryAsset {
  mime: string;
  bytes: Uint8Array;
}

export interface Book {
  id: string;
  title: string;
  author?: string;
  cover?: BinaryAsset;
  chapterCount: number;
  lastChapterIndex: number;
  lastScrollProgress: number;
  addedAt: number;
  lastOpenedAt?: number;
}

export interface Chapter {
  id: string;
  bookId: string;
  index: number;
  title?: string;
  href: string;
  html: string;
}

export interface Asset extends BinaryAsset {
  id: string;
  bookId: string;
  path: string;
}

export interface VocabularyEntry {
  id: string;
  word: string;
  lemma: string;
  contextSentence: string;
  bookId: string;
  chapterIndex: number;
  sentenceIndex: number;
  createdAt: number;
}

export interface ParsedEpub {
  title: string;
  author?: string;
  cover?: BinaryAsset;
  chapters: { index: number; title?: string; href: string; html: string }[];
  assets: { path: string; mime: string; bytes: Uint8Array }[];
}
