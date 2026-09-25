export interface JaDictionary {
  lookup(word: string): Promise<string | null>;
}

type Shard = Record<string, string>;

// public/dict/*.json に分割された英和辞書をシャード単位で遅延取得する
export class EjDictionary implements JaDictionary {
  private shards = new Map<string, Promise<Shard>>();
  constructor(private baseUrl = `${import.meta.env.BASE_URL}dict`, private fetchFn: typeof fetch = fetch.bind(globalThis)) {}

  async lookup(word: string): Promise<string | null> {
    const w = word.trim().toLowerCase();
    if (!w) return null;
    const c = w[0];
    const key = c >= 'a' && c <= 'z' ? c : 'other';
    const shard = await this.load(key);
    return Object.hasOwn(shard, w) ? shard[w] : null;
  }

  private load(key: string): Promise<Shard> {
    let p = this.shards.get(key);
    if (!p) {
      p = this.fetchFn(`${this.baseUrl}/${key}.json`)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<Shard>;
        });
      this.shards.set(key, p);
    }
    // キャッシュから取得したプロミスに対して、エラー時のみキャッシュから削除
    return p.catch(() => {
      this.shards.delete(key);
      return {};
    });
  }
}
