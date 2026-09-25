export interface EnMeaning { partOfSpeech: string; definitions: string[] }
export interface EnEntry { word: string; phonetic?: string; meanings: EnMeaning[] }
export interface EnDictionaryPort { lookup(word: string, signal?: AbortSignal): Promise<EnEntry | null> }

interface ApiEntry { word: string; phonetic?: string; meanings?: { partOfSpeech: string; definitions: { definition: string }[] }[] }

// dictionaryapi.dev（Free Dictionary API）から英英の定義を取得する
export class FreeDictionary implements EnDictionaryPort {
  constructor(private fetchFn: typeof fetch = fetch.bind(globalThis)) {}
  async lookup(word: string, signal?: AbortSignal): Promise<EnEntry | null> {
    try {
      const res = await this.fetchFn(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { signal });
      if (!res.ok) return null;
      const data = (await res.json()) as ApiEntry[];
      const e = data[0];
      if (!e) return null;
      return {
        word: e.word, phonetic: e.phonetic,
        meanings: (e.meanings ?? []).map((m) => ({ partOfSpeech: m.partOfSpeech, definitions: m.definitions.map((d) => d.definition).slice(0, 3) })),
      };
    } catch {
      return null;
    }
  }
}
