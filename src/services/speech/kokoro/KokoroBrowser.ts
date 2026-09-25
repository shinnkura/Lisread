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

export async function initOrtWasm(): Promise<OrtLike> {
  const ort = await import('onnxruntime-web/wasm');
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = ORT_WASM_CDN;
  return ort as unknown as OrtLike;
}

export async function loadKokoro(opts: { modelFile?: KokoroModelFile; onProgress?: (p: KokoroProgress) => void; hfBase?: string } = {}): Promise<LoadedKokoro> {
  const base = opts.hfBase ?? KOKORO_HF_BASE;
  const modelFile = opts.modelFile ?? 'model_quantized';
  const [ort, { phonemize }, modelBuf, tokenizerBuf] = await Promise.all([
    initOrtWasm(),
    import('phonemizer'),
    fetchCached(`${base}/onnx/${modelFile}.onnx`, opts.onProgress),
    fetchCached(`${base}/tokenizer.json`, opts.onProgress),
  ]);
  const vocab = vocabFromTokenizerJson(JSON.parse(new TextDecoder().decode(tokenizerBuf)));
  const engine = await KokoroEngine.create(ort, new Uint8Array(modelBuf), vocab);
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
