// 標準音声（Web Speech）と Kokoro（ブラウザ内ニューラル TTS）を 1 つの SpeechService として束ね、
// 選ばれた音声 ID によって振り分ける。
import type { SpeakOptions, SpeakResult, SpeechService, Voice } from './SpeechService';
import { isKokoroVoice } from './kokoro/KokoroSpeechService';

export class HybridSpeechService implements SpeechService {
  constructor(private web: SpeechService, private kokoro: SpeechService) {}

  private pick(voiceId: string | null): SpeechService {
    return isKokoroVoice(voiceId) ? this.kokoro : this.web;
  }

  isSupported(): boolean {
    return this.web.isSupported() || this.kokoro.isSupported();
  }

  async getVoices(): Promise<Voice[]> {
    const web = this.web.isSupported() ? await this.web.getVoices() : [];
    const kokoro = this.kokoro.isSupported() ? await this.kokoro.getVoices() : [];
    return [...web, ...kokoro];
  }

  unlock(): void {
    // どちらの音声が選ばれていても、操作の瞬間に解禁しておく
    this.web.unlock?.();
    this.kokoro.unlock?.();
  }

  isPrepared(voiceId: string | null): boolean {
    return this.pick(voiceId).isPrepared?.(voiceId) ?? true;
  }

  async prepare(voiceId: string | null, onProgress?: (message: string) => void): Promise<void> {
    await this.pick(voiceId).prepare?.(voiceId, onProgress);
  }

  prefetch(text: string, opts: SpeakOptions): void {
    this.pick(opts.voiceId).prefetch?.(text, opts);
  }

  speak(text: string, opts: SpeakOptions): Promise<SpeakResult> {
    return this.pick(opts.voiceId).speak(text, opts);
  }

  cancel(): void {
    // どちらが鳴っているか分からない場面（音声を切り替えた直後など）があるので両方止める
    this.web.cancel();
    this.kokoro.cancel();
  }
}
