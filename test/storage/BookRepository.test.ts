import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type LisreadDb } from '../../src/services/storage/db';
import { BookRepository } from '../../src/services/storage/BookRepository';
import { VocabularyRepository } from '../../src/services/storage/VocabularyRepository';
import type { ParsedEpub } from '../../src/models/types';

const parsed: ParsedEpub = {
  title: 'Pride and Prejudice', author: 'Jane Austen',
  cover: { mime: 'image/png', bytes: new Uint8Array([1, 2, 3]) },
  chapters: [
    { index: 0, title: 'Chapter 1', href: 'OEBPS/ch1.xhtml', html: '<p>It is a truth.</p>' },
    { index: 1, href: 'OEBPS/ch2.xhtml', html: '<p>Mr. Bennet.</p>' },
  ],
  assets: [{ path: 'OEBPS/img/a.png', mime: 'image/png', bytes: new Uint8Array([9]) }],
};

let db: LisreadDb; let repo: BookRepository; let n = 0;
beforeEach(() => { db = createDb(`test-books-${n++}`); repo = new BookRepository(db); });

describe('BookRepository', () => {
  it('取り込んだ本・章・アセットを保存し、一覧は新しい順', async () => {
    const b1 = await repo.addBook(parsed);
    const b2 = await repo.addBook({ ...parsed, title: 'Emma' });
    const list = await repo.listBooks();
    expect(list.map((b) => b.title)).toEqual(['Emma', 'Pride and Prejudice']);
    expect(b1.chapterCount).toBe(2);
    expect((await repo.getChapter(b1.id, 1))?.html).toContain('Bennet');
    expect((await repo.getAsset(b1.id, 'OEBPS/img/a.png'))?.bytes[0]).toBe(9);
    expect(b2.lastChapterIndex).toBe(0);
  });

  it('進捗を保存すると lastOpenedAt も更新される', async () => {
    const b = await repo.addBook(parsed);
    await repo.updateProgress(b.id, 1, 0.4);
    const got = await repo.getBook(b.id);
    expect(got?.lastChapterIndex).toBe(1);
    expect(got?.lastScrollProgress).toBeCloseTo(0.4);
    expect(got?.lastOpenedAt).toBeTypeOf('number');
  });

  it('削除で章・アセット・単語も消える', async () => {
    const b = await repo.addBook(parsed);
    const vocab = new VocabularyRepository(db);
    await vocab.save({ word: 'truth', lemma: 'truth', contextSentence: 'It is a truth.', bookId: b.id, chapterIndex: 0, sentenceIndex: 0 });
    await repo.deleteBook(b.id);
    expect(await repo.listBooks()).toHaveLength(0);
    expect(await db.chapters.where('bookId').equals(b.id).count()).toBe(0);
    expect(await db.assets.where('bookId').equals(b.id).count()).toBe(0);
    expect(await db.vocabulary.where('bookId').equals(b.id).count()).toBe(0);
  });

  it('章の保存に失敗したら本も残らない（トランザクション）', async () => {
    // 章 id を先に占有しておき、bulkAdd をキー重複で失敗させる
    await db.chapters.add({ id: 'fixed:0', bookId: 'fixed', index: 0, href: 'x', html: '' });
    await expect(repo.addBook(parsed, 'fixed')).rejects.toThrow();
    expect(await repo.listBooks()).toHaveLength(0);
  });
});
