import type { DictionaryState } from '../../viewmodels/useDictionary';
import './sheet.css';

export function DictionarySheet({ state, onClose, onToggleSave }: { state: DictionaryState; onClose(): void; onToggleSave(): void }) {
  if (!state.open) return null;
  const online = typeof navigator === 'undefined' || navigator.onLine;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="辞書" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div><span className="sheet-word">{state.word}</span>{state.lemma !== state.word && <span className="sheet-lemma"> → {state.lemma}</span>}</div>
          <button className={`btn ${state.saved ? '' : 'btn-primary'}`} onClick={onToggleSave} disabled={!state.lemma || state.jaLoading}>{state.saved ? '削除' : '保存'}</button>
        </div>
        <section className="sheet-section">
          <h3>英和</h3>
          {state.jaLoading ? (
            <p className="muted">読み込み中…</p>
          ) : state.meaningJa === null ? (
            <p className="muted">見つかりませんでした</p>
          ) : (
            state.meaningJa.split(' / ').map((m, i) => <p key={i}>{m}</p>)
          )}
        </section>
        {online && (state.enLoading || state.en) && (
          <section className="sheet-section">
            <h3>英英{state.en?.phonetic ? <span className="muted"> {state.en.phonetic}</span> : null}</h3>
            {state.enLoading && !state.en && <p className="muted">読み込み中…</p>}
            {state.en?.meanings.map((m, i) => (
              <div key={i}><div className="pos">{m.partOfSpeech}</div><ol>{m.definitions.map((d, j) => <li key={j}>{d}</li>)}</ol></div>
            ))}
          </section>
        )}
        <p className="sheet-context muted">{state.sentence}</p>
        <button className="btn sheet-close" onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}
