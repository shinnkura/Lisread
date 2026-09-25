import { useEffect, useRef, useState } from 'react';
import { navigate } from '../../app/router';
import './lab.css';

// 試作（spike）: ブラウザ内ニューラル TTS（Kokoro）が iPhone で実用になるかを測る検証ページ。
// 本実装ではない。速度と声の確認が済んだら削除するか、正式な SpeechService に置き換える。

type Dtype = 'q8' | 'fp32' | 'q4';
type Device = 'wasm' | 'webgpu';
const VOICES = ['af_heart', 'af_bella', 'af_nicole', 'af_sarah', 'am_adam', 'am_michael', 'bf_emma', 'bm_george'] as const;
const DEFAULT_TEXT = 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.';

/** WebAssembly.Memory をどこまで確保できるかを二分探索で調べる（iOS の上限を知るための診断） */
function probeWasmMemory(): string {
  const tryAlloc = (pages: number) => { try { new WebAssembly.Memory({ initial: 1, maximum: pages }); return true; } catch { return false; } };
  const tryInitial = (pages: number) => { try { new WebAssembly.Memory({ initial: pages }); return true; } catch { return false; } };
  let lo = 1, hi = 65536;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (tryAlloc(mid)) lo = mid; else hi = mid - 1; }
  let ilo = 1, ihi = 32768;
  while (ilo < ihi) { const mid = Math.ceil((ilo + ihi) / 2); if (tryInitial(mid)) ilo = mid; else ihi = mid - 1; }
  return `maximum ${Math.round(lo / 16)}MB まで / initial 実確保 ${Math.round(ilo / 16)}MB まで`;
}

interface Kokoro { generate(text: string, opts: { voice: string; speed: number }): Promise<{ audio: Float32Array; sampling_rate: number }> }

export function TtsLabView() {
  const [dtype, setDtype] = useState<Dtype>('q8');
  const [device, setDevice] = useState<Device>('wasm');
  const [voice, setVoice] = useState<string>('af_heart');
  const [text, setText] = useState(DEFAULT_TEXT);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [sysVoices, setSysVoices] = useState<string[]>([]);
  const tts = useRef<Kokoro | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;

  const add = (s: string) => setLog((l) => [...l, `${new Date().toLocaleTimeString()} ${s}`]);

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
      add(`モデル読み込み開始 dtype=${dtype} device=${device}`);
      const { KokoroTTS } = await import('kokoro-js');
      const { env } = await import('@huggingface/transformers');
      // iOS Safari 対策: SharedArrayBuffer が使えないため 1 スレッド・プロキシ無しで初期化する
      const wasm = env.backends.onnx.wasm as { numThreads?: number; proxy?: boolean } | undefined;
      if (wasm) { wasm.numThreads = 1; wasm.proxy = false; }
      add(`wasm 設定: threads=1 proxy=false / メモリ上限プローブ: ${probeWasmMemory()}`);
      const model = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        dtype, device,
        progress_callback: (p: { status: string; file?: string; progress?: number }) => {
          if (p.status === 'progress' && p.file) setProgress(`${p.file} ${Math.round(p.progress ?? 0)}%`);
          if (p.status === 'done' && p.file) setProgress(`${p.file} 完了`);
        },
      });
      tts.current = model as unknown as Kokoro;
      add(`モデル読み込み完了 ${((performance.now() - t0) / 1000).toFixed(1)} 秒`);
    } catch (e) {
      add(`読み込み失敗: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  const generate = async () => {
    unlockAudio();
    if (!tts.current) { add('先にモデルを読み込んでください'); return; }
    setBusy(true);
    const t0 = performance.now();
    try {
      const out = await tts.current.generate(text, { voice, speed: 1 });
      const genSec = (performance.now() - t0) / 1000;
      const audioSec = out.audio.length / out.sampling_rate;
      add(`生成 ${genSec.toFixed(2)} 秒 / 音声 ${audioSec.toFixed(2)} 秒 / 実時間比 ${(genSec / audioSec).toFixed(2)}x（1 未満なら先読みで途切れなく再生できる）`);
      const c = ctx.current!;
      const buf = c.createBuffer(1, out.audio.length, out.sampling_rate);
      buf.copyToChannel(out.audio as Float32Array<ArrayBuffer>, 0);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(c.destination);
      src.start();
    } catch (e) {
      add(`生成失敗: ${(e as Error).message}`);
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
        <p className="muted">ブラウザ内で動くニューラル音声 Kokoro を試します。初回はモデル（q8 で約 90MB）を取得します。Wi-Fi 推奨。</p>
        <p className="muted">端末: {typeof navigator !== 'undefined' ? navigator.userAgent : ''} / WebGPU: {hasWebGPU ? 'あり' : 'なし'}</p>
        <div className="lab-row">
          <label>精度 <select value={dtype} onChange={(e) => setDtype(e.target.value as Dtype)} disabled={busy}>
            <option value="q8">q8（軽い・推奨）</option><option value="q4">q4（最軽量）</option><option value="fp32">fp32（重い・高品質）</option>
          </select></label>
          <label>実行 <select value={device} onChange={(e) => setDevice(e.target.value as Device)} disabled={busy}>
            <option value="wasm">CPU (wasm)</option>{hasWebGPU && <option value="webgpu">GPU (WebGPU)</option>}
          </select></label>
        </div>
        <button className="btn btn-primary" onClick={() => void loadModel()} disabled={busy}>1. モデルを読み込む</button>
        {progress && <p className="muted lab-progress">{progress}</p>}
        <label className="lab-block">声 <select value={voice} onChange={(e) => setVoice(e.target.value)} disabled={busy}>
          {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select></label>
        <textarea className="lab-text" value={text} onChange={(e) => setText(e.target.value)} rows={4} />
        <button className="btn btn-primary" onClick={() => void generate()} disabled={busy}>2. 生成して再生</button>
        <h2>ログ</h2>
        <pre className="lab-log">{log.join('\n') || '（まだありません）'}</pre>
        <h2>この端末の標準音声（Safari が公開しているもの）</h2>
        <pre className="lab-log">{sysVoices.join('\n') || '（取得できませんでした）'}</pre>
      </div>
    </div>
  );
}
