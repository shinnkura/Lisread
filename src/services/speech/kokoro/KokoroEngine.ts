// Kokoro-82M（ONNX）を onnxruntime-web の wasm 専用ビルドで直接動かす最小エンジン。
// transformers.js を経由しない理由: その同梱ランタイム（GPU 対応版 wasm 21MB）は iPhone Safari で
// コンパイルできず "Out of memory" になるため。ここでは 11MB の wasm 専用ビルドだけを使う。

export interface OrtLike {
  InferenceSession: { create(model: Uint8Array, opts?: unknown): Promise<OrtSession> };
  Tensor: new (type: string, data: BigInt64Array | Float32Array, dims: number[]) => unknown;
}
export interface OrtSession {
  inputNames: readonly string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>>;
  release?(): Promise<void>;
}

export const KOKORO_SAMPLE_RATE = 24000;
const MAX_PHONEME_TOKENS = 510; // モデルの上限（先頭・末尾のパディングを除く）
const STYLE_DIM = 256;

export class KokoroEngine {
  private constructor(private ort: OrtLike, private session: OrtSession, private vocab: Record<string, number>) {}

  static async create(ort: OrtLike, modelBytes: Uint8Array, vocab: Record<string, number>): Promise<KokoroEngine> {
    const session = await ort.InferenceSession.create(modelBytes, { executionProviders: ['wasm'] });
    return new KokoroEngine(ort, session, vocab);
  }

  /** 音素文字列 → トークン id（未知の文字は捨てる）。先頭と末尾に 0（$）を付ける */
  tokenize(phonemes: string): number[] {
    const ids: number[] = [];
    for (const ch of phonemes) {
      const id = this.vocab[ch];
      if (id !== undefined) ids.push(id);
      if (ids.length >= MAX_PHONEME_TOKENS) break;
    }
    return [0, ...ids, 0];
  }

  /** 1 文を合成して 24kHz の PCM（Float32）を返す。voice は 510×256 の float32（Hugging Face の voices/*.bin） */
  async synthesize(phonemes: string, voice: Float32Array, speed = 1): Promise<Float32Array> {
    const ids = this.tokenize(phonemes);
    const n = Math.min(Math.max(ids.length - 2, 0), MAX_PHONEME_TOKENS - 1);
    const style = voice.slice(n * STYLE_DIM, n * STYLE_DIM + STYLE_DIM);
    const feeds = {
      input_ids: new this.ort.Tensor('int64', BigInt64Array.from(ids.map((x) => BigInt(x))), [1, ids.length]),
      style: new this.ort.Tensor('float32', style, [1, STYLE_DIM]),
      speed: new this.ort.Tensor('float32', new Float32Array([speed]), [1]),
    };
    const out = await this.session.run(feeds);
    const wave = out.waveform ?? out[Object.keys(out)[0]];
    return wave.data;
  }

  async release() { await this.session.release?.(); }
}

export function vocabFromTokenizerJson(json: { model: { vocab: Record<string, number> } }): Record<string, number> {
  return json.model.vocab;
}
