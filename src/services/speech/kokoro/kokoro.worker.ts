/// <reference lib="webworker" />
// Kokoro の読み込みと推論を担う Worker。推論は数秒かかるため、メインスレッドから切り離して
// 画面の操作（スクロール・単語タップ・一時停止）が止まらないようにする。
import { loadKokoro, type KokoroModelFile, type LoadedKokoro } from './KokoroBrowser';
import { progressLabel } from './KokoroBackend';

type In =
  | { type: 'load'; modelFile?: KokoroModelFile }
  | { type: 'synth'; id: number; text: string; voice: string; rate: number };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let kokoro: LoadedKokoro | null = null;

ctx.onmessage = async (e: MessageEvent<In>) => {
  const msg = e.data;
  if (msg.type === 'load') {
    try {
      kokoro = await loadKokoro({
        modelFile: msg.modelFile,
        onStage: (message) => ctx.postMessage({ type: 'stage', message }),
        onProgress: (p) => ctx.postMessage({ type: 'stage', message: progressLabel(p.file, p.loaded, p.total) }),
      });
      ctx.postMessage({ type: 'loaded' });
    } catch (err) {
      ctx.postMessage({ type: 'error', id: null, message: (err as Error).message ?? String(err) });
    }
    return;
  }
  if (msg.type === 'synth') {
    try {
      if (!kokoro) throw new Error('音声モデルが読み込まれていません');
      const lang = msg.voice.startsWith('b') ? 'b' : 'a';
      const [phonemes, voice] = await Promise.all([kokoro.toPhonemes(msg.text, lang), kokoro.getVoice(msg.voice)]);
      const pcm = await kokoro.engine.synthesize(phonemes, voice, msg.rate);
      // 音声データはコピーせず所有権ごと渡す
      ctx.postMessage({ type: 'synth', id: msg.id, pcm }, [pcm.buffer as ArrayBuffer]);
    } catch (err) {
      ctx.postMessage({ type: 'error', id: msg.id, message: (err as Error).message ?? String(err) });
    }
  }
};
