// ブラウザ向けの Kokoro 読み込み処理。モデル・音声データは Hugging Face から取得して Cache API に保存し、
// 2 回目以降はオフラインでも使えるようにする。ONNX Runtime は wasm 専用ビルドを 1 スレッドで初期化する。
import { KokoroEngine, vocabFromTokenizerJson, type OrtLike } from './KokoroEngine';
import type { Phonemizer } from './phonemes';

export const KOKORO_HF_BASE = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main';
export const ORT_WASM_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/dist/';
const CACHE_NAME = 'lisread-kokoro-v1';

export type KokoroModelFile = 'model_quantized' | 'model_uint8' | 'model_q8f16' | 'model_fp16';
export interface KokoroProgress { file: string; loaded: number; total: number }
export interface LoadedKokoro {
  engine: KokoroEngine;
  phonemize: Phonemizer;
  getVoice(name: string): Promise<Float32Array>;
}

async function openCache(): Promise<Cache | null> {
  try { return typeof caches !== 'undefined' ? await caches.open(CACHE_NAME) : null; } catch { return null; }
}

/** Cache API を介した取得。進捗はストリームで読みながら報告する */
export async function fetchCached(url: string, onProgress?: (p: KokoroProgress) => void, fetchFn: typeof fetch = fetch.bind(globalThis)): Promise<ArrayBuffer> {
  const file = url.split('/').pop() ?? url;
  const cache = await openCache();
  const hit = await cache?.match(url);
  if (hit) { const buf = await hit.arrayBuffer(); onProgress?.({ file, loaded: buf.byteLength, total: buf.byteLength }); return buf; }
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`${file} の取得に失敗しました (${res.status})`);
  const total = Number(res.headers.get('content-length') ?? 0);
  if (!res.body) { const buf = await res.arrayBuffer(); await cache?.put(url, new Response(buf)); return buf; }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); loaded += value.byteLength;
    onProgress?.({ file, loaded, total });
  }
  const out = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  try { await cache?.put(url, new Response(out.slice().buffer)); } catch { /* 容量不足などは無視（次回また取得する） */ }
  return out.buffer;
}

let ortPromise: Promise<OrtLike> | null = null;

/**
 * ONNX Runtime（wasm 専用ビルド）を初期化する。iPhone Safari では、モデルなど大きなデータを
 * メモリに載せた後だと wasm のコンパイルが "Out of memory" で失敗するため、
 * 他の何よりも先に、ダミーのセッション作成でランタイムを実際に起動しておく。
 */
export function initOrtWasm(): Promise<OrtLike> {
  ortPromise ??= (async () => {
    const ort = await import('onnxruntime-web/wasm');
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = ORT_WASM_CDN;
    try {
      await ort.InferenceSession.create(new Uint8Array([0, 1, 2, 3]), { executionProviders: ['wasm'] });
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      // モデル解析エラーは想定どおり（ランタイムは起動済み）。それ以外は起動失敗として投げ直す
      if (/no available backend|Out of memory/i.test(msg)) { ortPromise = null; throw e; }
    }
    return ort as unknown as OrtLike;
  })();
  return ortPromise;
}

export async function loadKokoro(opts: { modelFile?: KokoroModelFile; onProgress?: (p: KokoroProgress) => void; onStage?: (stage: string) => void; hfBase?: string } = {}): Promise<LoadedKokoro> {
  const base = opts.hfBase ?? KOKORO_HF_BASE;
  const modelFile = opts.modelFile ?? 'model_quantized';
  const stage = (name: string, t0: number) => opts.onStage?.(`${name} ${((performance.now() - t0) / 1000).toFixed(1)} 秒`);
  // 順番が重要: ランタイム起動 → 音素化ライブラリ → モデル。同時に走らせるとメモリのピークが上がり iPhone で失敗する
  let t = performance.now();
  const ort = await initOrtWasm();
  stage('ランタイム起動', t);
  t = performance.now();
  const { phonemize } = await import('phonemizer');
  // espeak-ng の初期化をここで済ませる。iPhone Safari で固まる事例があるため 20 秒で打ち切り、読み込み自体は続行する
  const warm = await Promise.race([phonemize('hello', 'en-us').then(() => 'ok'), new Promise<string>((r) => setTimeout(() => r('timeout'), 20000))]);
  stage(warm === 'ok' ? '音素化ライブラリ準備' : '音素化ライブラリ準備（20 秒で応答なし。音素化は使えない可能性）', t);
  t = performance.now();
  const vocab = vocabFromTokenizerJson(JSON.parse(new TextDecoder().decode(await fetchCached(`${base}/tokenizer.json`, opts.onProgress))));
  let modelBuf: ArrayBuffer | null = await fetchCached(`${base}/onnx/${modelFile}.onnx`, opts.onProgress);
  stage('モデル取得', t);
  t = performance.now();
  const engine = await KokoroEngine.create(ort, new Uint8Array(modelBuf), vocab);
  modelBuf = null; // セッション作成後は JS 側のコピーを手放してメモリを戻す
  stage('セッション作成', t);
  const voices = new Map<string, Float32Array>();
  return {
    engine,
    phonemize: (text, language) => phonemize(text, language),
    async getVoice(name) {
      let v = voices.get(name);
      if (!v) { v = new Float32Array(await fetchCached(`${base}/voices/${name}.bin`, opts.onProgress)); voices.set(name, v); }
      return v;
    },
  };
}
