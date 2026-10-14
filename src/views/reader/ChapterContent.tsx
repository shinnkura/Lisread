import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { LoadedChapter } from '../../viewmodels/useReader';
import { sanitizeChapter } from '../../services/reader/sanitize';
import { segmentElement, getSentenceText, wordsInRange } from '../../services/reader/segmenter';

// words は複数語を選択したときだけ入る（選択範囲にかかる語を文書順に並べたもの）。word はそのときの表示用テキスト
export interface WordTap { word: string; sid: number; wid: number; sentence: string; words?: string[] }

interface Selected { words: HTMLElement[]; rect: DOMRect }

export function ChapterContent({ loaded, onReady, onWordTap }: { loaded: LoadedChapter; onReady(count: number, root: HTMLElement): void; onWordTap(t: WordTap): void }) {
  const host = useRef<HTMLDivElement>(null);
  const tapRef = useRef(onWordTap); tapRef.current = onWordTap;
  const readyRef = useRef(onReady); readyRef.current = onReady;
  const [selected, setSelected] = useState<Selected | null>(null);
  const selectedRef = useRef(selected); selectedRef.current = selected;

  useEffect(() => {
    const el = host.current!;
    const root = sanitizeChapter(loaded.chapter.html, loaded.chapter.href, loaded.resolve);
    const count = segmentElement(root);
    el.replaceChildren(root);
    readyRef.current(count, root);
  }, [loaded]);

  // 本文中で 2 語以上が選択されている間だけ「調べる」ボタンを出す。スクロールで選択範囲が動いたら位置を追従させる
  useEffect(() => {
    const update = () => {
      const sel = document.getSelection();
      const root = host.current?.firstElementChild as HTMLElement | null;
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !root) { setSelected(null); return; }
      const range = sel.getRangeAt(0);
      const words = wordsInRange(root, range);
      setSelected(words.length >= 2 ? { words, rect: range.getBoundingClientRect() } : null);
    };
    const onScroll = () => { if (selectedRef.current) update(); };
    document.addEventListener('selectionchange', update);
    document.addEventListener('scroll', onScroll, true);
    return () => { document.removeEventListener('selectionchange', update); document.removeEventListener('scroll', onScroll, true); };
  }, []);

  const lookupSelection = () => {
    const s = selectedRef.current;
    const root = host.current?.firstElementChild as HTMLElement | null;
    if (!s || !root) return;
    const first = s.words[0], last = s.words[s.words.length - 1];
    // 表示用には語の間の句読点も残したいので、最初の語の頭から最後の語の末尾までの本文をそのまま使う
    const r = document.createRange(); r.setStartBefore(first); r.setEndAfter(last);
    const sids = s.words.map((w) => Number(w.closest<HTMLElement>('.s')?.dataset.sid));
    const sentence = [...new Set(sids)].map((sid) => getSentenceText(root, sid) ?? '').join(' ');
    document.getSelection()?.removeAllRanges();
    setSelected(null);
    tapRef.current({ word: r.toString().replace(/\s+/g, ' ').trim(), words: s.words.map((w) => w.textContent ?? ''), sid: sids[0], wid: Number(first.dataset.wid), sentence });
  };

  const onClick = (e: MouseEvent) => {
    // 範囲選択の操作（ドラッグの終わり）で単語タップの辞書が開かないようにする
    if (document.getSelection()?.isCollapsed === false) return;
    const w = (e.target as HTMLElement).closest<HTMLElement>('.w');
    const s = w?.closest<HTMLElement>('.s');
    const root = host.current?.firstElementChild as HTMLElement | null;
    if (!w || !s || !root) return;
    const sid = Number(s.dataset.sid);
    tapRef.current({ word: w.textContent ?? '', sid, wid: Number(w.dataset.wid), sentence: getSentenceText(root, sid) ?? '' });
  };

  return (
    <>
      <div ref={host} className="chapter-host" onClick={onClick} />
      {selected && (
        <button
          className="btn btn-primary selection-lookup"
          style={selectionButtonPosition(selected.rect)}
          // iPhone ではボタンに触れた時点で選択が解除されボタンが消えるため、押し下げた瞬間に調べる
          onPointerDown={(e) => { e.preventDefault(); lookupSelection(); }}
          onClick={(e) => { if (e.detail === 0) lookupSelection(); }}
        >調べる</button>
      )}
    </>
  );
}

// iPhone の標準メニュー（コピー等）は選択範囲の上に出るので、ボタンは下側に置く。画面下端に収まらなければ上側に回す
function selectionButtonPosition(rect: DOMRect): { top: number; left: number } {
  const w = 72, h = 36, gap = 10, margin = 8;
  const below = rect.bottom + gap;
  const top = below + h + margin <= window.innerHeight ? below : Math.max(margin, rect.top - gap - h);
  const left = Math.min(Math.max(margin, rect.left + rect.width / 2 - w / 2), window.innerWidth - w - margin);
  return { top, left };
}
