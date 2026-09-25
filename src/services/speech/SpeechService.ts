export interface Voice { id: string; name: string; lang: string }
export type SpeakResult = 'ended' | 'cancelled';

export interface SpeechService {
  isSupported(): boolean;
  getVoices(): Promise<Voice[]>;
  speak(text: string, opts: { voiceId: string | null; rate: number }): Promise<SpeakResult>;
  cancel(): void;
}

const EN = /^en[-_](us|gb)$/i;
const CHARS_PER_SEC = 15;

export class WebSpeechService implements SpeechService {
  private voiceCache: SpeechSynthesisVoice[] = [];
  constructor(private synth: SpeechSynthesis | undefined = typeof speechSynthesis !== 'undefined' ? speechSynthesis : undefined) {}

  isSupported() { return !!this.synth && typeof SpeechSynthesisUtterance !== 'undefined'; }

  async getVoices(): Promise<Voice[]> {
    if (!this.synth) return [];
    let list = this.synth.getVoices();
    if (list.length === 0) {
      list = await new Promise<SpeechSynthesisVoice[]>((res) => {
        const done = () => { clearTimeout(t); this.synth!.removeEventListener('voiceschanged', done); res(this.synth!.getVoices()); };
        const t = setTimeout(done, 1500);
        this.synth!.addEventListener('voiceschanged', done);
      });
    }
    this.voiceCache = list;
    return list.filter((v) => EN.test(v.lang)).map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang.replace('_', '-') }));
  }

  speak(text: string, opts: { voiceId: string | null; rate: number }): Promise<SpeakResult> {
    const synth = this.synth;
    if (!synth) return Promise.resolve('ended');
    return new Promise((resolve) => {
      let settled = false;
      const finish = (r: SpeakResult) => { if (settled) return; settled = true; clearTimeout(watchdog); resolve(r); };
      const u = new SpeechSynthesisUtterance(text);
      u.rate = opts.rate;
      u.lang = 'en-US';
      const v = opts.voiceId ? this.voiceCache.find((x) => x.voiceURI === opts.voiceId) : undefined;
      if (v) { u.voice = v; u.lang = v.lang; }
      u.onend = () => finish('ended');
      u.onerror = (e) => finish(e.error === 'interrupted' || e.error === 'canceled' ? 'cancelled' : 'ended');
      const estimateMs = (text.length / CHARS_PER_SEC) * 1000 / opts.rate;
      const watchdog = setTimeout(() => { if (settled) return; settled = true; synth.cancel(); resolve('ended'); }, Math.max(3000, estimateMs * 3));
      synth.speak(u);
    });
  }

  cancel() { this.synth?.cancel(); }
}
