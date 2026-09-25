import { useRef } from 'react';
import { useLibrary } from '../../viewmodels/useLibrary';
import { services } from '../../app/services';
import { navigate } from '../../app/router';
import { BookCard } from './BookCard';
import { Toast } from '../common/Toast';
import './library.css';

export function LibraryView() {
  const lib = useLibrary(services);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="screen">
      <header className="topbar">
        <h1>本棚</h1>
        <button className="btn" onClick={() => input.current?.click()} disabled={lib.importing}>{lib.importing ? '取り込み中…' : '取り込み'}</button>
        <input ref={input} type="file" accept=".epub,application/epub+zip" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void lib.importFile(f); e.target.value = ''; }} />
      </header>
      {!lib.loading && lib.books.length === 0 && <p className="empty">右上の「取り込み」から EPUB を追加してください</p>}
      <div className="book-grid">
        {lib.books.map((b) => (
          <BookCard key={b.id} book={b} onOpen={() => navigate({ name: 'reader', bookId: b.id })}
            onLongPress={() => { if (confirm(`「${b.title}」を削除しますか？保存した単語も消えます。`)) void lib.deleteBook(b.id); }} />
        ))}
      </div>
      <p className="empty"><button className="lab-link" onClick={() => navigate({ name: 'ttsLab' })}>読み上げ検証（試作）</button></p>
      <Toast message={lib.error} onClose={lib.clearError} />
    </div>
  );
}
