import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type LisreadDb } from '../../src/services/storage/db';
import { VocabularyRepository } from '../../src/services/storage/VocabularyRepository';

let db: LisreadDb; let repo: VocabularyRepository; let n = 0;
beforeEach(() => { db = createDb(`test-vocab-${n++}`); repo = new VocabularyRepository(db); });
const base = { word: 'stumbled', lemma: 'stumble', contextSentence: 'He stumbled.', bookId: 'b1', chapterIndex: 2, sentenceIndex: 5 };

describe('VocabularyRepository', () => {
  it('保存して lemma で引ける。同じ lemma は二重登録しない', async () => {
    const a = await repo.save(base);
    const b = await repo.save({ ...base, word: 'stumbles', bookId: 'b2' });
    expect(b.id).toBe(a.id);
    expect((await repo.findByLemma('stumble'))?.word).toBe('stumbled');
    expect(await repo.savedLemmas()).toEqual(new Set(['stumble']));
  });
  it('lemma で削除できる', async () => {
    await repo.save(base);
    await repo.removeByLemma('stumble');
    expect(await repo.findByLemma('stumble')).toBeUndefined();
  });
});
