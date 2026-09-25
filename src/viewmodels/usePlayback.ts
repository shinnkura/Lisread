import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpeechService, Voice } from '../services/speech/SpeechService';

export type PlaybackStatus = 'idle' | 'playing' | 'paused';
export interface PlaybackDeps {
  speech: SpeechService;
  getSentenceText(sid: number): string | null;
  onSentenceChange(sid: number | null): void;
  onChapterEnd(): Promise<boolean>;
}

const clampRate = (r: number) => Math.round(Math.min(2, Math.max(0.5, r)) * 10) / 10;
const readRate = () => { const v = Number(localStorage.getItem('lisread.rate')); return v ? clampRate(v) : 1; };

export function usePlayback(deps: PlaybackDeps) {
  const depsRef = useRef(deps); depsRef.current = deps;
  const [status, setStatus] = useState<PlaybackStatus>('idle');
  const [sid, setSid] = useState(0);
  const [rate, setRateState] = useState(readRate);
  const [voiceId, setVoiceState] = useState<string | null>(() => localStorage.getItem('lisread.voice'));
  const [voices, setVoices] = useState<Voice[]>([]);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const runId = useRef(0);
  const sidRef = useRef(0);
  const rateRef = useRef(rate); rateRef.current = rate;
  const voiceRef = useRef(voiceId); voiceRef.current = voiceId;
  const statusRef = useRef(status); statusRef.current = status;

  useEffect(() => {
    const d = depsRef.current;
    if (!d.speech.isSupported()) { setUnavailable('この端末では読み上げが使えません'); return; }
    void d.speech.getVoices().then((v) => { setVoices(v); if (v.length === 0) setUnavailable('英語の音声が見つかりません'); });
  }, []);

  const setCurrent = (s: number) => { sidRef.current = s; setSid(s); };

  const run = (from: number) => {
    // 再生中に別の文へ飛ぶ場合（play(n) の呼び直しなど）は、キューに残る古い発話をここで確実に止める
    const wasPlaying = statusRef.current === 'playing';
    if (wasPlaying) depsRef.current.speech.cancel();
    const my = ++runId.current;
    setStatus('playing');
    const loop = async (s: number): Promise<void> => {
      let d = depsRef.current;
      let text = d.getSentenceText(s);
      if (text === null) {
        const more = await d.onChapterEnd();
        if (my !== runId.current) return;
        d = depsRef.current; // await の間に deps が更新されている可能性があるので取り直す
        if (!more) { setStatus('idle'); setCurrent(0); d.onSentenceChange(null); return; }
        s = 0; text = d.getSentenceText(0);
        if (text === null) { setStatus('idle'); d.onSentenceChange(null); return; }
      }
      setCurrent(s); d.onSentenceChange(s);
      const r = await d.speech.speak(text, { voiceId: voiceRef.current, rate: rateRef.current });
      if (my !== runId.current || r === 'cancelled') return;
      return loop(s + 1);
    };
    if (wasPlaying) {
      // iOS Safari では cancel() の直後に speak() を呼ぶと新しい発話がブラウザ側で無視されることがあるため、
      // 少し間を空けてから開始する。runId で guard しているので、待っている間にさらに新しい run() が
      // 呼ばれればこの古い loop は実行されない。
      setTimeout(() => { if (my === runId.current) void loop(from); }, 120);
    } else {
      // 何も再生していなかった場合は同期的に speak() まで進める（iOS の「ユーザー操作起点でないと
      // 発話できない」制約に対応するため、初回 speak はイベントハンドラの呼び出しと同じ tick で行う）
      void loop(from);
    }
  };

  const stopSpeaking = () => { runId.current++; depsRef.current.speech.cancel(); };

  const play = useCallback((fromSid?: number) => { run(fromSid ?? sidRef.current); }, []);
  const pause = useCallback(() => { stopSpeaking(); setStatus('paused'); }, []);
  const stop = useCallback(() => { stopSpeaking(); setStatus('idle'); setCurrent(0); depsRef.current.onSentenceChange(null); }, []);
  const toggle = useCallback(() => { if (status === 'playing') pause(); else play(); }, [status, pause, play]);
  const move = useCallback((delta: number) => {
    const target = Math.max(0, sidRef.current + delta);
    // cancel は run() 内で一度だけ行う（ここで stopSpeaking() を重ねて呼ばない）
    if (status === 'playing') { run(target); }
    else { setCurrent(target); depsRef.current.onSentenceChange(target); }
  }, [status]);
  const next = useCallback(() => move(1), [move]);
  const prev = useCallback(() => move(-1), [move]);
  const setRate = useCallback((r: number) => { const c = clampRate(r); setRateState(c); localStorage.setItem('lisread.rate', String(c)); }, []);
  const setVoice = useCallback((id: string | null) => { setVoiceState(id); if (id) localStorage.setItem('lisread.voice', id); else localStorage.removeItem('lisread.voice'); }, []);

  useEffect(() => () => { runId.current++; depsRef.current.speech.cancel(); }, []);

  return { status, sid, rate, voiceId, voices, unavailable, play, pause, toggle, next, prev, stop, setRate, setVoice };
}
