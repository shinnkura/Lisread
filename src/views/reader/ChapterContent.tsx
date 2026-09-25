import { useEffect, useRef, type MouseEvent } from 'react';
import type { LoadedChapter } from '../../viewmodels/useReader';
import { sanitizeChapter } from '../../services/reader/sanitize';
import { segmentElement, getSentenceText } from '../../services/reader/segmenter';

export interface WordTap { word: string; sid: number; wid: number; sentence: string }

export function ChapterContent({ loaded, onReady, onWordTap }: { loaded: LoadedChapter; onReady(count: number, root: HTMLElement): void; onWordTap(t: WordTap): void }) {
  const host = useRef<HTMLDivElement>(null);
  const tapRef = useRef(onWordTap); tapRef.current = onWordTap;
  const readyRef = useRef(onReady); readyRef.current = onReady;

  useEffect(() => {
    const el = host.current!;
    const root = sanitizeChapter(loaded.chapter.html, loaded.chapter.href, loaded.resolve);
    const count = segmentElement(root);
    el.replaceChildren(root);
    readyRef.current(count, root);
  }, [loaded]);

  const onClick = (e: MouseEvent) => {
    const w = (e.target as HTMLElement).closest<HTMLElement>('.w');
    const s = w?.closest<HTMLElement>('.s');
    const root = host.current?.firstElementChild as HTMLElement | null;
    if (!w || !s || !root) return;
    const sid = Number(s.dataset.sid);
    tapRef.current({ word: w.textContent ?? '', sid, wid: Number(w.dataset.wid), sentence: getSentenceText(root, sid) ?? '' });
  };
  return <div ref={host} className="chapter-host" onClick={onClick} />;
}
