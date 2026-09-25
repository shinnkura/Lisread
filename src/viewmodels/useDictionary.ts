import { useCallback, useEffect, useRef, useState } from 'react';
import type { JaDictionary } from '../services/dictionary/EjDictionary';
import type { EnDictionaryPort, EnEntry } from '../services/dictionary/FreeDictionary';
import { lookupWord, matchesSaved } from '../services/dictionary/lookup';
import type { VocabularyRepositoryPort } from '../services/storage/VocabularyRepository';
import type { WordTap } from '../views/reader/ChapterContent';
import type { PlaybackStatus } from './usePlayback';

export interface DictionaryState { open: boolean; word: string; lemma: string; meaningJa: string | null; jaLoading: boolean; en: EnEntry | null; enLoading: boolean; saved: boolean; sentence: string; sid: number }
const closed: DictionaryState = { open: false, word: '', lemma: '', meaningJa: null, jaLoading: false, en: null, enLoading: false, saved: false, sentence: '', sid: 0 };

interface Deps { jaDict: JaDictionary; enDict: EnDictionaryPort; vocabulary: VocabularyRepositoryPort; playback: { status: PlaybackStatus; pause(): void; play(): void } }

// 辞書ボトムシートの状態と、英和/英英の検索・保存トグル・常時マーカー用の判定を提供する
export function useDictionary(deps: Deps, ctx: { bookId: string; chapterIndex: number }) {
  const depsRef = useRef(deps); depsRef.current = deps;
  const ctxRef = useRef(ctx); ctxRef.current = ctx;
  const [state, setState] = useState<DictionaryState>(closed);
  const [savedLemmas, setSavedLemmas] = useState<Set<string>>(new Set());
  const resumeOnClose = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const seq = useRef(0);

  const refreshSaved = useCallback(async () => setSavedLemmas(await depsRef.current.vocabulary.savedLemmas()), []);
  useEffect(() => { void refreshSaved(); }, [refreshSaved]);

  const openFor = useCallback((tap: WordTap) => {
    const d = depsRef.current;
    if (d.playback.status === 'playing') { d.playback.pause(); resumeOnClose.current = true; } else resumeOnClose.current = false;
    abort.current?.abort();
    const my = ++seq.current;
    setState({ ...closed, open: true, word: tap.word, lemma: tap.word, sentence: tap.sentence, sid: tap.sid, jaLoading: true, enLoading: true });
    void (async () => {
      const r = await lookupWord(tap.word, d.jaDict);
      if (my !== seq.current) return;
      const saved = !!(await d.vocabulary.findByLemma(r.lemma));
      if (my !== seq.current) return;
      setState((s) => ({ ...s, word: r.word, lemma: r.lemma, meaningJa: r.meaningJa, jaLoading: false, saved }));
      const ac = new AbortController(); abort.current = ac;
      const en = await d.enDict.lookup(r.lemma, ac.signal);
      if (my !== seq.current) return;
      setState((s) => ({ ...s, en, enLoading: false }));
    })();
  }, []);

  const close = useCallback(() => {
    seq.current++;
    abort.current?.abort();
    setState(closed);
    if (resumeOnClose.current) { resumeOnClose.current = false; depsRef.current.playback.play(); }
  }, []);

  const toggleSave = useCallback(async () => {
    const d = depsRef.current; const s = state; const c = ctxRef.current;
    if (!s.open || !s.lemma) return;
    if (s.saved) await d.vocabulary.removeByLemma(s.lemma);
    else await d.vocabulary.save({ word: s.word, lemma: s.lemma, contextSentence: s.sentence, bookId: c.bookId, chapterIndex: c.chapterIndex, sentenceIndex: s.sid });
    setState((x) => ({ ...x, saved: !s.saved }));
    await refreshSaved();
  }, [state, refreshSaved]);

  const isSaved = useCallback((raw: string) => matchesSaved(raw, savedLemmas), [savedLemmas]);

  return { state, savedLemmas, openFor, close, toggleSave, isSaved };
}
