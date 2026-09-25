import { useCallback, useEffect, useRef, useState } from 'react';
import { services } from '../../app/services';
import { navigate } from '../../app/router';
import { useReader } from '../../viewmodels/useReader';
import { ChapterContent, type WordTap } from './ChapterContent';
import './reader.css';

export function ReaderView({ bookId }: { bookId: string }) {
  const reader = useReader(services, bookId);
  const scroller = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const restoreRef = useRef<number | null>(reader.initialProgress);
  // アンマウント時の effect クリーンアップは DOM が既に外れた後に走るため scroller.current が null になる。
  // その場合に備えて直近のスクロール比率をここに保持し、DOM 消失後の保存では 0 で上書きしないようにする。
  const progressRef = useRef(0);
  const [, setTick] = useState(0);

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

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', save); save(); };
  }, [save]);

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

  const onWordTap = (_t: WordTap) => { /* Task 10 で辞書を開く */ };
  const go = (delta: number) => { save(); void reader.goToChapter(reader.chapterIndex + delta); };
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
        <button className="icon-btn" aria-label="本棚へ戻る" onClick={() => { save(); navigate({ name: 'library' }); }}>‹</button>
        <div className="reader-title"><div>{book?.title ?? ''}</div><div className="muted">{reader.loaded?.chapter.title ?? `第 ${reader.chapterIndex + 1} 章`}</div></div>
        <span className="icon-btn" />
      </header>
      <div ref={scroller} className="reader-scroll" onScroll={onScroll}>
        {reader.error && <p className="empty">{reader.error}</p>}
        {reader.loaded && (<>{nav}<ChapterContent loaded={reader.loaded} onReady={onReady} onWordTap={onWordTap} />{nav}</>)}
      </div>
    </div>
  );
}
