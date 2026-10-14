import type { EnDictionaryPort, EnEntry } from './FreeDictionary';

interface ApiDefinition { definition: string }
interface ApiEntry { partOfSpeech: string; language: string; definitions: ApiDefinition[] }

// 「simple past of give up」のような活用形の項目から、元の見出し語（give up）を取り出す
const FORM_OF_LINK = /class="form-of-definition-link"[\s\S]*?title="([^"]+)"/;
// 熟語の項目にある「字義どおりの意味は各語を参照」という案内文。意味ではないので表示しない
const LITERAL_NOTE = /^Used other than figuratively or idiomatically/;

// Wiktionary（英語版）の REST API から英英の定義を取得する。熟語・句動詞が充実しているのでフレーズ用に使う
export class Wiktionary implements EnDictionaryPort {
  constructor(private fetchFn: typeof fetch = fetch.bind(globalThis)) {}

  async lookup(phrase: string, signal?: AbortSignal): Promise<EnEntry | null> {
    const first = await this.fetchEntries(phrase, signal);
    if (!first) return null;
    // 活用形の項目しかなければ、元の見出し語を 1 回だけ引き直す（gave up → give up）
    const formOf = onlyFormOf(first);
    if (formOf) return toEntry(formOf, await this.fetchEntries(formOf, signal) ?? first);
    return toEntry(phrase, first);
  }

  private async fetchEntries(title: string, signal?: AbortSignal): Promise<ApiEntry[] | null> {
    try {
      const res = await this.fetchFn(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(title.replace(/ /g, '_'))}`, { signal });
      if (!res.ok) return null;
      const data = (await res.json()) as { en?: ApiEntry[] };
      const en = (data.en ?? []).filter((e) => e.language === 'English');
      return en.length ? en : null;
    } catch {
      return null;
    }
  }
}

function onlyFormOf(entries: ApiEntry[]): string | null {
  const defs = entries.flatMap((e) => e.definitions);
  const links = defs.map((d) => d.definition.match(FORM_OF_LINK)?.[1] ?? null);
  return links.length > 0 && links.every(Boolean) ? links[0] : null;
}

function toEntry(word: string, entries: ApiEntry[]): EnEntry | null {
  const meanings = entries
    .map((e) => ({ partOfSpeech: e.partOfSpeech.toLowerCase(), definitions: e.definitions.map((d) => htmlToText(d.definition)).filter((t) => t && !LITERAL_NOTE.test(t)).slice(0, 3) }))
    .filter((m) => m.definitions.length > 0);
  return meanings.length ? { word, meanings } : null;
}

function htmlToText(html: string): string {
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
  return text.replace(/\s+/g, ' ').replace(/\s+([;,.:])/g, '$1').trim();
}
