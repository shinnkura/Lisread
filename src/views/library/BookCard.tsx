import { useEffect, useRef, useState } from 'react';
import type { Book } from '../../models/types';
import { coverUrl, progressPercent } from '../../viewmodels/useLibrary';

export function BookCard({ book, onOpen, onLongPress }: { book: Book; onOpen: () => void; onLongPress: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = coverUrl(book);
    setUrl(u);
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [book]);
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const start = () => { fired.current = false; timer.current = window.setTimeout(() => { fired.current = true; onLongPress(); }, 500); };
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  return (
    <button className="book-card" onPointerDown={start} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()} onClick={() => { if (!fired.current) onOpen(); }} aria-label={book.title}>
      <div className="book-cover">{url ? <img src={url} alt="" /> : <span className="book-cover-placeholder">{book.title}</span>}</div>
      <div className="book-title">{book.title}</div>
      <div className="book-meta">{book.author ?? ''}</div>
      <div className="book-meta">{progressPercent(book)}%</div>
    </button>
  );
}
