import { useState } from 'react';
import type { Voice } from '../../services/speech/SpeechService';
import type { PlaybackStatus } from '../../viewmodels/usePlayback';

interface Props {
  status: PlaybackStatus; rate: number; voiceId: string | null; voices: Voice[]; unavailable: string | null; preparing?: string | null;
  onToggle(): void; onNext(): void; onPrev(): void; onRate(r: number): void; onVoice(id: string | null): void;
}
// 本文の邪魔にならないよう右下に浮かせる小さな操作パネル。速度と音声は設定ボタンから開く。
// 読むことに集中したいときは小さな丸ボタンまで畳める
export function PlaybackBar(p: Props) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  if (p.unavailable) return <div className="playbar"><span className="playbar-note muted">{p.unavailable}</span></div>;
  // 保存済みの音声 ID が現在の voices 一覧に存在しない場合（端末変更などで音声が消えた場合）は
  // 未対応の値を select に渡さず既定の音声として表示する
  const selectedVoiceId = p.voiceId && p.voices.some((v) => v.id === p.voiceId) ? p.voiceId : '';
  const web = p.voices.filter((v) => v.engine !== 'kokoro');
  const kokoro = p.voices.filter((v) => v.engine === 'kokoro');
  if (hidden) {
    return (
      <div className="playbar">
        <button className={`icon-btn playbar-show${p.status === 'playing' ? ' is-playing' : ''}`} aria-label="再生コントロールを表示" onClick={() => setHidden(false)}>♪</button>
      </div>
    );
  }
  return (
    <div className="playbar">
      {p.preparing && <p className="playbar-note muted">{p.preparing}</p>}
      {open && (
        <div className="playbar-panel">
          <div className="playbar-rate">
            <button className="icon-btn" aria-label="遅く" onClick={() => p.onRate(p.rate - 0.1)}>−</button>
            <span className="rate">{p.rate.toFixed(1)}x</span>
            <button className="icon-btn" aria-label="速く" onClick={() => p.onRate(p.rate + 0.1)}>+</button>
          </div>
          <select aria-label="音声" value={selectedVoiceId} onChange={(e) => p.onVoice(e.target.value || null)}>
            <option value="">自動（英語）</option>
            {web.length > 0 && (
              <optgroup label="標準音声">
                {web.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.lang})</option>)}
              </optgroup>
            )}
            {kokoro.length > 0 && (
              <optgroup label="自然な音声（初回のみ約 90MB）">
                {kokoro.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.lang})</option>)}
              </optgroup>
            )}
          </select>
        </div>
      )}
      <div className="playbar-main">
        <button className="icon-btn" aria-label="前の文" onClick={p.onPrev}>⏮</button>
        <button className="icon-btn play" aria-label={p.status === 'playing' ? '一時停止' : '再生'} onClick={p.onToggle}>{p.status === 'playing' ? '❚❚' : '▶'}</button>
        <button className="icon-btn" aria-label="次の文" onClick={p.onNext}>⏭</button>
        <button className="icon-btn rate-toggle" aria-label="速度と音声" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{p.rate.toFixed(1)}x</button>
        <button className="icon-btn playbar-hide" aria-label="再生コントロールを隠す" onClick={() => { setOpen(false); setHidden(true); }}>⌄</button>
      </div>
    </div>
  );
}
