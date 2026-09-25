import { db } from '../services/storage/db';
import { BookRepository } from '../services/storage/BookRepository';
import { VocabularyRepository } from '../services/storage/VocabularyRepository';
import { EpubParser } from '../services/epub/EpubParser';
import { EjDictionary } from '../services/dictionary/EjDictionary';

export const services = {
  books: new BookRepository(db),
  vocabulary: new VocabularyRepository(db),
  epub: new EpubParser(),
  jaDict: new EjDictionary(),
};
