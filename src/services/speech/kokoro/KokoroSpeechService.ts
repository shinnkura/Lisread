// Kokoro（ブラウザ内ニューラル TTS）を SpeechService として使えるようにする実装。
// 標準の Web Speech と違い、モデル（約 92MB）の取得が要る。初回だけ取得し、以後は端末に保存したものを使う。
import type { SpeakOptions, SpeakResult, SpeechService, Voice } from '../SpeechService';
import { KOKORO_SAMPLE_RATE } from './KokoroEngine';
import { createBackend, type KokoroBackend } from './KokoroBackend';

export const KOKORO_PREFIX = 'kokoro:';

export function isKokoroVoice(voiceId: string | null | undefined): boolean {
  return !!voiceId && voiceId.startsWith(KOKORO_PREFIX);
}
export function kokoroVoiceName(voiceId: string): string {
  return voiceId.slice(KOKORO_PREFIX.length);
}

/** 同梱する声の一覧。先頭が en-US、後半が en-GB */
export const KOKORO_VOICES: Voice[] = [
  { id: `${KOKORO_PREFIX}af_heart`, name: 'Heart（女性）', lang: 'en-US', engine: 'kokoro' },
  { id: `${KOKORO_PREFIX}af_bella`, name: 'Bella（女性）', lang: 'en-US', engine: 'kokoro' },
  { id: `${KOKORO_PREFIX}af_nicole`, name: 'Nicole（女性・ささやき寄り）', lang: 'en-US', engine: 'kokoro' },
  { id: `${KOKORO_PREFIX}am_michael`, name: 'Michael（男性）', lang: 'en-US', engine: 'kokoro' },
  { id: `${KOKORO_PREFIX}am_fenrir`, name: 'Fenrir（男性）', lang: 'en-US', engine: 'kokoro' },
  { id: `${KOKORO_PREFIX}bf_emma`, name: 'Emma（女性・英）', lang: 'en-GB', engine: 'kokoro' },
  { id: `${KOKORO_PREFIX}bm_george`, name: 'George（男性・英）', lang: 'en-GB', engine: 'kokoro' },
];

/** 生成済み音声の再生先。テストでは差し替える */
export interface AudioSink {
  /** 再生を始め、完了する Promise と中断手段を返す */
  play(pcm: Float32Array, sampleRate: number): Promise<{ done: Promise<void>; stop(): void }> | { done: Promise<void>; stop(): void };
  /** ユーザー操作の中で呼び、音声出力を使えるようにする（iOS 対策） */
  unlock(): void;
}

/** iOS の消音スイッチが入っていても鳴るようにする（Safari 16.4 以降） */
function usePlaybackAudioSession(): void {
  const session = (navigator as { audioSession?: { type: string } }).audioSession;
  if (session) {
    try { session.type = 'playback'; } catch { /* 未対応なら諦める */ }
  }
}

export class WebAudioSink implements AudioSink {
  private ctx: AudioContext | null = null;
  private ensure(): AudioContext {
    if (!this.ctx) {
      usePlaybackAudioSession();
      const Ctor = AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!;
      this.ctx = new Ctor();
      // iOS では無音を 1 回鳴らしておかないと、以後の再生が許可されないことがある
      const silent = this.ctx.createBufferSource();
      silent.buffer = this.ctx.createBuffer(1, 1, 22050);
      silent.connect(this.ctx.destination);
      silent.start();
    }
    return this.ctx;
  }
  unlock() {
    try { void this.ensure().resume(); } catch { /* 未対応環境では何もしない */ }
  }
  /** 音声出力が使える状態か。ユーザー操作の外で作られた場合は suspended のまま */
  state(): string {
    return this.ctx?.state ?? 'none';
  }
  async play(pcm: Float32Array, sampleRate: number) {
    const ctx = this.ensure();
    usePlaybackAudioSession();
    try { await ctx.resume(); } catch { /* 失敗しても下で状態を見る */ }
    if (ctx.state !== 'running') {
      throw new Error('音声の出力が許可されていません。再生ボタンをもう一度押すか、本体の消音スイッチを確認してください');
    }
    const buf = ctx.createBuffer(1, pcm.length, sampleRate);
    buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    let stopped = false;
    const done = new Promise<void>((resolve) => {
      src.onended = () => resolve();
    });
    src.start();
    return { done, stop: () => { if (stopped) return; stopped = true; try { src.stop(); } catch { /* 既に終了している */ } } };
  }
}

interface Deps {
  backend?: KokoroBackend;
  sink?: AudioSink;
  /** 生成済み音声を保持する上限（文の数） */
  cacheSize?: number;
}

const CACHE_LIMIT_DEFAULT = 24;

export class KokoroSpeechService implements SpeechService {
  private loaded = false;
  private loading: Promise<void> | null = null;
  private cache = new Map<string, Float32Array>();
  private inflight = new Map<string, Promise<Float32Array>>();
  private pending: { text: string; opts: SpeakOptions }[] = [];
  private current: { stop(): void } | null = null;
  private generation = 0;
  private sink: AudioSink;
  private cacheLimit: number;
  private backend: KokoroBackend;

  constructor(deps: Deps = {}) {
    this.sink = deps.sink ?? new WebAudioSink();
    this.cacheLimit = deps.cacheSize ?? CACHE_LIMIT_DEFAULT;
    this.backend = deps.backend ?? createBackend();
  }

  isSupported(): boolean {
    return typeof AudioContext !== 'undefined' || typeof (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext !== 'undefined';
  }

  /** 再生ボタンを押した瞬間（ユーザー操作の中）に呼ぶ。iOS はこの時点でしか音声出力を許可しない */
  unlock(): void {
    this.sink.unlock();
  }

  async getVoices(): Promise<Voice[]> {
    return KOKORO_VOICES;
  }

  isPrepared(voiceId: string | null): boolean {
    return !isKokoroVoice(voiceId) || this.loaded;
  }

  async prepare(voiceId: string | null, onProgress?: (message: string) => void): Promise<void> {
    if (!isKokoroVoice(voiceId)) return;
    await this.ensureLoaded(onProgress);
  }

  private ensureLoaded(onProgress?: (message: string) => void): Promise<void> {
    if (this.loaded) return Promise.resolve();
    this.loading ??= this.backend.load((m) => onProgress?.(m))
      .then(() => { this.loaded = true; this.loading = null; })
      .catch((e) => { this.loading = null; throw e; });
    return this.loading;
  }

  private key(text: string, opts: SpeakOptions): string {
    return `${opts.voiceId}|${opts.rate}|${text}`;
  }

  private remember(key: string, pcm: Float32Array) {
    this.cache.set(key, pcm);
    while (this.cache.size > this.cacheLimit) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  /** 文を音声にする。同じ文が生成済み・生成中ならそれを使い回す */
  private generate(text: string, opts: SpeakOptions): Promise<Float32Array> {
    const key = this.key(text, opts);
    const hit = this.cache.get(key);
    if (hit) return Promise.resolve(hit);
    const running = this.inflight.get(key);
    if (running) return running;
    const task = (async () => {
      await this.ensureLoaded();
      const name = kokoroVoiceName(opts.voiceId ?? `${KOKORO_PREFIX}af_heart`);
      const pcm = await this.backend.synthesize(text, name, opts.rate);
      this.remember(key, pcm);
      return pcm;
    })().finally(() => { this.inflight.delete(key); });
    this.inflight.set(key, task);
    return task;
  }

  prefetch(text: string, opts: SpeakOptions): void {
    // ここでは予約するだけ。今の文の再生が始まってから生成を始める
    // （今の文の生成と取り合うと、待たされている今の文がさらに遅くなるため）
    if (!isKokoroVoice(opts.voiceId)) return;
    if (this.pending.some((p) => p.text === text && p.opts.voiceId === opts.voiceId && p.opts.rate === opts.rate)) return;
    this.pending.push({ text, opts });
    // 何も生成していない（＝再生前や停止中）なら、待たずに作り始める。
    // 再生ボタンを押した瞬間から鳴るまでの待ち時間を減らすため
    if (this.inflight.size === 0) this.startPending();
  }

  private startPending(): void {
    const list = this.pending;
    this.pending = [];
    for (const p of list) void this.generate(p.text, p.opts).catch(() => { /* 先読みの失敗は無視する */ });
  }

  async speak(text: string, opts: SpeakOptions): Promise<SpeakResult> {
    // 音声出力の解禁はユーザー操作と同じ tick で行う必要があるため、await より前に呼ぶ
    this.sink.unlock();
    const my = ++this.generation;
    let pcm: Float32Array;
    try {
      pcm = await this.generate(text, opts);
    } catch (e) {
      if (my !== this.generation) return 'cancelled'; // 中断によるエラーは黙って終わる
      throw new Error(`音声を作れませんでした: ${(e as Error).message ?? String(e)}`);
    }
    if (my !== this.generation) return 'cancelled';
    let handle: { done: Promise<void>; stop(): void };
    try {
      handle = await this.sink.play(pcm, KOKORO_SAMPLE_RATE);
    } catch (e) {
      if (my !== this.generation) return 'cancelled';
      throw e;
    }
    if (my !== this.generation) { handle.stop(); return 'cancelled'; }
    opts.onStart?.();
    this.current = handle;
    this.startPending();
    await handle.done;
    if (my !== this.generation) return 'cancelled';
    this.current = null;
    return 'ended';
  }

  cancel(): void {
    this.generation++;
    this.pending = [];
    this.current?.stop();
    this.current = null;
  }
}
