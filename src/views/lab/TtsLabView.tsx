import { useEffect, useRef, useState } from 'react';
import { navigate } from '../../app/router';
import { loadKokoro, type LoadedKokoro, type KokoroModelFile } from '../../services/speech/kokoro/KokoroBrowser';
import { textToPhonemes, type KokoroLang } from '../../services/speech/kokoro/phonemes';
import { KOKORO_SAMPLE_RATE } from '../../services/speech/kokoro/KokoroEngine';
import './lab.css';

// 試作（spike）: ブラウザ内ニューラル TTS（Kokoro）が iPhone で実用になるかを測る検証ページ。
// 本実装ではない。速度と声の確認が済んだら正式な SpeechService に置き換える。

const VOICES = ['af_heart', 'af_bella', 'af_nicole', 'af_sarah', 'am_adam', 'am_michael', 'bf_emma', 'bm_george'] as const;
// Node での比較: uint8 は q8 と同速で 2 倍のサイズ、q8f16 / fp16 は CPU（wasm）で動かないため q8 のみ
const MODELS: { id: KokoroModelFile; label: string }[] = [{ id: 'model_quantized', label: 'q8（約 92MB）' }];
const DEFAULT_TEXT = 'Hello, how are you today?';

export function TtsLabView() {
  const [modelFile, setModelFile] = useState<KokoroModelFile>('model_quantized');
  const [voice, setVoice] = useState<string>('af_heart');
  const [text, setText] = useState(DEFAULT_TEXT);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [sysVoices, setSysVoices] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const kokoro = useRef<LoadedKokoro | null>(null);
  const ctx = useRef<AudioContext | null>(null);

  const add = (s: string) => setLog((l) => [...l, `${new Date().toLocaleTimeString()} ${s}`]);

  useEffect(() => {
    if (!busy) { setElapsed(0); return; }
    const start = performance.now();
    const id = setInterval(() => setElapsed(Math.floor((performance.now() - start) / 1000)), 500);
    return () => clearInterval(id);
  }, [busy]);

  // 診断用: Safari が公開している標準音声を絞り込みなしで列挙する（Premium が見えるかの確認）
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;
    const list = () => setSysVoices(speechSynthesis.getVoices().map((v) => `${v.name} | ${v.lang} | ${v.voiceURI}`));
    list();
    speechSynthesis.addEventListener('voiceschanged', list);
    return () => speechSynthesis.removeEventListener('voiceschanged', list);
  }, []);

  const unlockAudio = () => {
    if (!ctx.current) ctx.current = new AudioContext();
    void ctx.current.resume();
  };

  const loadModel = async () => {
    unlockAudio();
    setBusy(true);
    const t0 = performance.now();
    try {
      add(`モデル読み込み開始 ${modelFile}（先にランタイム起動 → モデル取得の順）`);
      kokoro.current = await loadKokoro({
        modelFile,
        onStage: (st) => add(`  ${st}`),
        onProgress: (p) => setProgress(p.total ? `${p.file} ${Math.round((p.loaded / p.total) * 100)}%` : `${p.file} ${Math.round(p.loaded / 1024 / 1024)}MB`),
      });
      add(`モデル読み込み完了 ${((performance.now() - t0) / 1000).toFixed(1)} 秒`);
    } catch (e) {
      add(`読み込み失敗: ${(e as Error).message ?? String(e)}`);
      kokoro.current = null;
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  const generate = async () => {
    unlockAudio();
    const k = kokoro.current;
    if (!k) { add('先にモデルを読み込んでください'); return; }
    setBusy(true);
    try {
      const lang: KokoroLang = voice.startsWith('b') ? 'b' : 'a';
      const t0 = performance.now();
      add('音素化開始');
      const ps = await textToPhonemes(text, lang, k.phonemize);
      add(`音素化 ${((performance.now() - t0) / 1000).toFixed(2)} 秒: ${ps}`);
      const v = await k.getVoice(voice);
      add(`音声データ取得済み。推論開始（トークン ${k.engine.tokenize(ps).length}）`);
      const t1 = performance.now();
      const pcm = await k.engine.synthesize(ps, v, 1);
      const genSec = (performance.now() - t1) / 1000;
      const audioSec = pcm.length / KOKORO_SAMPLE_RATE;
      add(`生成 ${genSec.toFixed(2)} 秒 / 音声 ${audioSec.toFixed(2)} 秒 / 実時間比 ${(genSec / audioSec).toFixed(2)}x（1 未満なら先読みで途切れなく再生できる）`);
      const c = ctx.current!;
      const buf = c.createBuffer(1, pcm.length, KOKORO_SAMPLE_RATE);
      buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(c.destination);
      src.start();
    } catch (e) {
      add(`生成失敗: ${(e as Error).message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen lab">
      <header className="topbar">
        <button className="icon-btn" aria-label="本棚へ戻る" onClick={() => navigate({ name: 'library' })}>‹</button>
        <h1>読み上げ検証（試作）</h1>
        <span className="icon-btn" />
      </header>
      <div className="lab-body">
        <p className="muted">ブラウザ内で動くニューラル音声 Kokoro を試します。初回はモデル（約 90MB）を取得して端末に保存します。Wi-Fi 推奨。</p>
        <p className="muted">端末: {typeof navigator !== 'undefined' ? navigator.userAgent : ''}</p>
        <label className="lab-block">モデル <select value={modelFile} onChange={(e) => setModelFile(e.target.value as KokoroModelFile)} disabled={busy}>
          {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select></label>
        <button className="btn btn-primary" onClick={() => void loadModel()} disabled={busy}>1. モデルを読み込む</button>
        {busy && <p className="muted lab-progress">処理中… {elapsed} 秒経過{progress ? ` / ${progress}` : ''}</p>}
        <label className="lab-block">声 <select value={voice} onChange={(e) => setVoice(e.target.value)} disabled={busy}>
          {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select></label>
        <textarea className="lab-text" value={text} onChange={(e) => setText(e.target.value)} rows={4} />
        <button className="btn btn-primary" onClick={() => void generate()} disabled={busy}>2. 生成して再生</button>
        <h2>ログ</h2>
        <pre className="lab-log" data-testid="lab-log">{log.join('\n') || '（まだありません）'}</pre>
        <h2>この端末の標準音声（Safari が公開しているもの）</h2>
        <pre className="lab-log">{sysVoices.join('\n') || '（取得できませんでした）'}</pre>
      </div>
    </div>
  );
}
