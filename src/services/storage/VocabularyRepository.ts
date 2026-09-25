import type { VocabularyEntry } from '../../models/types';
import type { LisreadDb } from './db';
import { newId } from './id';

export interface VocabularyRepositoryPort {
  findByLemma(lemma: string): Promise<VocabularyEntry | undefined>;
  save(input: Omit<VocabularyEntry, 'id' | 'createdAt'>): Promise<VocabularyEntry>;
  remove(id: string): Promise<void>;
  removeByLemma(lemma: string): Promise<void>;
  savedLemmas(): Promise<Set<string>>;
}

export class VocabularyRepository implements VocabularyRepositoryPort {
  constructor(private db: LisreadDb) {}
  findByLemma(lemma: string) {
    return this.db.vocabulary.where('lemma').equals(lemma).first();
  }
  async save(input: Omit<VocabularyEntry, 'id' | 'createdAt'>) {
    return this.db.transaction('rw', this.db.vocabulary, async () => {
      const existing = await this.findByLemma(input.lemma);
      if (existing) return existing;
      const entry: VocabularyEntry = { ...input, id: newId(), createdAt: Date.now() };
      await this.db.vocabulary.add(entry);
      return entry;
    });
  }
  async remove(id: string) {
    await this.db.vocabulary.delete(id);
  }
  async removeByLemma(lemma: string) {
    await this.db.vocabulary.where('lemma').equals(lemma).delete();
  }
  async savedLemmas() {
    return new Set(await this.db.vocabulary.orderBy('lemma').uniqueKeys() as string[]);
  }
}
