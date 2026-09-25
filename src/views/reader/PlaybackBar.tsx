import type { Voice } from '../../services/speech/SpeechService';
import type { PlaybackStatus } from '../../viewmodels/usePlayback';

interface Props {
  status: PlaybackStatus; rate: number; voiceId: string | null; voices: Voice[]; unavailable: string | null;
  onToggle(): void; onNext(): void; onPrev(): void; onRate(r: number): void; onVoice(id: string | null): void;
}
export function PlaybackBar(p: Props) {
  if (p.unavailable) return <div className="playbar"><span className="muted">{p.unavailable}</span></div>;
  // 保存済みの音声 ID が現在の voices 一覧に存在しない場合（端末変更などで音声が消えた場合）は
  // 未対応の値を select に渡さず既定の音声として表示する
  const selectedVoiceId = p.voiceId && p.voices.some((v) => v.id === p.voiceId) ? p.voiceId : '';
  return (
    <div className="playbar">
      <div className="playbar-main">
        <button className="icon-btn" aria-label="前の文" onClick={p.onPrev}>⏮</button>
        <button className="icon-btn play" aria-label={p.status === 'playing' ? '一時停止' : '再生'} onClick={p.onToggle}>{p.status === 'playing' ? '❚❚' : '▶'}</button>
        <button className="icon-btn" aria-label="次の文" onClick={p.onNext}>⏭</button>
      </div>
      <div className="playbar-sub">
        <button className="icon-btn" aria-label="遅く" onClick={() => p.onRate(p.rate - 0.1)}>−</button>
        <span className="rate">{p.rate.toFixed(1)}x</span>
        <button className="icon-btn" aria-label="速く" onClick={() => p.onRate(p.rate + 0.1)}>+</button>
        <select aria-label="音声" value={selectedVoiceId} onChange={(e) => p.onVoice(e.target.value || null)}>
          <option value="">既定の音声</option>
          {p.voices.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.lang})</option>)}
        </select>
      </div>
    </div>
  );
}
