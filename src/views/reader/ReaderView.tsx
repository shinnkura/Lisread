import { useCallback, useEffect, useRef, useState } from 'react';
import { services } from '../../app/services';
import { navigate } from '../../app/router';
import { useReader } from '../../viewmodels/useReader';
import { usePlayback } from '../../viewmodels/usePlayback';
import { useDictionary } from '../../viewmodels/useDictionary';
import { applySavedMarkers, getSentenceElements, getSentenceText } from '../../services/reader/segmenter';
import { ChapterContent } from './ChapterContent';
import { PlaybackBar } from './PlaybackBar';
import { DictionarySheet } from '../dictionary/DictionarySheet';
import './reader.css';

export function ReaderView({ bookId }: { bookId: string }) {
  const reader = useReader(services, bookId);
  // goToChapter を呼ぶクロージャ（onChapterEnd）が古い chapterIndex を掴んだままにならないよう、毎レンダー最新値を控える
  const chapterIndexRef = useRef(reader.chapterIndex);
  chapterIndexRef.current = reader.chapterIndex;
  const scroller = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const restoreRef = useRef<number | null>(reader.initialProgress);
  // アンマウント時の effect クリーンアップは DOM が既に外れた後に走るため scroller.current が null になる。
  // その場合に備えて直近のスクロール比率をここに保持し、DOM 消失後の保存では 0 で上書きしないようにする。
  const progressRef = useRef(0);
  const [tick, setTick] = useState(0);

  const currentProgress = () => {
    const el = scroller.current;
    if (!el) return progressRef.current;
    const max = el.scrollHeight - el.clientHeight;
    const p = max > 0 ? el.scrollTop / max : 0;
    progressRef.current = p;
    return p;
  };
  // reader は毎レンダー新しいオブジェクトなので、ref 経由で最新の saveProgress を呼ぶ（effect の再購読と保存の連発を防ぐ）
  const saveRef = useRef(reader.saveProgress); saveRef.current = reader.saveProgress;
  const save = useCallback(() => {
    const p = scroller.current ? currentProgress() : progressRef.current;
    void saveRef.current(p);
  }, []);
  const onScroll = useCallback(() => { currentProgress(); }, []);

  // 読んでいる文をハイライトし、scroller の表示範囲外なら中央へスクロールする
  const highlight = (sid: number | null) => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll('.s.speaking').forEach((el) => el.classList.remove('speaking'));
    if (sid === null) return;
    const els = getSentenceElements(root, sid);
    els.forEach((el) => el.classList.add('speaking'));
    const first = els[0];
    const scrollerEl = scroller.current;
    if (!first || !scrollerEl) return;
    const sRect = scrollerEl.getBoundingClientRect();
    const fRect = first.getBoundingClientRect();
    if (fRect.top < sRect.top || fRect.bottom > sRect.bottom) first.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  };

  const playback = usePlayback({
    speech: services.speech,
    getSentenceText: (s) => (rootRef.current ? getSentenceText(rootRef.current, s) : null),
    onSentenceChange: highlight,
    onChapterEnd: () => reader.goToChapter(chapterIndexRef.current + 1),
  });
  const playbackRef = useRef(playback); playbackRef.current = playback;

  const dictionary = useDictionary(
    { jaDict: services.jaDict, enDict: services.enDict, vocabulary: services.vocabulary, playback: { status: playback.status, pause: playback.pause, play: playback.play } },
    { bookId, chapterIndex: reader.chapterIndex },
  );

  // 保存済み単語（活用形含む）に常時マーカーを付ける。保存状態の変化と、章切り替え直後の再描画（tick）で再適用する
  useEffect(() => {
    if (rootRef.current) applySavedMarkers(rootRef.current, dictionary.isSaved);
  }, [dictionary.isSaved, tick]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', save); save(); };
  }, [save]);

  // 画面が非表示になったら読み上げ中のみ一時停止する（保存処理とは独立させる）
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden' && playbackRef.current.status === 'playing') playbackRef.current.pause(); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  useEffect(() => { restoreRef.current = reader.initialProgress; }, [reader.initialProgress]);

  const onReady = (count: number, root: HTMLElement) => {
    rootRef.current = root;
    const el = scroller.current;
    if (el) {
      const p = restoreRef.current ?? 0; restoreRef.current = null;
      el.scrollTop = p * (el.scrollHeight - el.clientHeight);
      progressRef.current = p;
    }
    reader.notifyReady(count);
    setTick((t) => t + 1);
  };

  const go = (delta: number) => { playback.stop(); save(); void reader.goToChapter(reader.chapterIndex + delta); };
  const book = reader.book;
  const nav = (
    <div className="chapter-nav">
      <button className="btn" disabled={reader.chapterIndex <= 0} onClick={() => go(-1)}>前の章</button>
      <button className="btn" disabled={!book || reader.chapterIndex >= book.chapterCount - 1} onClick={() => go(1)}>次の章</button>
    </div>
  );

  return (
    <div className="screen reader">
      <header className="topbar reader-top">
        <button className="icon-btn" aria-label="本棚へ戻る" onClick={() => { playback.stop(); save(); navigate({ name: 'library' }); }}>‹</button>
        <div className="reader-title"><div>{book?.title ?? ''}</div><div className="muted">{reader.loaded?.chapter.title ?? `第 ${reader.chapterIndex + 1} 章`}</div></div>
        <span className="icon-btn" />
      </header>
      <div ref={scroller} className="reader-scroll" onScroll={onScroll}>
        {reader.error && <p className="empty">{reader.error}</p>}
        {reader.loaded && (<>{nav}<ChapterContent loaded={reader.loaded} onReady={onReady} onWordTap={dictionary.openFor} />{nav}</>)}
      </div>
      <PlaybackBar
        status={playback.status}
        rate={playback.rate}
        voiceId={playback.voiceId}
        voices={playback.voices}
        unavailable={playback.unavailable}
        onToggle={playback.toggle}
        onNext={playback.next}
        onPrev={playback.prev}
        onRate={playback.setRate}
        onVoice={playback.setVoice}
      />
      <DictionarySheet state={dictionary.state} onClose={dictionary.close} onToggleSave={() => void dictionary.toggleSave()} />
    </div>
  );
}
