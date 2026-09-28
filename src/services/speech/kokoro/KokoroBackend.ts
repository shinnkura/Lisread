// Kokoro の実行場所を抽象化する。推論は数秒かかるので、既定では Web Worker 側で動かして
// 画面が固まらないようにし、Worker が使えない環境ではページ内で動かす。
import { initOrtWasm, loadKokoro, type KokoroModelFile } from './KokoroBrowser';

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

/** 1 文の生成を待つ上限。これを超えたら Worker が落ちたとみなす */
const SYNTH_TIMEOUT_MS = 90000;
/** 読み込みを待つ上限（通信が遅い場合もあるので長めに取る） */
const LOAD_TIMEOUT_MS = 600000;

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

  async load(onStage: (message: string) => void): Promise<void> {
    // iPhone Safari は Worker の中だけで wasm を用意しようとすると Out of memory で失敗する。
    // 先にページ側で用意しておくと、Worker 側はブラウザが持っている結果を使えるため成功する
    try {
      await initOrtWasm();
    } catch {
      // ここで失敗しても Worker 側で改めて試す
    }
    return this.startWorker(onStage);
  }

  private startWorker(onStage: (message: string) => void): Promise<void> {
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
      const timer = setTimeout(() => {
        if (!this.loadHandlers) return;
        this.loadHandlers = null;
        reject(new Error('音声モデルの読み込みが終わりませんでした（通信または端末のメモリ不足の可能性があります）'));
      }, LOAD_TIMEOUT_MS);
      this.loadHandlers = {
        resolve: () => { clearTimeout(timer); resolve(); },
        reject: (e) => { clearTimeout(timer); reject(e); },
        onStage,
      };
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
      // Worker がメモリ不足などで無言で落ちると応答が来なくなるため、待ち続けずに理由を返す
      const timer = setTimeout(() => {
        if (!this.waiting.has(id)) return;
        this.waiting.delete(id);
        reject(new Error('音声の生成が返ってきませんでした（端末のメモリ不足の可能性があります）'));
      }, SYNTH_TIMEOUT_MS);
      this.waiting.set(id, {
        resolve: (pcm) => { clearTimeout(timer); resolve(pcm); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      worker.postMessage({ type: 'synth', id, text, voice: voiceName, rate });
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.waiting.clear();
  }
}

/**
 * Worker を複数立てて、別々の文を並行して生成する。生成は 1 文あたり実時間より遅いので、
 * 並行数を増やすことで「読み上げが追いつかない」状態を解消する。
 * 共有メモリ（SharedArrayBuffer）は使わないため、特別なサーバー設定は要らない。
 */
export class WorkerPool implements KokoroBackend {
  private workers: KokoroBackend[] = [];
  private busy: number[] = [];

  constructor(private size: number, private opts: BackendOptions = {}, private create: () => KokoroBackend = () => new WorkerBackend(opts)) {}

  async load(onStage: (message: string) => void): Promise<void> {
    // 1 つ目で取得した内容は Cache API に入るので、2 つ目以降の読み込みは速い
    for (let i = 0; i < this.size; i++) {
      const w = this.create();
      await w.load((m) => onStage(this.size > 1 && i > 0 ? `${m}（${i + 1}/${this.size}）` : m));
      this.workers.push(w);
      this.busy.push(0);
    }
  }

  synthesize(text: string, voiceName: string, rate: number): Promise<Float32Array> {
    if (this.workers.length === 0) return Promise.reject(new Error('音声モデルが読み込まれていません'));
    let idx = 0;
    for (let i = 1; i < this.busy.length; i++) if (this.busy[i] < this.busy[idx]) idx = i;
    this.busy[idx]++;
    return this.workers[idx].synthesize(text, voiceName, rate).finally(() => { this.busy[idx]--; });
  }

  dispose(): void {
    for (const w of this.workers) w.dispose();
    this.workers = [];
    this.busy = [];
  }
}

/** 端末の余力から並行生成数を決める。URL に ?tts_workers=N があればそれを使う（検証用） */
export function decideWorkerCount(): number {
  const forced = typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('tts_workers')) : NaN;
  if (Number.isFinite(forced) && forced >= 1 && forced <= 4) return Math.floor(forced);
  // Worker ごとにモデルを読むため、増やすとメモリ不足で落ちる端末がある。
  // 既定は 1 つに抑え、増やしたい場合だけ ?tts_workers=2 のように指定してもらう
  return 1;
}

/**
 * まず Worker で動かし、それが駄目ならページ内実行に切り替える。
 * ページ内だと生成中に画面が固まるが、まったく読み上げられないよりはよい。
 */
export class FallbackBackend implements KokoroBackend {
  private inner: KokoroBackend;
  private usedFallback = false;

  constructor(private opts: BackendOptions = {}, private primary: () => KokoroBackend, private secondary: () => KokoroBackend) {
    this.inner = primary();
  }

  async load(onStage: (message: string) => void): Promise<void> {
    try {
      await this.inner.load(onStage);
    } catch (e) {
      if (this.usedFallback) throw e;
      this.usedFallback = true;
      this.inner.dispose();
      onStage('別の方法で読み込み直します');
      this.inner = this.secondary();
      await this.inner.load(onStage);
    }
  }

  synthesize(text: string, voiceName: string, rate: number): Promise<Float32Array> {
    return this.inner.synthesize(text, voiceName, rate);
  }

  dispose(): void {
    this.inner.dispose();
  }
}

export function createBackend(opts: BackendOptions = {}): KokoroBackend {
  if (!WorkerBackend.isAvailable()) return new InPageBackend(opts);
  const n = decideWorkerCount();
  return new FallbackBackend(
    opts,
    () => (n > 1 ? new WorkerPool(n, opts) : new WorkerBackend(opts)),
    () => new InPageBackend(opts),
  );
}

export function progressLabel(file: string, loaded: number, total: number): string {
  const name = file.endsWith('.onnx') ? '音声モデル'
    : file.includes('gold') || file.includes('silver') ? '発音辞書'
    : file.endsWith('.bin') ? '声のデータ'
    : file;
  return total > 0 ? `${name} ${Math.round((loaded / total) * 100)}%` : `${name} ${Math.round(loaded / 1024 / 1024)}MB`;
}
