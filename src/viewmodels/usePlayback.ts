import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpeechService, Voice } from '../services/speech/SpeechService';

export type PlaybackStatus = 'idle' | 'playing' | 'paused';
export interface PlaybackDeps {
  speech: SpeechService;
  getSentenceText(sid: number): string | null;
  onSentenceChange(sid: number | null): void;
  onChapterEnd(): Promise<boolean>;
}

/** 再生中に何文先まで予約しておくか */
const PREFETCH_AHEAD = 3;
/** 停止・一時停止の間に作り置きしておく文の数。ここで貯めるほど再生が途切れにくくなる */
const WARMUP_AHEAD = 12;

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
  const [preparing, setPreparing] = useState<string | null>(null);
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

  /** 止まっている間に先の文を作り置きしておく（再生を押したときすぐ鳴るように） */
  const warmUp = (count: number) => {
    const d = depsRef.current;
    for (let ahead = 0; ahead < count; ahead++) {
      const t = d.getSentenceText(sidRef.current + ahead);
      if (t === null) break;
      d.speech.prefetch?.(t, { voiceId: voiceRef.current, rate: rateRef.current });
    }
  };

  /** モデルの取得など、その音声を使うための準備を行う。準備不要なら何もしない */
  const ensurePrepared = async (id: string | null): Promise<boolean> => {
    const d = depsRef.current;
    if (d.speech.isPrepared?.(id) !== false) return true;
    setPreparing('音声を準備しています…');
    try {
      await d.speech.prepare?.(id, (m) => setPreparing(`音声を準備しています… ${m}`));
      setPreparing(null);
      return true;
    } catch (e) {
      setPreparing(`音声の準備に失敗しました: ${(e as Error).message ?? String(e)}`);
      return false;
    }
  };

  const run = (from: number) => {
    // ボタンを押した瞬間に音声出力を解禁する（iOS はユーザー操作の外では音を出せない）
    depsRef.current.speech.unlock?.();
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
      const opts = { voiceId: voiceRef.current, rate: rateRef.current };
      // 準備が要る音声のときだけ待つ。標準音声では await を挟まず、クリックと同じ tick で speak まで進める
      if (d.speech.isPrepared?.(opts.voiceId) === false) {
        if (!(await ensurePrepared(opts.voiceId))) { setStatus('idle'); return; }
        if (my !== runId.current) return;
        d = depsRef.current;
      }
      let r: 'ended' | 'cancelled';
      let started = false;
      // 生成に時間がかかるエンジンでは、鳴り出すまで「作っています」と出す（固まったように見えないため）
      const waiting = setTimeout(() => { if (!started && my === runId.current) setPreparing('音声を作っています…'); }, 400);
      try {
        r = await d.speech.speak(text, {
          ...opts,
          onStart: () => {
            started = true; clearTimeout(waiting); setPreparing(null);
            // 鳴り始めてから次の文を予約する（今の文の生成を後回しにしないため）
            for (let ahead = 1; ahead <= PREFETCH_AHEAD; ahead++) {
              const t = depsRef.current.getSentenceText(s + ahead);
              if (t === null) break;
              depsRef.current.speech.prefetch?.(t, opts);
            }
          },
        });
      } catch (e) {
        clearTimeout(waiting);
        if (my !== runId.current) return;
        // 失敗を黙って飛ばすと無音のまま本が進んでしまうため、理由を出して止める
        setPreparing(`読み上げに失敗しました: ${(e as Error).message ?? String(e)}`);
        setStatus('idle');
        return;
      }
      clearTimeout(waiting);
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
  const pause = useCallback(() => {
    stopSpeaking();
    setStatus('paused');
    setPreparing(null);
    // 止まっている間に先を作っておく
    warmUp(WARMUP_AHEAD);
  }, []);
  const stop = useCallback(() => { stopSpeaking(); setStatus('idle'); setCurrent(0); setPreparing(null); depsRef.current.onSentenceChange(null); }, []);
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
  const setVoice = useCallback((id: string | null) => {
    // 音声を選ぶ操作も「ユーザー操作」なので、ここでも解禁しておく
    depsRef.current.speech.unlock?.();
    setVoiceState(id);
    if (id) localStorage.setItem('lisread.voice', id); else localStorage.removeItem('lisread.voice');
    voiceRef.current = id;
    // 選んだ時点で準備を始める（再生ボタンを押してから待たされないようにする）
    void ensurePrepared(id).then((ok) => { if (ok) warmUp(WARMUP_AHEAD); });
  }, []);

  useEffect(() => () => { runId.current++; depsRef.current.speech.cancel(); }, []);

  return { status, sid, rate, voiceId, voices, unavailable, preparing, play, pause, toggle, next, prev, stop, setRate, setVoice };
}
