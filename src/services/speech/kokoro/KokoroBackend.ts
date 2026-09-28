// Kokoro の実行場所を抽象化する。推論は数秒かかるので、既定では Web Worker 側で動かして
// 画面が固まらないようにし、Worker が使えない環境ではページ内で動かす。
import { loadKokoro, type KokoroModelFile } from './KokoroBrowser';

export interface KokoroBackend {
  /** モデルと辞書を読み込む。進捗は日本語の短い文字列で通知する */
  load(onStage: (message: string) => void): Promise<void>;
  /** 1 文を 24kHz の PCM にする */
  synthesize(text: string, voiceName: string, rate: number): Promise<Float32Array>;
  /** 使い終わったら破棄する */
  dispose(): void;
}

export interface BackendOptions {
  modelFile?: KokoroModelFile;
}

/** ページ内（メインスレッド）で動かす実装。生成中は画面が固まる */
export class InPageBackend implements KokoroBackend {
  private k: Awaited<ReturnType<typeof loadKokoro>> | null = null;
  constructor(private opts: BackendOptions = {}) {}

  async load(onStage: (message: string) => void): Promise<void> {
    this.k = await loadKokoro({
      modelFile: this.opts.modelFile,
      onStage,
      onProgress: (p) => onStage(progressLabel(p.file, p.loaded, p.total)),
    });
  }

  async synthesize(text: string, voiceName: string, rate: number): Promise<Float32Array> {
    if (!this.k) throw new Error('音声モデルが読み込まれていません');
    const lang = voiceName.startsWith('b') ? 'b' : 'a';
    const [phonemes, voice] = await Promise.all([this.k.toPhonemes(text, lang), this.k.getVoice(voiceName)]);
    return this.k.engine.synthesize(phonemes, voice, rate);
  }

  dispose(): void {
    this.k = null;
  }
}

type WorkerOut =
  | { type: 'stage'; message: string }
  | { type: 'loaded' }
  | { type: 'synth'; id: number; pcm: Float32Array }
  | { type: 'error'; id: number | null; message: string };

/** Web Worker 側で動かす実装。生成中もページの操作が止まらない */
export class WorkerBackend implements KokoroBackend {
  private worker: Worker | null = null;
  private nextId = 1;
  private waiting = new Map<number, { resolve(pcm: Float32Array): void; reject(e: Error): void }>();
  private loadHandlers: { resolve(): void; reject(e: Error): void; onStage(m: string): void } | null = null;

  constructor(private opts: BackendOptions = {}) {}

  static isAvailable(): boolean {
    return typeof Worker !== 'undefined';
  }

  load(onStage: (message: string) => void): Promise<void> {
    this.worker = new Worker(new URL('./kokoro.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerOut>) => this.handle(e.data);
    this.worker.onerror = (e) => {
      const err = new Error(`読み上げ用の処理を起動できませんでした: ${e.message || '原因不明'}`);
      this.loadHandlers?.reject(err);
      this.loadHandlers = null;
      for (const w of this.waiting.values()) w.reject(err);
      this.waiting.clear();
    };
    return new Promise<void>((resolve, reject) => {
      this.loadHandlers = { resolve, reject, onStage };
      this.worker!.postMessage({ type: 'load', modelFile: this.opts.modelFile });
    });
  }

  private handle(msg: WorkerOut) {
    if (msg.type === 'stage') { this.loadHandlers?.onStage(msg.message); return; }
    if (msg.type === 'loaded') { this.loadHandlers?.resolve(); this.loadHandlers = null; return; }
    if (msg.type === 'synth') { this.waiting.get(msg.id)?.resolve(msg.pcm); this.waiting.delete(msg.id); return; }
    const err = new Error(msg.message);
    if (msg.id === null) { this.loadHandlers?.reject(err); this.loadHandlers = null; return; }
    this.waiting.get(msg.id)?.reject(err);
    this.waiting.delete(msg.id);
  }

  synthesize(text: string, voiceName: string, rate: number): Promise<Float32Array> {
    const worker = this.worker;
    if (!worker) return Promise.reject(new Error('音声モデルが読み込まれていません'));
    const id = this.nextId++;
    return new Promise<Float32Array>((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      worker.postMessage({ type: 'synth', id, text, voice: voiceName, rate });
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.waiting.clear();
  }
}

export function createBackend(opts: BackendOptions = {}): KokoroBackend {
  return WorkerBackend.isAvailable() ? new WorkerBackend(opts) : new InPageBackend(opts);
}

export function progressLabel(file: string, loaded: number, total: number): string {
  const name = file.endsWith('.onnx') ? '音声モデル'
    : file.includes('gold') || file.includes('silver') ? '発音辞書'
    : file.endsWith('.bin') ? '声のデータ'
    : file;
  return total > 0 ? `${name} ${Math.round((loaded / total) * 100)}%` : `${name} ${Math.round(loaded / 1024 / 1024)}MB`;
}
