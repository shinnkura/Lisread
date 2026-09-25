import type { Book, Chapter, Asset, ParsedEpub } from '../../models/types';
import type { LisreadDb } from './db';
import { newId } from './id';

export interface BookRepositoryPort {
  listBooks(): Promise<Book[]>;
  getBook(id: string): Promise<Book | undefined>;
  addBook(parsed: ParsedEpub, id?: string): Promise<Book>;
  deleteBook(id: string): Promise<void>;
  getChapter(bookId: string, index: number): Promise<Chapter | undefined>;
  getAsset(bookId: string, path: string): Promise<Asset | undefined>;
  updateProgress(bookId: string, chapterIndex: number, progress: number): Promise<void>;
}

export class BookRepository implements BookRepositoryPort {
  constructor(private db: LisreadDb) {}

  async listBooks() {
    return this.db.books.orderBy('addedAt').reverse().toArray();
  }
  getBook(id: string) {
    return this.db.books.get(id);
  }
  async addBook(parsed: ParsedEpub, id: string = newId()): Promise<Book> {
    const book: Book = {
      id, title: parsed.title, author: parsed.author, cover: parsed.cover,
      chapterCount: parsed.chapters.length, lastChapterIndex: 0, lastScrollProgress: 0, addedAt: Date.now(),
    };
    await this.db.transaction('rw', this.db.books, this.db.chapters, this.db.assets, async () => {
      await this.db.books.add(book);
      await this.db.chapters.bulkAdd(parsed.chapters.map((c) => ({ ...c, id: `${id}:${c.index}`, bookId: id })));
      await this.db.assets.bulkAdd(parsed.assets.map((a) => ({ ...a, id: `${id}:${a.path}`, bookId: id })));
    });
    return book;
  }
  async deleteBook(id: string) {
    await this.db.transaction('rw', this.db.books, this.db.chapters, this.db.assets, this.db.vocabulary, async () => {
      await this.db.chapters.where('bookId').equals(id).delete();
      await this.db.assets.where('bookId').equals(id).delete();
      await this.db.vocabulary.where('bookId').equals(id).delete();
      await this.db.books.delete(id);
    });
  }
  getChapter(bookId: string, index: number) {
    return this.db.chapters.get(`${bookId}:${index}`);
  }
  getAsset(bookId: string, path: string) {
    return this.db.assets.get(`${bookId}:${path}`);
  }
  async updateProgress(bookId: string, chapterIndex: number, progress: number) {
    await this.db.books.update(bookId, {
      lastChapterIndex: chapterIndex, lastScrollProgress: Math.min(1, Math.max(0, progress)), lastOpenedAt: Date.now(),
    });
  }
}
