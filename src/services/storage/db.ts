import Dexie, { type EntityTable } from 'dexie';
import type { Book, Chapter, Asset, VocabularyEntry } from '../../models/types';

export type LisreadDb = Dexie & {
  books: EntityTable<Book, 'id'>;
  chapters: EntityTable<Chapter, 'id'>;
  assets: EntityTable<Asset, 'id'>;
  vocabulary: EntityTable<VocabularyEntry, 'id'>;
};

export function createDb(name = 'lisread'): LisreadDb {
  const d = new Dexie(name) as LisreadDb;
  d.version(1).stores({
    books: 'id, addedAt',
    chapters: 'id, bookId, [bookId+index]',
    assets: 'id, bookId, [bookId+path]',
    vocabulary: 'id, lemma, bookId, createdAt',
  });
  return d;
}

// アプリ用の既定インスタンス
export const db = createDb();
