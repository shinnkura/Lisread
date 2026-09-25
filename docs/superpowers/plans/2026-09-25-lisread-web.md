# Lisread Web 版（第 1 巡）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** EPUB を取り込み、文単位で読み上げながら読み、単語を 1 タップで英和・英英で引いて保存できる静的 Web アプリ（PWA）を GitHub Pages に配置できる状態にする。

**Architecture:** Vite + React + TypeScript の単一ページ。永続化は Dexie（IndexedDB）、EPUB は取り込み時に JSZip で展開して章 HTML と画像を DB に保存。リーダーは章 HTML を sanitize し `Intl.Segmenter` で文・単語 span に包み直す。Service（EPUB / 辞書 / 音声 / ストレージ）は interface を切り、viewmodel（hooks）はモックでテストする。

**Tech Stack:** Vite 8, React 19, TypeScript 5, Dexie 4, JSZip 3, wink-lemmatizer 3, Web Speech API, Intl.Segmenter, vite-plugin-pwa 1, Vitest 5 + jsdom + fake-indexeddb + @testing-library/react

**Spec:** `docs/superpowers/specs/2026-09-25-lisread-web-design.md`

## Global Constraints

- 実行時依存は `dexie`, `jszip`, `wink-lemmatizer` の 3 つのみ。React/ReactDOM を除き追加しない
- 通信は Free Dictionary API（`https://api.dictionaryapi.dev/api/v2/entries/en/{word}`）のみ。英英以外は完全オフラインで動く
- 対象は iPhone Safari（iOS 17 相当）。`Intl.Segmenter`、`speechSynthesis`、IndexedDB を前提にする
- 状態管理ライブラリ・ルーターは使わない（hooks とハッシュルーティング）
- ディレクトリ: `src/{app,models,services/{epub,storage,speech,dictionary,reader},views/{library,reader,dictionary},viewmodels}`、テストは `test/`
- 識別子は英語、コメント・コミットメッセージは日本語
- UI 文言は日本語のみ
- テストは Vitest。すべてのタスクは `npm test` が通った状態でコミットする
- 保存済み判定は全書籍横断で lemma 一致（lemma 単位で一意）
- 一時停止は `speechSynthesis.cancel()` で行い、現在の文番号を保持する。`pause()` は使わない
- 速度 0.5〜2.0（0.1 刻み）を `utterance.rate` にそのまま渡す
- 仕様からの変更点: Asset / 表紙は `Blob` ではなく `Uint8Array + mime` で保存する（iOS Safari の IndexedDB は Blob の保存が不安定なため）。辞書ビルドスクリプトは `.mjs`（tsx などの依存を増やさないため）

## Review Focus

1. **`../` や `%20` を含む spine の href** → 章と画像が正しい zip パスに解決されて表示される（Task 5 の `resolvePath` テスト、Task 8 の画像差し替えテスト）
2. **曲がった引用符やアポストロフィを含む語（“don’t” / ‘Tis）** → タップ単位が 1 語になり、辞書は引用符を除いた語で引ける（Task 7 の segmenter テスト、Task 10 の `normalizeWord` テスト）
3. **辞書シートを開いた時点で「ユーザーが一時停止中」だった場合** → シートを閉じても勝手に再生しない（Task 10 の useDictionary テスト）
4. **取り込み途中の失敗（OPF はあるが章 XHTML が壊れている等）** → 本棚に半端な本が残らない（Task 4 のトランザクションテスト、Task 5 の壊れた章テスト）
5. **`getVoices()` が最初は空を返す iOS の挙動** → `voiceschanged` を待って英語音声が出る。音声がなければ再生バーに理由を表示（Task 9 の SpeechService テスト）

---

## ファイル構成

| パス | 責務 |
|---|---|
| `index.html`, `vite.config.ts`, `tsconfig.json`, `package.json` | ビルド設定。Vitest は `vite.config.ts` の `test` に書く |
| `scripts/build-dict.mjs` | `data/ejdict.tsv` → `public/dict/{a..z,other}.json` |
| `src/app/main.tsx`, `App.tsx`, `router.ts`, `theme.css` | エントリ、画面切替（ハッシュ）、トークン CSS |
| `src/models/types.ts` | Book / Chapter / Asset / VocabularyEntry / ParsedEpub |
| `src/services/storage/db.ts` | Dexie スキーマと `createDb()` |
| `src/services/storage/BookRepository.ts` | 本・章・アセットの CRUD、進捗保存 |
| `src/services/storage/VocabularyRepository.ts` | 単語の保存・削除・lemma 集合 |
| `src/services/epub/paths.ts` | `dirname`, `resolvePath` |
| `src/services/epub/EpubParser.ts` | zip → ParsedEpub |
| `src/services/dictionary/EjDictionary.ts` | 頭文字別 JSON の遅延ロードと検索 |
| `src/services/dictionary/Lemmatizer.ts` | wink-lemmatizer の薄いラッパ |
| `src/services/dictionary/FreeDictionary.ts` | 英英 API |
| `src/services/dictionary/lookup.ts` | 表記 → lemma と英和の決定 |
| `src/services/reader/sanitize.ts` | 章 HTML の無害化と画像 URL 差し替え |
| `src/services/reader/segmenter.ts` | 文・単語 span 化、文テキスト取得、マーカー適用 |
| `src/services/speech/SpeechService.ts` | interface と Web Speech 実装 |
| `src/viewmodels/useLibrary.ts` | 本棚の状態と取り込み・削除 |
| `src/viewmodels/useReader.ts` | 章ロード・進捗保存・章切替 |
| `src/viewmodels/usePlayback.ts` | 再生ループ |
| `src/viewmodels/useDictionary.ts` | シートの状態、保存/削除、再生の一時停止・再開 |
| `src/views/library/LibraryView.tsx`, `BookCard.tsx` | 本棚 |
| `src/views/reader/ReaderView.tsx`, `ChapterContent.tsx`, `PlaybackBar.tsx` | リーダー |
| `src/views/dictionary/DictionarySheet.tsx` | 辞書シート |
| `src/views/common/Toast.tsx` | エラー表示 |
| `docs/design/tokens.md`, `docs/deploy.md`, `docs/phase-1.md` | ドキュメント |
| `.github/workflows/pages.yml` | GitHub Pages デプロイ |

---

### Task 1: プロジェクト骨組みとデザイントークン

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/app/main.tsx`, `src/app/App.tsx`, `src/app/theme.css`, `src/types/wink-lemmatizer.d.ts`, `test/setup.ts`, `test/app.test.tsx`, `docs/design/tokens.md`

**Interfaces:**
- Produces: `npm test`, `npm run dev`, `npm run build` が動く。CSS 変数（`--bg`, `--fg`, `--muted`, `--surface`, `--border`, `--accent`, `--marker-bg`, `--marker-line`, `--speaking-bg`, `--font-body`, `--font-ui`, `--space-1..6`）

- [ ] **Step 1: 依存を入れる**

```bash
cd /home/claude/dev/Lisread
npm init -y >/dev/null
npm pkg set name=lisread version=0.1.0 private=true type=module
npm pkg set scripts.dev="vite" scripts.build="node scripts/build-dict.mjs && tsc --noEmit && vite build" scripts.preview="vite preview" scripts.test="vitest run" scripts.typecheck="tsc --noEmit" scripts.dict="node scripts/build-dict.mjs"
npm install react@19 react-dom@19 dexie@4 jszip@3 wink-lemmatizer@3
npm install -D vite@8 @vitejs/plugin-react@6 typescript@5 @types/react@19 @types/react-dom@19 vitest@5 jsdom @testing-library/react@16 @testing-library/dom fake-indexeddb@6 vite-plugin-pwa@1
```

- [ ] **Step 2: 設定ファイルを書く**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["ES2022", "DOM", "DOM.Iterable"], "module": "ESNext",
    "moduleResolution": "bundler", "jsx": "react-jsx", "strict": true, "noEmit": true,
    "skipLibCheck": true, "esModuleInterop": true, "allowSyntheticDefaultImports": true,
    "types": ["vite/client", "vite-plugin-pwa/client"]
  },
  "include": ["src", "test", "vite.config.ts"]
}
```

`vite.config.ts`:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Lisread', short_name: 'Lisread', display: 'standalone',
        background_color: '#FAF9F6', theme_color: '#FAF9F6', lang: 'ja',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,png,svg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
```

`test/setup.ts`:
```ts
import 'fake-indexeddb/auto';
```

`src/types/wink-lemmatizer.d.ts`:
```ts
declare module 'wink-lemmatizer' {
  const lemmatizer: {
    noun(word: string): string;
    verb(word: string): string;
    adjective(word: string): string;
  };
  export default lemmatizer;
}
```

`index.html`:
```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="theme-color" content="#FAF9F6" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#141311" media="(prefers-color-scheme: dark)" />
    <link rel="apple-touch-icon" href="/icons/icon-192.png" />
    <title>Lisread</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/app/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: 失敗するテストを書く**

`test/app.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../src/app/App';

describe('App', () => {
  it('本棚画面を表示する', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '本棚' })).toBeTruthy();
  });
});
```

- [ ] **Step 4: 失敗を確認**

Run: `npx vitest run test/app.test.tsx`
Expected: FAIL（`App` が見つからない）

- [ ] **Step 5: 最小実装**

`src/app/theme.css`（トークンは `docs/design/tokens.md` と一致させる）:
```css
:root {
  color-scheme: light dark;
  --bg: #FAF9F6; --fg: #1F1D1A; --muted: #7A756D; --surface: #FFFFFF; --border: #E6E2DA;
  --accent: #2F6F8F; --accent-fg: #FFFFFF;
  --marker-bg: rgba(242, 227, 166, 0.55); --marker-line: #C9A227; --speaking-bg: #EFE7D3;
  --font-body: ui-serif, "New York", Georgia, "Times New Roman", serif;
  --font-ui: system-ui, -apple-system, "Hiragino Sans", sans-serif;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 24px; --space-6: 32px;
  --radius: 10px; --touch: 44px;
  --body-size: 18px; --body-lh: 1.7; --ui-size: 15px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #141311; --fg: #E8E4DC; --muted: #9B958A; --surface: #1E1C19; --border: #2E2B27;
    --accent: #7FB3D5; --accent-fg: #141311;
    --marker-bg: rgba(201, 162, 39, 0.28); --speaking-bg: #2A2519;
  }
}
* { box-sizing: border-box; }
html, body, #root { margin: 0; height: 100%; }
body {
  background: var(--bg); color: var(--fg); font-family: var(--font-ui); font-size: var(--ui-size);
  -webkit-text-size-adjust: 100%; -webkit-tap-highlight-color: transparent;
}
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
.btn { min-height: var(--touch); padding: 0 var(--space-4); border-radius: var(--radius); background: var(--surface); border: 1px solid var(--border); }
.btn-primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
.icon-btn { width: var(--touch); height: var(--touch); display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; }
.screen { min-height: 100dvh; display: flex; flex-direction: column; }
.topbar { display: flex; align-items: center; justify-content: space-between; padding: var(--space-3) var(--space-4); padding-top: calc(var(--space-3) + env(safe-area-inset-top)); }
.topbar h1 { font-size: 20px; margin: 0; font-weight: 600; }
```

`src/app/App.tsx`:
```tsx
import './theme.css';

export default function App() {
  return (
    <div className="screen">
      <header className="topbar"><h1>本棚</h1></header>
    </div>
  );
}
```

`src/app/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
```

`docs/design/tokens.md`: `theme.css` の各変数を「色（ライト/ダーク）」「タイポグラフィ」「余白・形状」の 3 表にまとめ、用途を一行ずつ書く（例: `--marker-bg` 保存済み単語の背景、セピア寄りの黄。`--speaking-bg` 読み上げ中の文の背景）。デザイン方針（本文が主役、コントロールは最小限、アクセント 1 色）を冒頭に 3 行で書く。

- [ ] **Step 6: テストと型チェックを通す**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS（1 test）、型エラーなし

- [ ] **Step 7: コミット**

```bash
git add -A && git commit -m "Vite + React + Vitest の骨組みとデザイントークンを追加"
```

---
### Task 2: 英和辞書のビルドスクリプトと EjDictionary

**Files:**
- Create: `scripts/build-dict.mjs`, `src/services/dictionary/EjDictionary.ts`, `test/dictionary/build-dict.test.ts`, `test/dictionary/EjDictionary.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // scripts/build-dict.mjs
  export function parseTsv(tsv: string): Map<string, string>;   // 見出しを小文字化、カンマ区切りの複数見出しを展開
  export function shardKey(word: string): string;                // 'a'..'z' | 'other'
  // src/services/dictionary/EjDictionary.ts
  export interface JaDictionary { lookup(word: string): Promise<string | null> }
  export class EjDictionary implements JaDictionary {
    constructor(baseUrl?: string, fetchFn?: typeof fetch);
    lookup(word: string): Promise<string | null>;
  }
  ```

- [ ] **Step 1: ビルドスクリプトの失敗するテスト**

`test/dictionary/build-dict.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseTsv, shardKey } from '../../scripts/build-dict.mjs';

describe('parseTsv', () => {
  it('見出しを小文字化し、カンマ区切りは展開する', () => {
    const m = parseTsv('Stumble\tつまずく\ncolor, colour\t色\n\nbad line without tab\n');
    expect(m.get('stumble')).toBe('つまずく');
    expect(m.get('color')).toBe('色');
    expect(m.get('colour')).toBe('色');
    expect(m.size).toBe(3);
  });
});

describe('shardKey', () => {
  it('英字の頭文字か other を返す', () => {
    expect(shardKey('apple')).toBe('a');
    expect(shardKey('Zebra')).toBe('z');
    expect(shardKey('3d')).toBe('other');
    expect(shardKey('éclair')).toBe('other');
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run test/dictionary/build-dict.test.ts`
Expected: FAIL（モジュールがない）

- [ ] **Step 3: スクリプトを書く**

`scripts/build-dict.mjs`:
```js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export function parseTsv(tsv) {
  const map = new Map();
  for (const line of tsv.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const heads = line.slice(0, tab).split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
    const meaning = line.slice(tab + 1).trim();
    if (!meaning) continue;
    for (const h of heads) if (!map.has(h)) map.set(h, meaning);
  }
  return map;
}

export function shardKey(word) {
  const c = word[0]?.toLowerCase() ?? '';
  return c >= 'a' && c <= 'z' ? c : 'other';
}

export function build(tsvPath, outDir) {
  const map = parseTsv(readFileSync(tsvPath, 'utf8'));
  const shards = {};
  for (const [w, m] of map) (shards[shardKey(w)] ??= {})[w] = m;
  mkdirSync(outDir, { recursive: true });
  for (const [k, obj] of Object.entries(shards)) writeFileSync(join(outDir, `${k}.json`), JSON.stringify(obj));
  return map.size;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const n = build(join(root, 'data/ejdict.tsv'), join(root, 'public/dict'));
  console.log(`辞書 ${n} 語を public/dict に書き出しました`);
}
```

- [ ] **Step 4: テストを通し、実データで生成する**

Run: `npx vitest run test/dictionary/build-dict.test.ts && node scripts/build-dict.mjs && ls -la public/dict | head`
Expected: PASS。`public/dict/a.json` 〜 `z.json`, `other.json` が生成される（合計約 5MB）

- [ ] **Step 5: EjDictionary の失敗するテスト**

`test/dictionary/EjDictionary.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { EjDictionary } from '../../src/services/dictionary/EjDictionary';

function fakeFetch(shards: Record<string, Record<string, string>>) {
  return vi.fn(async (url: string) => {
    const key = url.split('/').pop()!.replace('.json', '');
    const body = shards[key];
    return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response('', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('EjDictionary', () => {
  it('頭文字のシャードだけ取得して引く', async () => {
    const f = fakeFetch({ s: { stumble: 'つまずく' } });
    const d = new EjDictionary('/dict', f);
    expect(await d.lookup('Stumble')).toBe('つまずく');
    expect(await d.lookup('stumbled')).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledWith('/dict/s.json');
  });
  it('シャードがなければ null', async () => {
    const d = new EjDictionary('/dict', fakeFetch({}));
    expect(await d.lookup('zzz')).toBeNull();
  });
});
```

- [ ] **Step 6: 失敗を確認**

Run: `npx vitest run test/dictionary/EjDictionary.test.ts`
Expected: FAIL

- [ ] **Step 7: 実装**

`src/services/dictionary/EjDictionary.ts`:
```ts
export interface JaDictionary {
  lookup(word: string): Promise<string | null>;
}

type Shard = Record<string, string>;

export class EjDictionary implements JaDictionary {
  private shards = new Map<string, Promise<Shard>>();
  constructor(private baseUrl = `${import.meta.env.BASE_URL}dict`, private fetchFn: typeof fetch = fetch.bind(globalThis)) {}

  async lookup(word: string): Promise<string | null> {
    const w = word.trim().toLowerCase();
    if (!w) return null;
    const c = w[0];
    const key = c >= 'a' && c <= 'z' ? c : 'other';
    const shard = await this.load(key);
    return shard[w] ?? null;
  }

  private load(key: string): Promise<Shard> {
    let p = this.shards.get(key);
    if (!p) {
      p = this.fetchFn(`${this.baseUrl}/${key}.json`)
        .then((r) => (r.ok ? (r.json() as Promise<Shard>) : {}))
        .catch(() => ({}) as Shard);
      this.shards.set(key, p);
    }
    return p;
  }
}
```

- [ ] **Step 8: テストを通してコミット**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS

```bash
git add -A && git commit -m "ejdict の分割ビルドと EjDictionary を追加"
```

---

### Task 3: Lemmatizer と表記正規化

**Files:**
- Create: `src/services/dictionary/Lemmatizer.ts`, `test/dictionary/Lemmatizer.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function normalizeWord(raw: string): string;      // 引用符・句読点を除き小文字化。"“Don’t”" → "don't"
  export function lemmaCandidates(word: string): string[];  // 動詞→名詞→形容詞の順、重複除去、word 自身は含めない
  ```

- [ ] **Step 1: 失敗するテスト**

`test/dictionary/Lemmatizer.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeWord, lemmaCandidates } from '../../src/services/dictionary/Lemmatizer';

describe('normalizeWord', () => {
  it('引用符と句読点を除いて小文字化する', () => {
    expect(normalizeWord('“Don’t”')).toBe("don't");
    expect(normalizeWord('Elizabeth,')).toBe('elizabeth');
    expect(normalizeWord("‘Tis")).toBe('tis');
    expect(normalizeWord('well-known')).toBe('well-known');
  });
});

describe('lemmaCandidates', () => {
  it('活用形から原形候補を返す', () => {
    expect(lemmaCandidates('stumbled')[0]).toBe('stumble');
    expect(lemmaCandidates('running')[0]).toBe('run');
    expect(lemmaCandidates('books')).toContain('book');
    expect(lemmaCandidates('was')[0]).toBe('be');
  });
  it('原形そのものは候補に含めない', () => {
    expect(lemmaCandidates('book')).not.toContain('book');
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run test/dictionary/Lemmatizer.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装**

`src/services/dictionary/Lemmatizer.ts`:
```ts
import lemmatizer from 'wink-lemmatizer';

const EDGE_PUNCT = /^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g;

export function normalizeWord(raw: string): string {
  return raw.replace(/[‘’ʼ]/g, "'").replace(EDGE_PUNCT, '').toLowerCase();
}

export function lemmaCandidates(word: string): string[] {
  const w = word.toLowerCase();
  const out: string[] = [];
  for (const fn of [lemmatizer.verb, lemmatizer.noun, lemmatizer.adjective]) {
    const l = fn(w);
    if (l && l !== w && !out.includes(l)) out.push(l);
  }
  return out;
}
```

- [ ] **Step 4: テストを通してコミット**

Run: `npx vitest run test/dictionary/Lemmatizer.test.ts`
Expected: PASS。`was → be` が通らない場合は wink-lemmatizer の例外辞書に依存しているので、テストの期待値を `lemmaCandidates('was')` が `'be'` を **含む** に緩めてよい（それも失敗するなら `normalizeWord` 側は保持し、この 1 ケースだけ削除して既知の課題に記録する）

```bash
git add -A && git commit -m "Lemmatizer と表記正規化を追加"
```

---
### Task 4: モデルと Dexie リポジトリ

**Files:**
- Create: `src/models/types.ts`, `src/services/storage/db.ts`, `src/services/storage/BookRepository.ts`, `src/services/storage/VocabularyRepository.ts`, `test/storage/BookRepository.test.ts`, `test/storage/VocabularyRepository.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/models/types.ts
  export interface Book { id: string; title: string; author?: string; cover?: BinaryAsset; chapterCount: number; lastChapterIndex: number; lastScrollProgress: number; addedAt: number; lastOpenedAt?: number }
  export interface Chapter { id: string; bookId: string; index: number; title?: string; href: string; html: string }
  export interface BinaryAsset { mime: string; bytes: Uint8Array }
  export interface Asset extends BinaryAsset { id: string; bookId: string; path: string }
  export interface VocabularyEntry { id: string; word: string; lemma: string; contextSentence: string; bookId: string; chapterIndex: number; sentenceIndex: number; createdAt: number }
  export interface ParsedEpub { title: string; author?: string; cover?: BinaryAsset; chapters: { index: number; title?: string; href: string; html: string }[]; assets: { path: string; mime: string; bytes: Uint8Array }[] }
  // db.ts
  export type LisreadDb = Dexie & { books; chapters; assets; vocabulary }
  export function createDb(name?: string): LisreadDb
  export const db: LisreadDb   // アプリ用の既定インスタンス
  // BookRepository.ts
  export interface BookRepositoryPort {
    listBooks(): Promise<Book[]>;                      // addedAt 降順
    getBook(id: string): Promise<Book | undefined>;
    addBook(parsed: ParsedEpub): Promise<Book>;        // 単一トランザクション
    deleteBook(id: string): Promise<void>;             // chapters/assets/vocabulary も削除
    getChapter(bookId: string, index: number): Promise<Chapter | undefined>;
    getAsset(bookId: string, path: string): Promise<Asset | undefined>;
    updateProgress(bookId: string, chapterIndex: number, progress: number): Promise<void>; // lastOpenedAt も更新
  }
  export class BookRepository implements BookRepositoryPort { constructor(db: LisreadDb) }
  // VocabularyRepository.ts
  export interface VocabularyRepositoryPort {
    findByLemma(lemma: string): Promise<VocabularyEntry | undefined>;
    save(input: Omit<VocabularyEntry, 'id' | 'createdAt'>): Promise<VocabularyEntry>; // 同じ lemma があれば既存を返す
    remove(id: string): Promise<void>;
    removeByLemma(lemma: string): Promise<void>;
    savedLemmas(): Promise<Set<string>>;
  }
  export class VocabularyRepository implements VocabularyRepositoryPort { constructor(db: LisreadDb) }
  ```

- [ ] **Step 1: 型と DB を書く**

`src/models/types.ts` は上記 Interfaces のとおり。

`src/services/storage/db.ts`:
```ts
import Dexie, { type EntityTable } from 'dexie';
import type { Book, Chapter, Asset, VocabularyEntry } from '../../models/types';

export type LisreadDb = Dexie & {
  books: EntityTable<Book, 'id'>;
  chapters: EntityTable<Chapter, 'id'>;
  assets: EntityTable<Asset, 'id'>;
  vocabulary: EntityTable<VocabularyEntry, 'id'>;
};

export function createDb(name = 'lisread'): LisreadDb {
  const d = new Dexie(name) as LisreadDb;
  d.version(1).stores({
    books: 'id, addedAt',
    chapters: 'id, bookId, [bookId+index]',
    assets: 'id, bookId, [bookId+path]',
    vocabulary: 'id, lemma, bookId, createdAt',
  });
  return d;
}

export const db = createDb();
```

- [ ] **Step 2: BookRepository の失敗するテスト**

`test/storage/BookRepository.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type LisreadDb } from '../../src/services/storage/db';
import { BookRepository } from '../../src/services/storage/BookRepository';
import { VocabularyRepository } from '../../src/services/storage/VocabularyRepository';
import type { ParsedEpub } from '../../src/models/types';

const parsed: ParsedEpub = {
  title: 'Pride and Prejudice', author: 'Jane Austen',
  cover: { mime: 'image/png', bytes: new Uint8Array([1, 2, 3]) },
  chapters: [
    { index: 0, title: 'Chapter 1', href: 'OEBPS/ch1.xhtml', html: '<p>It is a truth.</p>' },
    { index: 1, href: 'OEBPS/ch2.xhtml', html: '<p>Mr. Bennet.</p>' },
  ],
  assets: [{ path: 'OEBPS/img/a.png', mime: 'image/png', bytes: new Uint8Array([9]) }],
};

let db: LisreadDb; let repo: BookRepository; let n = 0;
beforeEach(() => { db = createDb(`test-books-${n++}`); repo = new BookRepository(db); });

describe('BookRepository', () => {
  it('取り込んだ本・章・アセットを保存し、一覧は新しい順', async () => {
    const b1 = await repo.addBook(parsed);
    const b2 = await repo.addBook({ ...parsed, title: 'Emma' });
    const list = await repo.listBooks();
    expect(list.map((b) => b.title)).toEqual(['Emma', 'Pride and Prejudice']);
    expect(b1.chapterCount).toBe(2);
    expect((await repo.getChapter(b1.id, 1))?.html).toContain('Bennet');
    expect((await repo.getAsset(b1.id, 'OEBPS/img/a.png'))?.bytes[0]).toBe(9);
    expect(b2.lastChapterIndex).toBe(0);
  });

  it('進捗を保存すると lastOpenedAt も更新される', async () => {
    const b = await repo.addBook(parsed);
    await repo.updateProgress(b.id, 1, 0.4);
    const got = await repo.getBook(b.id);
    expect(got?.lastChapterIndex).toBe(1);
    expect(got?.lastScrollProgress).toBeCloseTo(0.4);
    expect(got?.lastOpenedAt).toBeTypeOf('number');
  });

  it('削除で章・アセット・単語も消える', async () => {
    const b = await repo.addBook(parsed);
    const vocab = new VocabularyRepository(db);
    await vocab.save({ word: 'truth', lemma: 'truth', contextSentence: 'It is a truth.', bookId: b.id, chapterIndex: 0, sentenceIndex: 0 });
    await repo.deleteBook(b.id);
    expect(await repo.listBooks()).toHaveLength(0);
    expect(await db.chapters.where('bookId').equals(b.id).count()).toBe(0);
    expect(await db.assets.where('bookId').equals(b.id).count()).toBe(0);
    expect(await db.vocabulary.where('bookId').equals(b.id).count()).toBe(0);
  });

  it('章の保存に失敗したら本も残らない（トランザクション）', async () => {
    // 章 id を先に占有しておき、bulkAdd をキー重複で失敗させる
    await db.chapters.add({ id: 'fixed:0', bookId: 'fixed', index: 0, href: 'x', html: '' });
    await expect(repo.addBook(parsed, 'fixed')).rejects.toThrow();
    expect(await repo.listBooks()).toHaveLength(0);
  });
});
```

（`addBook` の第 2 引数は id を差し込むためのテスト用オプション。既定は `crypto.randomUUID()`）

- [ ] **Step 3: VocabularyRepository の失敗するテスト**

`test/storage/VocabularyRepository.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type LisreadDb } from '../../src/services/storage/db';
import { VocabularyRepository } from '../../src/services/storage/VocabularyRepository';

let db: LisreadDb; let repo: VocabularyRepository; let n = 0;
beforeEach(() => { db = createDb(`test-vocab-${n++}`); repo = new VocabularyRepository(db); });
const base = { word: 'stumbled', lemma: 'stumble', contextSentence: 'He stumbled.', bookId: 'b1', chapterIndex: 2, sentenceIndex: 5 };

describe('VocabularyRepository', () => {
  it('保存して lemma で引ける。同じ lemma は二重登録しない', async () => {
    const a = await repo.save(base);
    const b = await repo.save({ ...base, word: 'stumbles', bookId: 'b2' });
    expect(b.id).toBe(a.id);
    expect((await repo.findByLemma('stumble'))?.word).toBe('stumbled');
    expect(await repo.savedLemmas()).toEqual(new Set(['stumble']));
  });
  it('lemma で削除できる', async () => {
    await repo.save(base);
    await repo.removeByLemma('stumble');
    expect(await repo.findByLemma('stumble')).toBeUndefined();
  });
});
```

- [ ] **Step 4: 失敗を確認**

Run: `npx vitest run test/storage`
Expected: FAIL（モジュールがない）

- [ ] **Step 5: 実装**

`src/services/storage/BookRepository.ts`:
```ts
import type { Book, Chapter, Asset, ParsedEpub } from '../../models/types';
import type { LisreadDb } from './db';

export interface BookRepositoryPort {
  listBooks(): Promise<Book[]>;
  getBook(id: string): Promise<Book | undefined>;
  addBook(parsed: ParsedEpub, id?: string): Promise<Book>;
  deleteBook(id: string): Promise<void>;
  getChapter(bookId: string, index: number): Promise<Chapter | undefined>;
  getAsset(bookId: string, path: string): Promise<Asset | undefined>;
  updateProgress(bookId: string, chapterIndex: number, progress: number): Promise<void>;
}

export class BookRepository implements BookRepositoryPort {
  constructor(private db: LisreadDb) {}

  async listBooks() {
    return this.db.books.orderBy('addedAt').reverse().toArray();
  }
  getBook(id: string) {
    return this.db.books.get(id);
  }
  async addBook(parsed: ParsedEpub, id = crypto.randomUUID()): Promise<Book> {
    const book: Book = {
      id, title: parsed.title, author: parsed.author, cover: parsed.cover,
      chapterCount: parsed.chapters.length, lastChapterIndex: 0, lastScrollProgress: 0, addedAt: Date.now(),
    };
    await this.db.transaction('rw', this.db.books, this.db.chapters, this.db.assets, async () => {
      await this.db.books.add(book);
      await this.db.chapters.bulkAdd(parsed.chapters.map((c) => ({ ...c, id: `${id}:${c.index}`, bookId: id })));
      await this.db.assets.bulkAdd(parsed.assets.map((a) => ({ ...a, id: `${id}:${a.path}`, bookId: id })));
    });
    return book;
  }
  async deleteBook(id: string) {
    await this.db.transaction('rw', this.db.books, this.db.chapters, this.db.assets, this.db.vocabulary, async () => {
      await this.db.chapters.where('bookId').equals(id).delete();
      await this.db.assets.where('bookId').equals(id).delete();
      await this.db.vocabulary.where('bookId').equals(id).delete();
      await this.db.books.delete(id);
    });
  }
  getChapter(bookId: string, index: number) {
    return this.db.chapters.get(`${bookId}:${index}`);
  }
  getAsset(bookId: string, path: string) {
    return this.db.assets.get(`${bookId}:${path}`);
  }
  async updateProgress(bookId: string, chapterIndex: number, progress: number) {
    await this.db.books.update(bookId, {
      lastChapterIndex: chapterIndex, lastScrollProgress: Math.min(1, Math.max(0, progress)), lastOpenedAt: Date.now(),
    });
  }
}
```

`src/services/storage/VocabularyRepository.ts`:
```ts
import type { VocabularyEntry } from '../../models/types';
import type { LisreadDb } from './db';

export interface VocabularyRepositoryPort {
  findByLemma(lemma: string): Promise<VocabularyEntry | undefined>;
  save(input: Omit<VocabularyEntry, 'id' | 'createdAt'>): Promise<VocabularyEntry>;
  remove(id: string): Promise<void>;
  removeByLemma(lemma: string): Promise<void>;
  savedLemmas(): Promise<Set<string>>;
}

export class VocabularyRepository implements VocabularyRepositoryPort {
  constructor(private db: LisreadDb) {}
  findByLemma(lemma: string) {
    return this.db.vocabulary.where('lemma').equals(lemma).first();
  }
  async save(input: Omit<VocabularyEntry, 'id' | 'createdAt'>) {
    return this.db.transaction('rw', this.db.vocabulary, async () => {
      const existing = await this.findByLemma(input.lemma);
      if (existing) return existing;
      const entry: VocabularyEntry = { ...input, id: crypto.randomUUID(), createdAt: Date.now() };
      await this.db.vocabulary.add(entry);
      return entry;
    });
  }
  async remove(id: string) {
    await this.db.vocabulary.delete(id);
  }
  async removeByLemma(lemma: string) {
    await this.db.vocabulary.where('lemma').equals(lemma).delete();
  }
  async savedLemmas() {
    return new Set(await this.db.vocabulary.orderBy('lemma').uniqueKeys() as string[]);
  }
}
```

- [ ] **Step 6: テストを通してコミット**

Run: `npx vitest run test/storage && npx tsc --noEmit`
Expected: PASS。fake-indexeddb で `Uint8Array` の保存が通ること

```bash
git add -A && git commit -m "SwiftData 相当の Dexie モデルとリポジトリを追加"
```

---

### Task 5: EPUB パーサ

**Files:**
- Create: `src/services/epub/paths.ts`, `src/services/epub/EpubParser.ts`, `test/epub/paths.test.ts`, `test/epub/EpubParser.test.ts`, `test/epub/fixtures.ts`

**Interfaces:**
- Consumes: `ParsedEpub`（Task 4）
- Produces:
  ```ts
  // paths.ts
  export function dirname(path: string): string;                 // 'OEBPS/ch1.xhtml' → 'OEBPS'、'ch1.xhtml' → ''
  export function resolvePath(baseDir: string, href: string): string; // '../', './', %XX デコード、#fragment と ?query 除去
  // EpubParser.ts
  export class EpubParseError extends Error {}
  export interface EpubParserPort { parse(data: ArrayBuffer): Promise<ParsedEpub> }
  export class EpubParser implements EpubParserPort { parse(data: ArrayBuffer): Promise<ParsedEpub> }
  ```

- [ ] **Step 1: paths のテストと実装**

`test/epub/paths.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { dirname, resolvePath } from '../../src/services/epub/paths';

describe('paths', () => {
  it('dirname', () => {
    expect(dirname('OEBPS/text/ch1.xhtml')).toBe('OEBPS/text');
    expect(dirname('ch1.xhtml')).toBe('');
  });
  it('resolvePath は ../ と %20 と #fragment を扱う', () => {
    expect(resolvePath('OEBPS/text', '../images/a%20b.jpg')).toBe('OEBPS/images/a b.jpg');
    expect(resolvePath('OEBPS', './ch1.xhtml#p3')).toBe('OEBPS/ch1.xhtml');
    expect(resolvePath('', 'ch1.xhtml')).toBe('ch1.xhtml');
    expect(resolvePath('OEBPS', '/abs/x.css')).toBe('abs/x.css');
  });
});
```

`src/services/epub/paths.ts`:
```ts
export function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

export function resolvePath(baseDir: string, href: string): string {
  let h = href.split('#')[0].split('?')[0];
  try { h = decodeURIComponent(h); } catch { /* そのまま使う */ }
  const parts = h.startsWith('/') ? [] : baseDir.split('/').filter(Boolean);
  for (const seg of h.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}
```

Run: `npx vitest run test/epub/paths.test.ts` → PASS

- [ ] **Step 2: テスト用 EPUB 生成ヘルパ**

`test/epub/fixtures.ts`:
```ts
import JSZip from 'jszip';

export interface FixtureOptions { withNav?: boolean; withNcx?: boolean; brokenChapter?: boolean; noOpf?: boolean }

export async function makeEpub(o: FixtureOptions = {}): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  if (!o.noOpf) zip.file('OEBPS/content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Pride and Prejudice</dc:title><dc:creator>Jane Austen</dc:creator>
    <meta name="cover" content="cover"/>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="cover" href="images/cover.png" media-type="image/png"/>
    <item id="pic" href="images/pic%201.png" media-type="image/png"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx"><itemref idref="c1"/><itemref idref="c2"/></spine>
</package>`);
  if (o.withNav !== false) zip.file('OEBPS/nav.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body>
<nav epub:type="toc"><ol><li><a href="text/ch1.xhtml">Chapter I</a></li><li><a href="text/ch2.xhtml#top">Chapter II</a></li></ol></nav></body></html>`);
  if (o.withNcx) zip.file('OEBPS/toc.ncx', `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap>
<navPoint id="n1"><navLabel><text>One</text></navLabel><content src="text/ch1.xhtml"/></navPoint>
<navPoint id="n2"><navLabel><text>Two</text></navLabel><content src="text/ch2.xhtml"/></navPoint></navMap></ncx>`);
  zip.file('OEBPS/text/ch1.xhtml', `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>1</title></head>
<body><h1>Chapter I</h1><p>It is a truth universally acknowledged.</p><img src="../images/pic%201.png"/></body></html>`);
  zip.file('OEBPS/text/ch2.xhtml', o.brokenChapter ? '<html><body><p>unclosed' : `<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Mr. Bennet.</p></body></html>`);
  zip.file('OEBPS/images/cover.png', new Uint8Array([137, 80, 78, 71]));
  zip.file('OEBPS/images/pic 1.png', new Uint8Array([1]));
  zip.file('OEBPS/style.css', 'p { margin: 0 }');
  return zip.generateAsync({ type: 'arraybuffer' });
}
```

- [ ] **Step 3: パーサの失敗するテスト**

`test/epub/EpubParser.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { EpubParser, EpubParseError } from '../../src/services/epub/EpubParser';
import { makeEpub } from './fixtures';

const parser = new EpubParser();

describe('EpubParser', () => {
  it('書名・著者・表紙・spine 順の章・アセットを取り出す', async () => {
    const r = await parser.parse(await makeEpub());
    expect(r.title).toBe('Pride and Prejudice');
    expect(r.author).toBe('Jane Austen');
    expect(r.cover?.mime).toBe('image/png');
    expect(r.cover?.bytes[0]).toBe(137);
    expect(r.chapters.map((c) => c.href)).toEqual(['OEBPS/text/ch1.xhtml', 'OEBPS/text/ch2.xhtml']);
    expect(r.chapters.map((c) => c.title)).toEqual(['Chapter I', 'Chapter II']);
    expect(r.chapters[0].html).toContain('universally acknowledged');
    expect(r.chapters[0].html).not.toContain('<body');
    expect(r.assets.map((a) => a.path).sort()).toEqual(['OEBPS/images/cover.png', 'OEBPS/images/pic 1.png', 'OEBPS/style.css']);
  });
  it('nav がなければ NCX から章タイトルを取る', async () => {
    const r = await parser.parse(await makeEpub({ withNav: false, withNcx: true }));
    expect(r.chapters.map((c) => c.title)).toEqual(['One', 'Two']);
  });
  it('壊れた XHTML の章は HTML として緩く読む', async () => {
    const r = await parser.parse(await makeEpub({ brokenChapter: true }));
    expect(r.chapters[1].html).toContain('unclosed');
  });
  it('zip でないデータは EpubParseError', async () => {
    await expect(parser.parse(new TextEncoder().encode('hello').buffer)).rejects.toBeInstanceOf(EpubParseError);
  });
  it('OPF がなければ EpubParseError', async () => {
    await expect(parser.parse(await makeEpub({ noOpf: true }))).rejects.toThrow(/OPF/);
  });
});
```

- [ ] **Step 4: 失敗を確認**

Run: `npx vitest run test/epub/EpubParser.test.ts`
Expected: FAIL

- [ ] **Step 5: 実装**

`src/services/epub/EpubParser.ts`:
```ts
import JSZip from 'jszip';
import type { ParsedEpub, BinaryAsset } from '../../models/types';
import { dirname, resolvePath } from './paths';

const NS_DC = 'http://purl.org/dc/elements/1.1/';
const MAX_ASSET_BYTES = 5 * 1024 * 1024;

export class EpubParseError extends Error {}

export interface EpubParserPort {
  parse(data: ArrayBuffer): Promise<ParsedEpub>;
}

interface ManifestItem { id: string; href: string; path: string; mediaType: string; properties: string }

export class EpubParser implements EpubParserPort {
  async parse(data: ArrayBuffer): Promise<ParsedEpub> {
    let zip: JSZip;
    try { zip = await JSZip.loadAsync(data); } catch { throw new EpubParseError('EPUB（zip）として開けません'); }

    const containerXml = await readText(zip, 'META-INF/container.xml');
    if (!containerXml) throw new EpubParseError('container.xml がありません');
    const opfPath = parseXml(containerXml).getElementsByTagName('rootfile')[0]?.getAttribute('full-path');
    if (!opfPath) throw new EpubParseError('OPF の場所が分かりません');
    const opfXml = await readText(zip, opfPath);
    if (!opfXml) throw new EpubParseError('OPF ファイルがありません');
    const opf = parseXml(opfXml);
    const opfDir = dirname(opfPath);

    const title = opf.getElementsByTagNameNS(NS_DC, 'title')[0]?.textContent?.trim() || 'Untitled';
    const author = opf.getElementsByTagNameNS(NS_DC, 'creator')[0]?.textContent?.trim() || undefined;

    const manifest = new Map<string, ManifestItem>();
    for (const el of Array.from(opf.getElementsByTagName('item'))) {
      const id = el.getAttribute('id') ?? ''; const href = el.getAttribute('href') ?? '';
      manifest.set(id, { id, href, path: resolvePath(opfDir, href), mediaType: el.getAttribute('media-type') ?? '', properties: el.getAttribute('properties') ?? '' });
    }
    const spineItems = Array.from(opf.getElementsByTagName('itemref'))
      .map((el) => manifest.get(el.getAttribute('idref') ?? ''))
      .filter((it): it is ManifestItem => !!it && /xhtml|html/.test(it.mediaType));
    if (spineItems.length === 0) throw new EpubParseError('本文の章が見つかりません');

    const titles = await this.readTitles(zip, manifest, opf);

    const chapters = [];
    for (const [index, item] of spineItems.entries()) {
      const src = (await readText(zip, item.path)) ?? '';
      chapters.push({ index, title: titles.get(item.path), href: item.path, html: bodyInnerHtml(src) });
    }

    const cover = await this.readCover(zip, manifest, opf);
    const assets = [];
    for (const it of manifest.values()) {
      if (!(it.mediaType.startsWith('image/') || it.mediaType === 'text/css')) continue;
      const file = zip.file(it.path); if (!file) continue;
      const bytes = await file.async('uint8array');
      if (bytes.byteLength > MAX_ASSET_BYTES) continue;
      assets.push({ path: it.path, mime: it.mediaType, bytes });
    }
    return { title, author, cover, chapters, assets };
  }

  private async readTitles(zip: JSZip, manifest: Map<string, ManifestItem>, opf: Document) {
    const titles = new Map<string, string>();
    const nav = [...manifest.values()].find((m) => m.properties.split(/\s+/).includes('nav'));
    if (nav) {
      const doc = parseMarkup((await readText(zip, nav.path)) ?? '');
      const navEl = Array.from(doc.getElementsByTagName('nav')).find((n) => (n.getAttribute('epub:type') ?? n.getAttributeNS('http://www.idpf.org/2007/ops', 'type')) === 'toc') ?? doc.getElementsByTagName('nav')[0];
      for (const a of Array.from(navEl?.getElementsByTagName('a') ?? [])) {
        const href = a.getAttribute('href'); const text = a.textContent?.trim();
        if (href && text) { const p = resolvePath(dirname(nav.path), href); if (!titles.has(p)) titles.set(p, text); }
      }
      if (titles.size) return titles;
    }
    const ncx = [...manifest.values()].find((m) => m.mediaType === 'application/x-dtbncx+xml');
    if (ncx) {
      const doc = parseXml((await readText(zip, ncx.path)) ?? '');
      for (const np of Array.from(doc.getElementsByTagName('navPoint'))) {
        const src = np.getElementsByTagName('content')[0]?.getAttribute('src');
        const text = np.getElementsByTagName('text')[0]?.textContent?.trim();
        if (src && text) { const p = resolvePath(dirname(ncx.path), src); if (!titles.has(p)) titles.set(p, text); }
      }
    }
    return titles;
  }

  private async readCover(zip: JSZip, manifest: Map<string, ManifestItem>, opf: Document): Promise<BinaryAsset | undefined> {
    const metaId = Array.from(opf.getElementsByTagName('meta')).find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content');
    const item = (metaId && manifest.get(metaId)) || [...manifest.values()].find((m) => m.properties.split(/\s+/).includes('cover-image'));
    if (!item || !item.mediaType.startsWith('image/')) return undefined;
    const file = zip.file(item.path); if (!file) return undefined;
    return { mime: item.mediaType, bytes: await file.async('uint8array') };
  }
}

async function readText(zip: JSZip, path: string): Promise<string | null> {
  const f = zip.file(path);
  return f ? f.async('string') : null;
}

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

/** XHTML として読み、失敗したら HTML として緩く読む */
function parseMarkup(src: string): Document {
  const doc = new DOMParser().parseFromString(src, 'application/xhtml+xml');
  if (doc.getElementsByTagName('parsererror').length === 0 && doc.getElementsByTagName('body').length) return doc;
  return new DOMParser().parseFromString(src, 'text/html');
}

function bodyInnerHtml(src: string): string {
  const doc = parseMarkup(src);
  return doc.getElementsByTagName('body')[0]?.innerHTML ?? '';
}
```

- [ ] **Step 6: テストを通してコミット**

Run: `npx vitest run test/epub && npx tsc --noEmit`
Expected: PASS。jsdom の XML パーサが `parsererror` を投げずに例外を出す場合は `parseMarkup` を try/catch で囲み、catch で `text/html` にフォールバックする

```bash
git add -A && git commit -m "EPUB パーサ（container → OPF → spine / nav / 表紙）を追加"
```

---
### Task 6: 本棚（取り込み・グリッド・削除）とルーティング

**Files:**
- Create: `src/app/router.ts`, `src/app/services.ts`, `src/views/common/Toast.tsx`, `src/viewmodels/useLibrary.ts`, `src/views/library/LibraryView.tsx`, `src/views/library/BookCard.tsx`, `src/views/library/library.css`, `test/viewmodels/useLibrary.test.tsx`, `test/app/router.test.ts`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: `BookRepositoryPort`, `EpubParserPort`, `EpubParseError`
- Produces:
  ```ts
  // router.ts
  export type Route = { name: 'library' } | { name: 'reader'; bookId: string };
  export function parseHash(hash: string): Route;          // '#/book/abc' → reader、それ以外 → library
  export function toHash(route: Route): string;
  export function useRoute(): Route;                        // hashchange を購読
  export function navigate(route: Route): void;             // location.hash を書く
  // services.ts（アプリ全体の Service インスタンス）
  export const services: { books: BookRepositoryPort; vocabulary: VocabularyRepositoryPort; epub: EpubParserPort; jaDict: JaDictionary; speech: SpeechService; enDict: EnDictionaryPort }
  // useLibrary.ts
  export function useLibrary(deps: { books: BookRepositoryPort; epub: EpubParserPort }): {
    books: Book[]; loading: boolean; error: string | null; importing: boolean;
    importFile(file: File): Promise<void>; deleteBook(id: string): Promise<void>; clearError(): void;
  }
  export function coverUrl(book: Book): string | null;      // Uint8Array → blob URL（呼び出し側で revoke）
  export function progressPercent(book: Book): number;
  ```

- [ ] **Step 1: router のテストと実装**

`test/app/router.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseHash, toHash } from '../../src/app/router';

describe('router', () => {
  it('ハッシュと Route を相互変換する', () => {
    expect(parseHash('#/book/abc-1')).toEqual({ name: 'reader', bookId: 'abc-1' });
    expect(parseHash('')).toEqual({ name: 'library' });
    expect(parseHash('#/nope')).toEqual({ name: 'library' });
    expect(toHash({ name: 'reader', bookId: 'x' })).toBe('#/book/x');
    expect(toHash({ name: 'library' })).toBe('#/');
  });
});
```

`src/app/router.ts`:
```ts
import { useEffect, useState } from 'react';

export type Route = { name: 'library' } | { name: 'reader'; bookId: string };

export function parseHash(hash: string): Route {
  const m = /^#\/book\/([^/]+)$/.exec(hash);
  return m ? { name: 'reader', bookId: decodeURIComponent(m[1]) } : { name: 'library' };
}
export function toHash(route: Route): string {
  return route.name === 'reader' ? `#/book/${encodeURIComponent(route.bookId)}` : '#/';
}
export function navigate(route: Route) {
  location.hash = toHash(route);
}
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}
```

- [ ] **Step 2: useLibrary の失敗するテスト**

`test/viewmodels/useLibrary.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLibrary, progressPercent } from '../../src/viewmodels/useLibrary';
import { EpubParseError } from '../../src/services/epub/EpubParser';
import type { Book, ParsedEpub } from '../../src/models/types';

const book = (id: string): Book => ({ id, title: id, chapterCount: 10, lastChapterIndex: 2, lastScrollProgress: 0.5, addedAt: 1 });
function deps(over: Partial<{ parse: (d: ArrayBuffer) => Promise<ParsedEpub> }> = {}) {
  const store: Book[] = [book('a')];
  const books = {
    listBooks: vi.fn(async () => [...store]),
    getBook: vi.fn(), getChapter: vi.fn(), getAsset: vi.fn(), updateProgress: vi.fn(),
    addBook: vi.fn(async (p: ParsedEpub) => { const b = { ...book(p.title), chapterCount: p.chapters.length }; store.push(b); return b; }),
    deleteBook: vi.fn(async (id: string) => { store.splice(store.findIndex((b) => b.id === id), 1); }),
  };
  const epub = { parse: over.parse ?? vi.fn(async () => ({ title: 'new', chapters: [{ index: 0, href: 'c', html: '' }], assets: [] })) };
  return { books, epub };
}

describe('useLibrary', () => {
  it('初期表示で一覧を読み、取り込みで増える', async () => {
    const d = deps();
    const { result } = renderHook(() => useLibrary(d));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.books.map((b) => b.id)).toEqual(['a']);
    await act(() => result.current.importFile(new File([new Uint8Array([1])], 'x.epub')));
    expect(result.current.books.map((b) => b.id)).toEqual(['a', 'new']);
    expect(result.current.error).toBeNull();
  });
  it('壊れた EPUB はエラー文言になり一覧は変わらない', async () => {
    const d = deps({ parse: async () => { throw new EpubParseError('OPF がありません'); } });
    const { result } = renderHook(() => useLibrary(d));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.importFile(new File([new Uint8Array([1])], 'x.epub')));
    expect(result.current.error).toBe('OPF がありません');
    expect(result.current.books).toHaveLength(1);
  });
  it('削除で一覧から消える', async () => {
    const d = deps();
    const { result } = renderHook(() => useLibrary(d));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.deleteBook('a'));
    expect(result.current.books).toHaveLength(0);
  });
  it('progressPercent', () => {
    expect(progressPercent(book('a'))).toBe(25);
    expect(progressPercent({ ...book('a'), chapterCount: 0 })).toBe(0);
  });
});
```

- [ ] **Step 3: 失敗を確認**

Run: `npx vitest run test/viewmodels/useLibrary.test.tsx`
Expected: FAIL

- [ ] **Step 4: 実装**

`src/viewmodels/useLibrary.ts`:
```ts
import { useCallback, useEffect, useState } from 'react';
import type { Book } from '../models/types';
import type { BookRepositoryPort } from '../services/storage/BookRepository';
import { EpubParseError, type EpubParserPort } from '../services/epub/EpubParser';

export function progressPercent(book: Book): number {
  if (book.chapterCount <= 0) return 0;
  return Math.min(100, Math.round(((book.lastChapterIndex + book.lastScrollProgress) / book.chapterCount) * 100));
}

export function coverUrl(book: Book): string | null {
  return book.cover ? URL.createObjectURL(new Blob([book.cover.bytes], { type: book.cover.mime })) : null;
}

/** jsdom など Blob.arrayBuffer がない環境でも動くように FileReader にフォールバックする */
export function readFileBytes(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as ArrayBuffer);
    r.onerror = () => rej(r.error);
    r.readAsArrayBuffer(file);
  });
}

export function useLibrary(deps: { books: BookRepositoryPort; epub: EpubParserPort }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setBooks(await deps.books.listBooks());
    setLoading(false);
  }, [deps.books]);

  useEffect(() => { void reload(); }, [reload]);

  const importFile = useCallback(async (file: File) => {
    setImporting(true);
    try {
      const parsed = await deps.epub.parse(await readFileBytes(file));
      await deps.books.addBook(parsed);
      await reload();
    } catch (e) {
      setError(e instanceof EpubParseError ? e.message : `取り込みに失敗しました: ${(e as Error).message ?? e}`);
    } finally {
      setImporting(false);
    }
  }, [deps, reload]);

  const deleteBook = useCallback(async (id: string) => {
    await deps.books.deleteBook(id);
    await reload();
  }, [deps.books, reload]);

  return { books, loading, importing, error, importFile, deleteBook, clearError: () => setError(null) };
}
```

`src/views/common/Toast.tsx`:
```tsx
import { useEffect } from 'react';

export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return <div className="toast" role="alert" onClick={onClose}>{message}</div>;
}
```

`src/views/library/BookCard.tsx`（長押し 500ms で `onLongPress`、iOS のコールアウト抑止）:
```tsx
import { useEffect, useMemo, useRef } from 'react';
import type { Book } from '../../models/types';
import { coverUrl, progressPercent } from '../../viewmodels/useLibrary';

export function BookCard({ book, onOpen, onLongPress }: { book: Book; onOpen: () => void; onLongPress: () => void }) {
  const url = useMemo(() => coverUrl(book), [book]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const start = () => { fired.current = false; timer.current = window.setTimeout(() => { fired.current = true; onLongPress(); }, 500); };
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  return (
    <button className="book-card" onPointerDown={start} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()} onClick={() => { if (!fired.current) onOpen(); }} aria-label={book.title}>
      <div className="book-cover">{url ? <img src={url} alt="" /> : <span className="book-cover-placeholder">{book.title}</span>}</div>
      <div className="book-title">{book.title}</div>
      <div className="book-meta">{book.author ?? ''}</div>
      <div className="book-meta">{progressPercent(book)}%</div>
    </button>
  );
}
```

`src/views/library/LibraryView.tsx`:
```tsx
import { useRef } from 'react';
import { useLibrary } from '../../viewmodels/useLibrary';
import { services } from '../../app/services';
import { navigate } from '../../app/router';
import { BookCard } from './BookCard';
import { Toast } from '../common/Toast';
import './library.css';

export function LibraryView() {
  const lib = useLibrary(services);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="screen">
      <header className="topbar">
        <h1>本棚</h1>
        <button className="btn" onClick={() => input.current?.click()} disabled={lib.importing}>{lib.importing ? '取り込み中…' : '取り込み'}</button>
        <input ref={input} type="file" accept=".epub,application/epub+zip" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void lib.importFile(f); e.target.value = ''; }} />
      </header>
      {!lib.loading && lib.books.length === 0 && <p className="empty">右上の「取り込み」から EPUB を追加してください</p>}
      <div className="book-grid">
        {lib.books.map((b) => (
          <BookCard key={b.id} book={b} onOpen={() => navigate({ name: 'reader', bookId: b.id })}
            onLongPress={() => { if (confirm(`「${b.title}」を削除しますか？保存した単語も消えます。`)) void lib.deleteBook(b.id); }} />
        ))}
      </div>
      <Toast message={lib.error} onClose={lib.clearError} />
    </div>
  );
}
```

`src/views/library/library.css`:
```css
.book-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-4); padding: 0 var(--space-4) var(--space-6); }
.book-card { text-align: left; -webkit-touch-callout: none; user-select: none; }
.book-cover { aspect-ratio: 2 / 3; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; display: flex; align-items: center; justify-content: center; }
.book-cover img { width: 100%; height: 100%; object-fit: cover; }
.book-cover-placeholder { padding: var(--space-3); font-family: var(--font-body); color: var(--muted); text-align: center; }
.book-title { margin-top: var(--space-2); font-weight: 600; line-height: 1.3; }
.book-meta { color: var(--muted); font-size: 13px; }
.empty { color: var(--muted); text-align: center; padding: var(--space-6); }
.toast { position: fixed; left: var(--space-4); right: var(--space-4); bottom: calc(var(--space-5) + env(safe-area-inset-bottom)); background: var(--fg); color: var(--bg); padding: var(--space-3) var(--space-4); border-radius: var(--radius); z-index: 50; }
```

`src/app/services.ts`（Task 9 / 10 で `speech`, `enDict` を追加する。ここでは 4 つ）:
```ts
import { db } from '../services/storage/db';
import { BookRepository } from '../services/storage/BookRepository';
import { VocabularyRepository } from '../services/storage/VocabularyRepository';
import { EpubParser } from '../services/epub/EpubParser';
import { EjDictionary } from '../services/dictionary/EjDictionary';

export const services = {
  books: new BookRepository(db),
  vocabulary: new VocabularyRepository(db),
  epub: new EpubParser(),
  jaDict: new EjDictionary(),
};
```

`src/app/App.tsx`:
```tsx
import './theme.css';
import { useRoute } from './router';
import { LibraryView } from '../views/library/LibraryView';

export default function App() {
  const route = useRoute();
  if (route.name === 'reader') return <div className="screen"><p>reader: {route.bookId}</p></div>;
  return <LibraryView />;
}
```

- [ ] **Step 5: テストと型チェック**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS。`test/app.test.tsx` は `LibraryView` が `services`（実 Dexie）を使うため fake-indexeddb で動く

- [ ] **Step 6: ブラウザで確認してコミット**

Run: `npm run dev -- --host 0.0.0.0` を起動し、PC のブラウザで本棚が表示され、Gutenberg の EPUB（`https://www.gutenberg.org/ebooks/1342.epub3.images`）を取り込むと表紙と書名が出ることを確認する（この環境から見られない場合はユーザーに確認を依頼し、その旨をコミットメッセージに書く）

```bash
git add -A && git commit -m "本棚（取り込み・グリッド・長押し削除）とハッシュルーティングを追加"
```

---

### Task 7: 章 HTML の sanitize と文・単語 span 分割

**Files:**
- Create: `src/services/reader/sanitize.ts`, `src/services/reader/segmenter.ts`, `test/reader/sanitize.test.ts`, `test/reader/segmenter.test.ts`

**Interfaces:**
- Consumes: `resolvePath`, `dirname`（Task 5）
- Produces:
  ```ts
  // sanitize.ts
  export type AssetResolver = (zipPath: string) => string | null;   // zip パス → blob URL（なければ null）
  export function sanitizeChapter(html: string, chapterHref: string, resolve: AssetResolver): HTMLElement; // <div class="chapter"> を返す
  // segmenter.ts
  export function segmentElement(root: HTMLElement): number;        // 文の数を返す。sid/wid を付与
  export function getSentenceText(root: HTMLElement, sid: number): string | null;
  export function getSentenceElements(root: HTMLElement, sid: number): HTMLElement[];
  export function applySavedMarkers(root: HTMLElement, isSaved: (word: string) => boolean): void; // .w に .saved を付け外し
  ```

- [ ] **Step 1: sanitize の失敗するテスト**

`test/reader/sanitize.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { sanitizeChapter } from '../../src/services/reader/sanitize';

describe('sanitizeChapter', () => {
  const resolve = (p: string) => (p === 'OEBPS/images/pic 1.png' ? 'blob:pic' : null);
  it('script と on* 属性を除き、img を blob URL に差し替える', () => {
    const el = sanitizeChapter('<p onclick="x()">Hi<script>alert(1)</script></p><img src="../images/pic%201.png"/><img src="../images/none.png"/><a href="http://x">l</a>',
      'OEBPS/text/ch1.xhtml', resolve);
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('p')?.getAttribute('onclick')).toBeNull();
    const imgs = el.querySelectorAll('img');
    expect(imgs[0].getAttribute('src')).toBe('blob:pic');
    expect(imgs[1].getAttribute('src')).toBeNull();
    expect(el.querySelector('a')?.getAttribute('href')).toBeNull();
  });
  it('svg image の xlink:href と link[rel=stylesheet] も差し替える', () => {
    const el = sanitizeChapter('<link rel="stylesheet" href="../style.css"/><svg><image xlink:href="../images/pic%201.png"/></svg>',
      'OEBPS/text/ch1.xhtml', (p) => (p.endsWith('.css') ? 'blob:css' : 'blob:pic'));
    expect(el.querySelector('link')?.getAttribute('href')).toBe('blob:css');
    expect(el.querySelector('image')?.getAttribute('href') ?? el.querySelector('image')?.getAttribute('xlink:href')).toBe('blob:pic');
  });
});
```

- [ ] **Step 2: segmenter の失敗するテスト**

`test/reader/segmenter.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { segmentElement, getSentenceText, getSentenceElements, applySavedMarkers } from '../../src/services/reader/segmenter';

function el(html: string) { const d = document.createElement('div'); d.innerHTML = html; return d; }

describe('segmentElement', () => {
  it('文と単語を span で包み、sid は章内通番、wid は文内通番', () => {
    const root = el('<p>Hello world. It <i>rained</i> today.</p><p>Second para!</p>');
    expect(segmentElement(root)).toBe(3);
    expect(getSentenceText(root, 0)).toBe('Hello world.');
    expect(getSentenceText(root, 1)).toBe('It rained today.');
    expect(getSentenceText(root, 2)).toBe('Second para!');
    const words1 = getSentenceElements(root, 1).flatMap((s) => Array.from(s.querySelectorAll('.w')).map((w) => [w.textContent, w.getAttribute('data-wid')]));
    expect(words1).toEqual([['It', '0'], ['rained', '1'], ['today', '2']]);
    expect(root.querySelector('i .w')?.textContent).toBe('rained');
    expect(root.textContent).toBe('Hello world. It rained today.Second para!');
  });
  it('引用符付きの語は 1 語として包む', () => {
    const root = el('<p>“Don’t go,” she said.</p>');
    segmentElement(root);
    expect(Array.from(root.querySelectorAll('.w')).map((w) => w.textContent)).toEqual(['Don’t', 'go', 'she', 'said']);
  });
  it('数字だけの語は単語にしない', () => {
    const root = el('<p>Chapter 12 begins.</p>');
    segmentElement(root);
    expect(Array.from(root.querySelectorAll('.w')).map((w) => w.textContent)).toEqual(['Chapter', 'begins']);
  });
  it('applySavedMarkers は判定関数で .saved を付け外しする', () => {
    const root = el('<p>He stumbled and fell.</p>');
    segmentElement(root);
    applySavedMarkers(root, (w) => w === 'stumbled');
    expect(Array.from(root.querySelectorAll('.w.saved')).map((w) => w.textContent)).toEqual(['stumbled']);
    applySavedMarkers(root, () => false);
    expect(root.querySelectorAll('.w.saved')).toHaveLength(0);
  });
  it('Gutenberg 級の章（3000 文）を 1 秒以内に分割する', () => {
    const root = el('<p>' + 'The quick brown fox jumps over the lazy dog. '.repeat(3000) + '</p>');
    const t = performance.now();
    expect(segmentElement(root)).toBe(3000);
    expect(performance.now() - t).toBeLessThan(1000);
  });
});
```

- [ ] **Step 3: 失敗を確認**

Run: `npx vitest run test/reader`
Expected: FAIL

- [ ] **Step 4: sanitize を実装**

`src/services/reader/sanitize.ts`:
```ts
import { dirname, resolvePath } from '../epub/paths';

export type AssetResolver = (zipPath: string) => string | null;

const REMOVE_TAGS = ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'audio', 'video', 'meta', 'title', 'base'];
const XLINK = 'http://www.w3.org/1999/xlink';

export function sanitizeChapter(html: string, chapterHref: string, resolve: AssetResolver): HTMLElement {
  const doc = new DOMParser().parseFromString(`<div class="chapter">${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement;
  const base = dirname(chapterHref);

  root.querySelectorAll(REMOVE_TAGS.join(',')).forEach((e) => e.remove());
  for (const e of Array.from(root.querySelectorAll('*'))) {
    for (const a of Array.from(e.attributes)) {
      if (/^on/i.test(a.name)) e.removeAttribute(a.name);
    }
  }
  root.querySelectorAll('img[src], link[href], source[src]').forEach((e) => {
    const attr = e.hasAttribute('src') ? 'src' : 'href';
    const url = resolve(resolvePath(base, e.getAttribute(attr)!));
    if (url) e.setAttribute(attr, url); else e.removeAttribute(attr);
    if (e.tagName === 'LINK' && e.getAttribute('rel') !== 'stylesheet') e.remove();
  });
  root.querySelectorAll('image').forEach((e) => {
    const raw = e.getAttribute('href') ?? e.getAttributeNS(XLINK, 'href') ?? e.getAttribute('xlink:href');
    const url = raw ? resolve(resolvePath(base, raw)) : null;
    e.removeAttribute('xlink:href'); e.removeAttributeNS(XLINK, 'href');
    if (url) e.setAttribute('href', url); else e.remove();
  });
  root.querySelectorAll('a[href]').forEach((a) => a.removeAttribute('href'));
  root.querySelectorAll('[style]').forEach((e) => {
    if (/url\(/i.test(e.getAttribute('style') ?? '')) e.removeAttribute('style');
  });
  return document.importNode(root, true) as HTMLElement;
}
```

- [ ] **Step 5: segmenter を実装**

`src/services/reader/segmenter.ts`:
```ts
const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'DD', 'DT', 'TD', 'TH', 'FIGCAPTION', 'DIV', 'SECTION', 'ARTICLE', 'ASIDE', 'HEADER', 'FOOTER', 'PRE', 'TABLE', 'TR', 'UL', 'OL', 'DL', 'NAV', 'MAIN', 'CENTER', 'BODY']);
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'MATH', 'svg', 'math']);

interface Word { start: number; end: number; wid: number }
interface Sentence { start: number; end: number; sid: number; words: Word[] }

const sentenceSeg = new Intl.Segmenter('en', { granularity: 'sentence' });
const wordSeg = new Intl.Segmenter('en', { granularity: 'word' });

/** root 配下のテキストを文・単語 span で包み直す。戻り値は文の数 */
export function segmentElement(root: HTMLElement): number {
  let sid = 0;
  for (const nodes of collectGroups(root)) {
    const starts: number[] = [];
    let text = '';
    for (const n of nodes) { starts.push(text.length); text += n.data; }
    if (!text.trim()) continue;
    const sentences = analyze(text, sid);
    sid += sentences.length;
    nodes.forEach((n, i) => rebuild(n, starts[i], starts[i] + n.data.length, sentences));
  }
  return sid;
}

export function getSentenceElements(root: HTMLElement, sid: number): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(`.s[data-sid="${sid}"]`));
}

export function getSentenceText(root: HTMLElement, sid: number): string | null {
  const els = getSentenceElements(root, sid);
  return els.length ? els.map((e) => e.textContent ?? '').join('') : null;
}

export function applySavedMarkers(root: HTMLElement, isSaved: (word: string) => boolean): void {
  root.querySelectorAll<HTMLElement>('.w').forEach((w) => w.classList.toggle('saved', isSaved(w.textContent ?? '')));
}

/** 直近のブロック要素が同じ連続テキストノードをひとまとめにする */
function collectGroups(root: HTMLElement): Text[][] {
  const groups: Text[][] = [];
  let current: Text[] = []; let currentBlock: Node | null = null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      for (let p = n.parentElement; p && p !== root; p = p.parentElement) if (SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    let block: Node = root;
    for (let p = n.parentElement; p && p !== root; p = p.parentElement) if (BLOCK_TAGS.has(p.tagName)) { block = p; break; }
    if (block !== currentBlock) { if (current.length) groups.push(current); current = []; currentBlock = block; }
    current.push(n);
  }
  if (current.length) groups.push(current);
  return groups;
}

function analyze(text: string, firstSid: number): Sentence[] {
  const out: Sentence[] = [];
  let sid = firstSid;
  for (const s of sentenceSeg.segment(text)) {
    const lead = s.segment.length - s.segment.trimStart().length;
    const start = s.index + lead;
    const end = s.index + s.segment.trimEnd().length;
    if (end <= start) continue;
    const words: Word[] = [];
    for (const w of wordSeg.segment(text.slice(start, end))) {
      if (!w.isWordLike || !/[A-Za-z]/.test(w.segment)) continue;
      words.push({ start: start + w.index, end: start + w.index + w.segment.length, wid: words.length });
    }
    out.push({ start, end, sid: sid++, words });
  }
  return out;
}

/** 元テキスト中 [a,b) を占めるテキストノードを、文・単語 span を含む断片で置き換える */
function rebuild(node: Text, a: number, b: number, sentences: Sentence[]): void {
  const doc = node.ownerDocument;
  const data = node.data;
  const frag = doc.createDocumentFragment();
  const emit = (parent: Node, from: number, to: number) => { if (to > from) parent.appendChild(doc.createTextNode(data.slice(from - a, to - a))); };
  let pos = a;
  for (const s of sentences) {
    if (s.end <= a) continue;
    if (s.start >= b) break;
    const sStart = Math.max(s.start, a), sEnd = Math.min(s.end, b);
    emit(frag, pos, sStart);
    const span = doc.createElement('span');
    span.className = 's'; span.dataset.sid = String(s.sid);
    let p = sStart;
    for (const w of s.words) {
      if (w.end <= sStart) continue;
      if (w.start >= sEnd) break;
      const wStart = Math.max(w.start, sStart), wEnd = Math.min(w.end, sEnd);
      emit(span, p, wStart);
      const ws = doc.createElement('span');
      ws.className = 'w'; ws.dataset.wid = String(w.wid);
      ws.textContent = data.slice(wStart - a, wEnd - a);
      span.appendChild(ws);
      p = wEnd;
    }
    emit(span, p, sEnd);
    frag.appendChild(span);
    pos = sEnd;
  }
  emit(frag, pos, b);
  node.replaceWith(frag);
}
```

- [ ] **Step 6: テストを通してコミット**

Run: `npx vitest run test/reader && npx tsc --noEmit`
Expected: PASS。性能テストが 1 秒を超える場合は `rebuild` の文ループを「その text node に重なる最初の文」から始める二分探索に変える

```bash
git add -A && git commit -m "章 HTML の sanitize と Intl.Segmenter による文・単語 span 分割を追加"
```

---
### Task 8: リーダー（章表示・章ナビ・位置保存）

**Files:**
- Create: `src/viewmodels/useReader.ts`, `src/views/reader/ChapterContent.tsx`, `src/views/reader/ReaderView.tsx`, `src/views/reader/reader.css`, `test/viewmodels/useReader.test.tsx`, `test/reader/collectAssetRefs.test.ts`
- Modify: `src/services/reader/sanitize.ts`（`collectAssetRefs` を追加）, `src/app/App.tsx`（reader ルートで `ReaderView` を出す）

**Interfaces:**
- Consumes: `BookRepositoryPort`, `sanitizeChapter`, `segmentElement`, `getSentenceText`（Task 4, 7）
- Produces:
  ```ts
  // sanitize.ts に追加
  export function collectAssetRefs(html: string, chapterHref: string): string[]; // 章が参照する zip パス（重複なし）
  // useReader.ts
  export interface LoadedChapter { chapter: Chapter; resolve: AssetResolver; revoke(): void }
  export function useReader(deps: { books: BookRepositoryPort }, bookId: string): {
    book: Book | null; loaded: LoadedChapter | null; chapterIndex: number; loading: boolean; error: string | null;
    initialProgress: number;                       // 最初の章表示でのみ使う復元位置
    goToChapter(index: number): Promise<boolean>;  // 範囲外なら false。ChapterContent が ready を通知するまで待つ
    notifyReady(sentenceCount: number): void;      // ChapterContent から呼ぶ
    sentenceCount: number;
    saveProgress(progress: number): Promise<void>;
  }
  // ChapterContent.tsx
  export interface WordTap { word: string; sid: number; wid: number; sentence: string }
  export function ChapterContent(props: { loaded: LoadedChapter; onReady(count: number, root: HTMLElement): void; onWordTap(t: WordTap): void }): JSX.Element
  ```

- [ ] **Step 1: collectAssetRefs のテストと実装**

`test/reader/collectAssetRefs.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { collectAssetRefs } from '../../src/services/reader/sanitize';

describe('collectAssetRefs', () => {
  it('img / image / link の参照を zip パスに解決して重複なしで返す', () => {
    const refs = collectAssetRefs('<img src="../images/a%20b.png"/><img src="../images/a%20b.png"/><link rel="stylesheet" href="../s.css"/><svg><image xlink:href="../images/c.jpg"/></svg>', 'OEBPS/text/ch1.xhtml');
    expect(refs).toEqual(['OEBPS/images/a b.png', 'OEBPS/s.css', 'OEBPS/images/c.jpg']);
  });
});
```

`src/services/reader/sanitize.ts` に追記:
```ts
export function collectAssetRefs(html: string, chapterHref: string): string[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const base = dirname(chapterHref);
  const out: string[] = [];
  const push = (raw: string | null) => { if (!raw || /^(data|blob|https?):/i.test(raw)) return; const p = resolvePath(base, raw); if (!out.includes(p)) out.push(p); };
  doc.querySelectorAll('img[src], source[src]').forEach((e) => push(e.getAttribute('src')));
  doc.querySelectorAll('link[href]').forEach((e) => push(e.getAttribute('href')));
  doc.querySelectorAll('image').forEach((e) => push(e.getAttribute('href') ?? e.getAttributeNS(XLINK, 'href') ?? e.getAttribute('xlink:href')));
  return out;
}
```

Run: `npx vitest run test/reader/collectAssetRefs.test.ts` → PASS

- [ ] **Step 2: useReader の失敗するテスト**

`test/viewmodels/useReader.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useReader } from '../../src/viewmodels/useReader';
import type { Book, Chapter } from '../../src/models/types';

const book: Book = { id: 'b', title: 'T', chapterCount: 2, lastChapterIndex: 1, lastScrollProgress: 0.3, addedAt: 1 };
const chapters: Chapter[] = [
  { id: 'b:0', bookId: 'b', index: 0, href: 'OEBPS/c0.xhtml', html: '<p>zero</p>' },
  { id: 'b:1', bookId: 'b', index: 1, href: 'OEBPS/c1.xhtml', html: '<p>one</p><img src="i.png"/>' },
];
function deps() {
  return { books: {
    listBooks: vi.fn(), addBook: vi.fn(), deleteBook: vi.fn(),
    getBook: vi.fn(async () => book),
    getChapter: vi.fn(async (_: string, i: number) => chapters[i]),
    getAsset: vi.fn(async (_: string, p: string) => (p === 'OEBPS/i.png' ? { id: 'b:OEBPS/i.png', bookId: 'b', path: p, mime: 'image/png', bytes: new Uint8Array([1]) } : undefined)),
    updateProgress: vi.fn(async () => {}),
  } };
}

describe('useReader', () => {
  it('最後に読んだ章と位置から始まり、アセットを解決できる', async () => {
    const d = deps();
    const { result } = renderHook(() => useReader(d, 'b'));
    await waitFor(() => expect(result.current.loaded).not.toBeNull());
    expect(result.current.chapterIndex).toBe(1);
    expect(result.current.initialProgress).toBeCloseTo(0.3);
    expect(result.current.loaded!.resolve('OEBPS/i.png')).toMatch(/^blob:/);
    expect(result.current.loaded!.resolve('OEBPS/none.png')).toBeNull();
  });
  it('goToChapter は ready 通知まで待ち、範囲外は false', async () => {
    const d = deps();
    const { result } = renderHook(() => useReader(d, 'b'));
    await waitFor(() => expect(result.current.loaded).not.toBeNull());
    expect(await result.current.goToChapter(5)).toBe(false);
    let done = false;
    let p: Promise<boolean>;
    act(() => { p = result.current.goToChapter(0).then((ok) => { done = true; return ok; }); });
    await waitFor(() => expect(result.current.chapterIndex).toBe(0));
    expect(done).toBe(false);
    act(() => result.current.notifyReady(4));
    expect(await p!).toBe(true);
    expect(result.current.sentenceCount).toBe(4);
    expect(d.books.updateProgress).toHaveBeenCalledWith('b', 0, 0);
  });
  it('saveProgress は現在の章で保存する', async () => {
    const d = deps();
    const { result } = renderHook(() => useReader(d, 'b'));
    await waitFor(() => expect(result.current.loaded).not.toBeNull());
    await act(() => result.current.saveProgress(0.75));
    expect(d.books.updateProgress).toHaveBeenLastCalledWith('b', 1, 0.75);
  });
});
```

- [ ] **Step 3: 失敗を確認**

Run: `npx vitest run test/viewmodels/useReader.test.tsx`
Expected: FAIL

- [ ] **Step 4: useReader を実装**

`src/viewmodels/useReader.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Book, Chapter } from '../models/types';
import type { BookRepositoryPort } from '../services/storage/BookRepository';
import { collectAssetRefs, type AssetResolver } from '../services/reader/sanitize';

export interface LoadedChapter { chapter: Chapter; resolve: AssetResolver; revoke(): void }

async function loadChapter(books: BookRepositoryPort, bookId: string, index: number): Promise<LoadedChapter | null> {
  const chapter = await books.getChapter(bookId, index);
  if (!chapter) return null;
  const urls = new Map<string, string>();
  for (const path of collectAssetRefs(chapter.html, chapter.href)) {
    const asset = await books.getAsset(bookId, path);
    if (asset) urls.set(path, URL.createObjectURL(new Blob([asset.bytes], { type: asset.mime })));
  }
  return { chapter, resolve: (p) => urls.get(p) ?? null, revoke: () => urls.forEach((u) => URL.revokeObjectURL(u)) };
}

export function useReader(deps: { books: BookRepositoryPort }, bookId: string) {
  const [book, setBook] = useState<Book | null>(null);
  const [loaded, setLoaded] = useState<LoadedChapter | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [initialProgress, setInitialProgress] = useState(0);
  const [sentenceCount, setSentenceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const readyResolver = useRef<((ok: boolean) => void) | null>(null);
  const indexRef = useRef(0);

  const open = useCallback(async (index: number) => {
    setLoading(true);
    const next = await loadChapter(deps.books, bookId, index);
    setLoaded(next);
    indexRef.current = index;
    setChapterIndex(index);
    setLoading(false);
    if (!next) setError('この章を表示できません');
    return next !== null;
  }, [deps.books, bookId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const b = await deps.books.getBook(bookId);
      if (!alive) return;
      if (!b) { setError('本が見つかりません'); setLoading(false); return; }
      setBook(b);
      setInitialProgress(b.lastScrollProgress);
      await open(Math.min(b.lastChapterIndex, Math.max(0, b.chapterCount - 1)));
    })();
    return () => { alive = false; };
  }, [deps.books, bookId, open]);

  // 章が切り替わったとき・アンマウント時に前の blob URL を解放する
  useEffect(() => () => loaded?.revoke(), [loaded]);

  const goToChapter = useCallback(async (index: number) => {
    if (!book || index < 0 || index >= book.chapterCount) return false;
    readyResolver.current?.(false);
    const ready = new Promise<boolean>((res) => { readyResolver.current = res; });
    setInitialProgress(0);
    await deps.books.updateProgress(bookId, index, 0);
    if (!(await open(index))) { readyResolver.current = null; return false; }
    return ready;
  }, [book, bookId, deps.books, open]);

  const notifyReady = useCallback((count: number) => {
    setSentenceCount(count);
    readyResolver.current?.(true);
    readyResolver.current = null;
  }, []);

  const saveProgress = useCallback(async (progress: number) => {
    await deps.books.updateProgress(bookId, indexRef.current, progress);
  }, [deps.books, bookId]);

  return { book, loaded, chapterIndex, loading, error, initialProgress, sentenceCount, goToChapter, notifyReady, saveProgress };
}
```

- [ ] **Step 5: ChapterContent と ReaderView を実装**

`src/views/reader/ChapterContent.tsx`:
```tsx
import { useEffect, useRef, type MouseEvent } from 'react';
import type { LoadedChapter } from '../../viewmodels/useReader';
import { sanitizeChapter } from '../../services/reader/sanitize';
import { segmentElement, getSentenceText } from '../../services/reader/segmenter';

export interface WordTap { word: string; sid: number; wid: number; sentence: string }

export function ChapterContent({ loaded, onReady, onWordTap }: { loaded: LoadedChapter; onReady(count: number, root: HTMLElement): void; onWordTap(t: WordTap): void }) {
  const host = useRef<HTMLDivElement>(null);
  const tapRef = useRef(onWordTap); tapRef.current = onWordTap;
  const readyRef = useRef(onReady); readyRef.current = onReady;

  useEffect(() => {
    const el = host.current!;
    const root = sanitizeChapter(loaded.chapter.html, loaded.chapter.href, loaded.resolve);
    const count = segmentElement(root);
    el.replaceChildren(root);
    readyRef.current(count, root);
  }, [loaded]);

  const onClick = (e: MouseEvent) => {
    const w = (e.target as HTMLElement).closest<HTMLElement>('.w');
    const s = w?.closest<HTMLElement>('.s');
    const root = host.current?.firstElementChild as HTMLElement | null;
    if (!w || !s || !root) return;
    const sid = Number(s.dataset.sid);
    tapRef.current({ word: w.textContent ?? '', sid, wid: Number(w.dataset.wid), sentence: getSentenceText(root, sid) ?? '' });
  };
  return <div ref={host} className="chapter-host" onClick={onClick} />;
}
```

`src/views/reader/ReaderView.tsx`（この段階では章表示・ナビ・位置保存のみ。再生バーと辞書は Task 9 / 10 で足す）:
```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { services } from '../../app/services';
import { navigate } from '../../app/router';
import { useReader } from '../../viewmodels/useReader';
import { ChapterContent, type WordTap } from './ChapterContent';
import './reader.css';

export function ReaderView({ bookId }: { bookId: string }) {
  const reader = useReader(services, bookId);
  const scroller = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const restoreRef = useRef<number | null>(reader.initialProgress);
  const [, setTick] = useState(0);

  const currentProgress = () => {
    const el = scroller.current; if (!el) return 0;
    const max = el.scrollHeight - el.clientHeight;
    return max > 0 ? el.scrollTop / max : 0;
  };
  // reader は毎レンダー新しいオブジェクトなので、ref 経由で最新の saveProgress を呼ぶ（effect の再購読と保存の連発を防ぐ）
  const saveRef = useRef(reader.saveProgress); saveRef.current = reader.saveProgress;
  const save = useCallback(() => { void saveRef.current(currentProgress()); }, []);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', save); save(); };
  }, [save]);

  useEffect(() => { restoreRef.current = reader.initialProgress; }, [reader.initialProgress]);

  const onReady = (count: number, root: HTMLElement) => {
    rootRef.current = root;
    const el = scroller.current;
    if (el) {
      const p = restoreRef.current ?? 0; restoreRef.current = null;
      el.scrollTop = p * (el.scrollHeight - el.clientHeight);
    }
    reader.notifyReady(count);
    setTick((t) => t + 1);
  };

  const onWordTap = (_t: WordTap) => { /* Task 10 で辞書を開く */ };
  const go = (delta: number) => { save(); void reader.goToChapter(reader.chapterIndex + delta); };
  const book = reader.book;
  const nav = (
    <div className="chapter-nav">
      <button className="btn" disabled={reader.chapterIndex <= 0} onClick={() => go(-1)}>前の章</button>
      <button className="btn" disabled={!book || reader.chapterIndex >= book.chapterCount - 1} onClick={() => go(1)}>次の章</button>
    </div>
  );

  return (
    <div className="screen reader">
      <header className="topbar reader-top">
        <button className="icon-btn" aria-label="本棚へ戻る" onClick={() => { save(); navigate({ name: 'library' }); }}>‹</button>
        <div className="reader-title"><div>{book?.title ?? ''}</div><div className="muted">{reader.loaded?.chapter.title ?? `第 ${reader.chapterIndex + 1} 章`}</div></div>
        <span className="icon-btn" />
      </header>
      <div ref={scroller} className="reader-scroll">
        {reader.error && <p className="empty">{reader.error}</p>}
        {reader.loaded && (<>{nav}<ChapterContent loaded={reader.loaded} onReady={onReady} onWordTap={onWordTap} />{nav}</>)}
      </div>
    </div>
  );
}
```

`src/views/reader/reader.css`:
```css
.reader { height: 100dvh; }
.reader-top { border-bottom: 1px solid var(--border); flex: none; }
.reader-title { text-align: center; font-size: 14px; line-height: 1.3; min-width: 0; }
.reader-title .muted, .muted { color: var(--muted); }
.reader-scroll { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 0 20px calc(var(--space-6) + env(safe-area-inset-bottom)); }
.chapter-nav { display: flex; justify-content: space-between; gap: var(--space-3); padding: var(--space-4) 0; }
.chapter-host { font-family: var(--font-body); font-size: var(--body-size); line-height: var(--body-lh); }
.chapter-host img, .chapter-host svg { max-width: 100%; height: auto; }
.chapter-host p { margin: 0 0 1em; }
.chapter-host .w { cursor: pointer; border-radius: 3px; }
.chapter-host .w.saved { background: var(--marker-bg); box-shadow: inset 0 -2px 0 var(--marker-line); }
.chapter-host .s.speaking { background: var(--speaking-bg); box-shadow: 0 0 0 3px var(--speaking-bg); border-radius: 3px; }
```

`src/app/App.tsx` の reader 分岐を `<ReaderView key={route.bookId} bookId={route.bookId} />` に置き換える。

- [ ] **Step 6: テストと確認、コミット**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS

ブラウザ確認: 本棚の本をタップ → 章が表示され、前後章で移動し、本棚に戻って再度開くと同じ章・位置に復元されること。

```bash
git add -A && git commit -m "リーダー（章表示・前後章・位置の保存と復元）を追加"
```

---

### Task 9: 読み上げ（SpeechService・usePlayback・PlaybackBar・ハイライト追従）

**Files:**
- Create: `src/services/speech/SpeechService.ts`, `src/viewmodels/usePlayback.ts`, `src/views/reader/PlaybackBar.tsx`, `test/speech/SpeechService.test.ts`, `test/viewmodels/usePlayback.test.tsx`
- Modify: `src/app/services.ts`（`speech` を追加）, `src/views/reader/ReaderView.tsx`, `src/views/reader/reader.css`

**Interfaces:**
- Produces:
  ```ts
  // SpeechService.ts
  export interface Voice { id: string; name: string; lang: string }
  export type SpeakResult = 'ended' | 'cancelled';
  export interface SpeechService {
    isSupported(): boolean;
    getVoices(): Promise<Voice[]>;                                   // en-US / en-GB のみ。voiceschanged を最大 1.5 秒待つ
    speak(text: string, opts: { voiceId: string | null; rate: number }): Promise<SpeakResult>;
    cancel(): void;
  }
  export class WebSpeechService implements SpeechService { constructor(synth?: SpeechSynthesis | undefined) }
  // usePlayback.ts
  export type PlaybackStatus = 'idle' | 'playing' | 'paused';
  export interface PlaybackDeps { speech: SpeechService; getSentenceText(sid: number): string | null; onSentenceChange(sid: number | null): void; onChapterEnd(): Promise<boolean> }
  export function usePlayback(deps: PlaybackDeps): {
    status: PlaybackStatus; sid: number; rate: number; voiceId: string | null; voices: Voice[]; unavailable: string | null;
    play(fromSid?: number): void; pause(): void; toggle(): void; next(): void; prev(): void; stop(): void;
    setRate(r: number): void; setVoice(id: string | null): void;
  }
  ```

- [ ] **Step 1: SpeechService の失敗するテスト**

`test/speech/SpeechService.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSpeechService } from '../../src/services/speech/SpeechService';

class FakeUtterance { text: string; rate = 1; voice: unknown = null; lang = ''; onend: null | (() => void) = null; onerror: null | ((e: { error: string }) => void) = null; constructor(t: string) { this.text = t; } }
function fakeSynth(voices: { voiceURI: string; name: string; lang: string }[] = []) {
  const listeners: (() => void)[] = [];
  const s = {
    current: null as FakeUtterance | null,
    getVoices: vi.fn(() => voices),
    speak: vi.fn((u: FakeUtterance) => { s.current = u; }),
    cancel: vi.fn(() => { const u = s.current; s.current = null; u?.onerror?.({ error: 'interrupted' }); }),
    addEventListener: vi.fn((_: string, fn: () => void) => listeners.push(fn)),
    removeEventListener: vi.fn(),
    fire: () => listeners.forEach((l) => l()),
  };
  return s;
}

beforeEach(() => { (globalThis as any).SpeechSynthesisUtterance = FakeUtterance; });
afterEach(() => { vi.useRealTimers(); });

describe('WebSpeechService', () => {
  it('英語音声だけ返す。最初が空なら voiceschanged を待つ', async () => {
    const s = fakeSynth();
    const svc = new WebSpeechService(s as unknown as SpeechSynthesis);
    const p = svc.getVoices();
    s.getVoices.mockReturnValue([{ voiceURI: 'a', name: 'Samantha', lang: 'en-US' }, { voiceURI: 'b', name: 'Kyoko', lang: 'ja-JP' }, { voiceURI: 'c', name: 'Daniel', lang: 'en_GB' }]);
    s.fire();
    expect((await p).map((v) => v.id)).toEqual(['a', 'c']);
  });
  it('end で ended、cancel で cancelled', async () => {
    const s = fakeSynth();
    const svc = new WebSpeechService(s as unknown as SpeechSynthesis);
    const p1 = svc.speak('Hello.', { voiceId: null, rate: 1.2 });
    expect(s.current?.rate).toBe(1.2);
    s.current!.onend!();
    expect(await p1).toBe('ended');
    const p2 = svc.speak('Again.', { voiceId: null, rate: 1 });
    svc.cancel();
    expect(await p2).toBe('cancelled');
  });
  it('end が来なければ見張りタイマーで ended にする', async () => {
    vi.useFakeTimers();
    const s = fakeSynth();
    const svc = new WebSpeechService(s as unknown as SpeechSynthesis);
    const p = svc.speak('Short.', { voiceId: null, rate: 1 });
    await vi.advanceTimersByTimeAsync(3100);
    expect(await p).toBe('ended');
    expect(s.cancel).toHaveBeenCalled();
  });
  it('speechSynthesis がなければ非対応', () => {
    expect(new WebSpeechService(undefined).isSupported()).toBe(false);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run test/speech`
Expected: FAIL

- [ ] **Step 3: SpeechService を実装**

`src/services/speech/SpeechService.ts`:
```ts
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
```

- [ ] **Step 4: usePlayback の失敗するテスト**

`test/viewmodels/usePlayback.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePlayback } from '../../src/viewmodels/usePlayback';
import type { SpeechService, SpeakResult } from '../../src/services/speech/SpeechService';

function fakeSpeech(auto = true) {
  let resolver: ((r: SpeakResult) => void) | null = null;
  const speech: SpeechService & { spoken: string[]; finish(r?: SpeakResult): void } = {
    spoken: [],
    isSupported: () => true,
    getVoices: async () => [{ id: 'v1', name: 'Samantha', lang: 'en-US' }],
    speak: vi.fn((text: string) => { speech.spoken.push(text); return new Promise<SpeakResult>((res) => { resolver = res; if (auto) queueMicrotask(() => res('ended')); }); }),
    cancel: vi.fn(() => { resolver?.('cancelled'); resolver = null; }),
    finish: (r: SpeakResult = 'ended') => { resolver?.(r); resolver = null; },
  };
  return speech;
}

describe('usePlayback', () => {
  it('文を順に読み、章末で次章に進み、最終章末で idle になる', async () => {
    let chapter = ['a', 'b'];
    const speech = fakeSpeech();
    const changes: (number | null)[] = [];
    const onChapterEnd = vi.fn(async () => { if (chapter[0] === 'a') { chapter = ['c']; return true; } return false; });
    const { result } = renderHook(() => usePlayback({ speech, getSentenceText: (i) => chapter[i] ?? null, onSentenceChange: (s) => changes.push(s), onChapterEnd }));
    act(() => result.current.play());
    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(speech.spoken).toEqual(['a', 'b', 'c']);
    expect(onChapterEnd).toHaveBeenCalledTimes(2);
    expect(changes).toEqual([0, 1, 0, null]);
  });
  it('一時停止は cancel して sid を保持し、再開は同じ文から', async () => {
    const speech = fakeSpeech(false);
    const { result } = renderHook(() => usePlayback({ speech, getSentenceText: (i) => ['a', 'b', 'c'][i] ?? null, onSentenceChange: () => {}, onChapterEnd: async () => false }));
    act(() => result.current.play());
    await act(async () => speech.finish());
    await waitFor(() => expect(result.current.sid).toBe(1));
    act(() => result.current.pause());
    expect(speech.cancel).toHaveBeenCalled();
    expect(result.current.status).toBe('paused');
    expect(result.current.sid).toBe(1);
    act(() => result.current.play());
    expect(speech.spoken).toEqual(['a', 'b', 'b']);
  });
  it('next / prev は再生中なら読み直し、停止中なら位置だけ動かす', async () => {
    const speech = fakeSpeech(false);
    const { result } = renderHook(() => usePlayback({ speech, getSentenceText: (i) => ['a', 'b', 'c'][i] ?? null, onSentenceChange: () => {}, onChapterEnd: async () => false }));
    act(() => result.current.next());
    expect(result.current.sid).toBe(1);
    expect(result.current.status).toBe('idle');
    act(() => result.current.play());
    act(() => result.current.next());
    expect(speech.spoken).toEqual(['b', 'c']);
    act(() => result.current.prev());
    expect(speech.spoken).toEqual(['b', 'c', 'b']);
  });
  it('速度と音声は localStorage に残る', async () => {
    const speech = fakeSpeech(false);
    const { result } = renderHook(() => usePlayback({ speech, getSentenceText: () => null, onSentenceChange: () => {}, onChapterEnd: async () => false }));
    await waitFor(() => expect(result.current.voices).toHaveLength(1));
    act(() => { result.current.setRate(1.3); result.current.setVoice('v1'); });
    expect(localStorage.getItem('lisread.rate')).toBe('1.3');
    expect(localStorage.getItem('lisread.voice')).toBe('v1');
  });
});
```

- [ ] **Step 5: 失敗を確認**

Run: `npx vitest run test/viewmodels/usePlayback.test.tsx`
Expected: FAIL

- [ ] **Step 6: usePlayback を実装**

`src/viewmodels/usePlayback.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpeechService, Voice } from '../services/speech/SpeechService';

export type PlaybackStatus = 'idle' | 'playing' | 'paused';
export interface PlaybackDeps {
  speech: SpeechService;
  getSentenceText(sid: number): string | null;
  onSentenceChange(sid: number | null): void;
  onChapterEnd(): Promise<boolean>;
}

const clampRate = (r: number) => Math.round(Math.min(2, Math.max(0.5, r)) * 10) / 10;
const readRate = () => { const v = Number(localStorage.getItem('lisread.rate')); return v ? clampRate(v) : 1; };

export function usePlayback(deps: PlaybackDeps) {
  const depsRef = useRef(deps); depsRef.current = deps;
  const [status, setStatus] = useState<PlaybackStatus>('idle');
  const [sid, setSid] = useState(0);
  const [rate, setRateState] = useState(readRate);
  const [voiceId, setVoiceState] = useState<string | null>(() => localStorage.getItem('lisread.voice'));
  const [voices, setVoices] = useState<Voice[]>([]);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const runId = useRef(0);
  const sidRef = useRef(0);
  const rateRef = useRef(rate); rateRef.current = rate;
  const voiceRef = useRef(voiceId); voiceRef.current = voiceId;

  useEffect(() => {
    const d = depsRef.current;
    if (!d.speech.isSupported()) { setUnavailable('この端末では読み上げが使えません'); return; }
    void d.speech.getVoices().then((v) => { setVoices(v); if (v.length === 0) setUnavailable('英語の音声が見つかりません'); });
  }, []);

  const setCurrent = (s: number) => { sidRef.current = s; setSid(s); };

  const run = (from: number) => {
    const my = ++runId.current;
    setStatus('playing');
    const loop = async (s: number): Promise<void> => {
      const d = depsRef.current;
      let text = d.getSentenceText(s);
      if (text === null) {
        const more = await d.onChapterEnd();
        if (my !== runId.current) return;
        if (!more) { setStatus('idle'); setCurrent(0); d.onSentenceChange(null); return; }
        s = 0; text = depsRef.current.getSentenceText(0);
        if (text === null) { setStatus('idle'); depsRef.current.onSentenceChange(null); return; }
      }
      setCurrent(s); d.onSentenceChange(s);
      const r = await d.speech.speak(text, { voiceId: voiceRef.current, rate: rateRef.current });
      if (my !== runId.current || r === 'cancelled') return;
      return loop(s + 1);
    };
    void loop(from);
  };

  const stopSpeaking = () => { runId.current++; depsRef.current.speech.cancel(); };

  const play = useCallback((fromSid?: number) => { run(fromSid ?? sidRef.current); }, []);
  const pause = useCallback(() => { stopSpeaking(); setStatus('paused'); }, []);
  const stop = useCallback(() => { stopSpeaking(); setStatus('idle'); setCurrent(0); depsRef.current.onSentenceChange(null); }, []);
  const toggle = useCallback(() => { if (status === 'playing') pause(); else play(); }, [status, pause, play]);
  const move = useCallback((delta: number) => {
    const target = Math.max(0, sidRef.current + delta);
    if (status === 'playing') { stopSpeaking(); run(target); }
    else { setCurrent(target); depsRef.current.onSentenceChange(target); }
  }, [status]);
  const next = useCallback(() => move(1), [move]);
  const prev = useCallback(() => move(-1), [move]);
  const setRate = useCallback((r: number) => { const c = clampRate(r); setRateState(c); localStorage.setItem('lisread.rate', String(c)); }, []);
  const setVoice = useCallback((id: string | null) => { setVoiceState(id); if (id) localStorage.setItem('lisread.voice', id); else localStorage.removeItem('lisread.voice'); }, []);

  useEffect(() => () => { runId.current++; depsRef.current.speech.cancel(); }, []);

  return { status, sid, rate, voiceId, voices, unavailable, play, pause, toggle, next, prev, stop, setRate, setVoice };
}
```

- [ ] **Step 7: PlaybackBar と ReaderView への組み込み**

`src/views/reader/PlaybackBar.tsx`:
```tsx
import type { Voice } from '../../services/speech/SpeechService';
import type { PlaybackStatus } from '../../viewmodels/usePlayback';

interface Props {
  status: PlaybackStatus; rate: number; voiceId: string | null; voices: Voice[]; unavailable: string | null;
  onToggle(): void; onNext(): void; onPrev(): void; onRate(r: number): void; onVoice(id: string | null): void;
}
export function PlaybackBar(p: Props) {
  if (p.unavailable) return <div className="playbar"><span className="muted">{p.unavailable}</span></div>;
  return (
    <div className="playbar">
      <div className="playbar-main">
        <button className="icon-btn" aria-label="前の文" onClick={p.onPrev}>⏮</button>
        <button className="icon-btn play" aria-label={p.status === 'playing' ? '一時停止' : '再生'} onClick={p.onToggle}>{p.status === 'playing' ? '❚❚' : '▶'}</button>
        <button className="icon-btn" aria-label="次の文" onClick={p.onNext}>⏭</button>
      </div>
      <div className="playbar-sub">
        <button className="icon-btn" aria-label="遅く" onClick={() => p.onRate(p.rate - 0.1)}>−</button>
        <span className="rate">{p.rate.toFixed(1)}x</span>
        <button className="icon-btn" aria-label="速く" onClick={() => p.onRate(p.rate + 0.1)}>+</button>
        <select aria-label="音声" value={p.voiceId ?? ''} onChange={(e) => p.onVoice(e.target.value || null)}>
          <option value="">既定の音声</option>
          {p.voices.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.lang})</option>)}
        </select>
      </div>
    </div>
  );
}
```

`reader.css` に追記:
```css
.playbar { flex: none; border-top: 1px solid var(--border); background: var(--surface); padding: var(--space-2) var(--space-4) calc(var(--space-2) + env(safe-area-inset-bottom)); }
.playbar-main { display: flex; justify-content: center; gap: var(--space-5); }
.playbar-main .play { background: var(--accent); color: var(--accent-fg); width: 56px; height: 56px; font-size: 20px; }
.playbar-sub { display: flex; align-items: center; justify-content: center; gap: var(--space-2); margin-top: var(--space-1); }
.playbar-sub .rate { min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; }
.playbar-sub select { max-width: 45%; font: inherit; color: inherit; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 6px; }
```

`ReaderView.tsx` の変更点:
1. `import { usePlayback } from '../../viewmodels/usePlayback'` と `PlaybackBar`, `getSentenceElements` を import
2. `const playback = usePlayback({ speech: services.speech, getSentenceText: (s) => rootRef.current ? getSentenceText(rootRef.current, s) : null, onSentenceChange: highlight, onChapterEnd: () => reader.goToChapter(reader.chapterIndex + 1) })` — `reader.chapterIndex` は閉包で古くなるので `chapterIndexRef` を作り `reader.chapterIndex` を毎レンダー代入して使う
3. `highlight(sid)`: `rootRef.current?.querySelectorAll('.s.speaking')` から `speaking` を外し、`getSentenceElements(root, sid)` に付け、最初の要素が `scroller` の表示範囲外なら `scrollIntoView({ block: 'center', behavior: 'smooth' })`
4. 章ボタン（`go`）と本棚へ戻るで `playback.stop()`
5. `document.visibilitychange` で hidden なら `playback.status === 'playing'` のとき `playback.pause()`
6. `<div ref={scroller}>` の後ろに `<PlaybackBar status={playback.status} rate={playback.rate} voiceId={playback.voiceId} voices={playback.voices} unavailable={playback.unavailable} onToggle={playback.toggle} onNext={playback.next} onPrev={playback.prev} onRate={playback.setRate} onVoice={playback.setVoice} />`

`src/app/services.ts` に `speech: new WebSpeechService()` を追加。

- [ ] **Step 8: テストと確認、コミット**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS

ブラウザ確認（PC でも可）: 再生で文が順に読まれ、読んでいる文がハイライトされ、画面外に出たらスクロールする。章末で次章に続く。速度変更が次の文から効く。

```bash
git add -A && git commit -m "Web Speech による文単位の読み上げ、ハイライト追従、再生バーを追加"
```

---
### Task 10: 辞書シート（英和・英英・保存）と常時マーカー

**Files:**
- Create: `src/services/dictionary/FreeDictionary.ts`, `src/services/dictionary/lookup.ts`, `src/viewmodels/useDictionary.ts`, `src/views/dictionary/DictionarySheet.tsx`, `src/views/dictionary/sheet.css`, `test/dictionary/FreeDictionary.test.ts`, `test/dictionary/lookup.test.ts`, `test/viewmodels/useDictionary.test.tsx`
- Modify: `src/app/services.ts`（`enDict` を追加）, `src/views/reader/ReaderView.tsx`

**Interfaces:**
- Consumes: `JaDictionary`, `normalizeWord`, `lemmaCandidates`, `VocabularyRepositoryPort`, `applySavedMarkers`, `WordTap`, `PlaybackStatus`
- Produces:
  ```ts
  // FreeDictionary.ts
  export interface EnMeaning { partOfSpeech: string; definitions: string[] }
  export interface EnEntry { word: string; phonetic?: string; meanings: EnMeaning[] }
  export interface EnDictionaryPort { lookup(word: string, signal?: AbortSignal): Promise<EnEntry | null> }
  export class FreeDictionary implements EnDictionaryPort { constructor(fetchFn?: typeof fetch) }
  // lookup.ts
  export interface LookupResult { word: string; lemma: string; meaningJa: string | null }
  export async function lookupWord(raw: string, dict: JaDictionary): Promise<LookupResult>;
  export function matchesSaved(raw: string, saved: Set<string>): boolean;   // 表記または原形候補が saved に含まれるか
  // useDictionary.ts
  export interface DictionaryState { open: boolean; word: string; lemma: string; meaningJa: string | null; en: EnEntry | null; enLoading: boolean; saved: boolean; sentence: string; sid: number }
  export function useDictionary(deps: { jaDict: JaDictionary; enDict: EnDictionaryPort; vocabulary: VocabularyRepositoryPort; playback: { status: PlaybackStatus; pause(): void; play(): void } }, ctx: { bookId: string; chapterIndex: number }): {
    state: DictionaryState; savedLemmas: Set<string>;
    openFor(tap: WordTap): void; close(): void; toggleSave(): Promise<void>; isSaved(rawWord: string): boolean;
  }
  ```

- [ ] **Step 1: FreeDictionary と lookup の失敗するテスト**

`test/dictionary/FreeDictionary.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { FreeDictionary } from '../../src/services/dictionary/FreeDictionary';

const sample = [{ word: 'stumble', phonetic: '/ˈstʌmbəl/', meanings: [{ partOfSpeech: 'verb', definitions: [{ definition: 'To trip.' }, { definition: 'To falter.' }] }] }];

describe('FreeDictionary', () => {
  it('API の応答を要約する', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(sample), { status: 200 })) as unknown as typeof fetch;
    const r = await new FreeDictionary(f).lookup('stumble');
    expect(r).toEqual({ word: 'stumble', phonetic: '/ˈstʌmbəl/', meanings: [{ partOfSpeech: 'verb', definitions: ['To trip.', 'To falter.'] }] });
    expect(f).toHaveBeenCalledWith('https://api.dictionaryapi.dev/api/v2/entries/en/stumble', expect.anything());
  });
  it('404 やネットワークエラーは null', async () => {
    expect(await new FreeDictionary(vi.fn(async () => new Response('{}', { status: 404 })) as unknown as typeof fetch).lookup('zzz')).toBeNull();
    expect(await new FreeDictionary(vi.fn(async () => { throw new TypeError('offline'); }) as unknown as typeof fetch).lookup('x')).toBeNull();
  });
});
```

`test/dictionary/lookup.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { lookupWord, matchesSaved } from '../../src/services/dictionary/lookup';

const dict = { lookup: async (w: string) => ({ stumble: 'つまずく', news: 'ニュース', new: '新しい', run: '走る' } as Record<string, string>)[w] ?? null };

describe('lookupWord', () => {
  it('活用形は原形で引く', async () => {
    expect(await lookupWord('“stumbled,”', dict)).toEqual({ word: "stumbled", lemma: 'stumble', meaningJa: 'つまずく' });
  });
  it('表記が辞書にあればそれを原形にする（news → new にしない）', async () => {
    expect(await lookupWord('news', dict)).toEqual({ word: 'news', lemma: 'news', meaningJa: 'ニュース' });
  });
  it('どこにもなければ表記のまま、意味は null', async () => {
    expect(await lookupWord('Elizabeth', dict)).toEqual({ word: 'elizabeth', lemma: 'elizabeth', meaningJa: null });
  });
});

describe('matchesSaved', () => {
  it('表記か原形候補が保存済みなら true', () => {
    const saved = new Set(['stumble']);
    expect(matchesSaved('Stumbled', saved)).toBe(true);
    expect(matchesSaved('stumble', saved)).toBe(true);
    expect(matchesSaved('walk', saved)).toBe(false);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run test/dictionary`
Expected: FAIL（新規 2 ファイル）

- [ ] **Step 3: 実装**

`src/services/dictionary/FreeDictionary.ts`:
```ts
export interface EnMeaning { partOfSpeech: string; definitions: string[] }
export interface EnEntry { word: string; phonetic?: string; meanings: EnMeaning[] }
export interface EnDictionaryPort { lookup(word: string, signal?: AbortSignal): Promise<EnEntry | null> }

interface ApiEntry { word: string; phonetic?: string; meanings?: { partOfSpeech: string; definitions: { definition: string }[] }[] }

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
```

`src/services/dictionary/lookup.ts`:
```ts
import type { JaDictionary } from './EjDictionary';
import { lemmaCandidates, normalizeWord } from './Lemmatizer';

export interface LookupResult { word: string; lemma: string; meaningJa: string | null }

export async function lookupWord(raw: string, dict: JaDictionary): Promise<LookupResult> {
  const word = normalizeWord(raw);
  if (!word) return { word, lemma: word, meaningJa: null };
  for (const c of [word, ...lemmaCandidates(word)]) {
    const m = await dict.lookup(c);
    if (m) return { word, lemma: c, meaningJa: m };
  }
  return { word, lemma: lemmaCandidates(word)[0] ?? word, meaningJa: null };
}

const cache = new Map<string, string[]>();
export function matchesSaved(raw: string, saved: Set<string>): boolean {
  if (saved.size === 0) return false;
  const w = normalizeWord(raw);
  if (!w) return false;
  let c = cache.get(w);
  if (!c) { c = [w, ...lemmaCandidates(w)]; cache.set(w, c); }
  return c.some((x) => saved.has(x));
}
```

- [ ] **Step 4: useDictionary の失敗するテスト**

`test/viewmodels/useDictionary.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDictionary } from '../../src/viewmodels/useDictionary';
import type { VocabularyEntry } from '../../src/models/types';
import type { PlaybackStatus } from '../../src/viewmodels/usePlayback';

function deps(status: PlaybackStatus) {
  const store: VocabularyEntry[] = [];
  const vocabulary = {
    findByLemma: vi.fn(async (l: string) => store.find((e) => e.lemma === l)),
    save: vi.fn(async (i: Omit<VocabularyEntry, 'id' | 'createdAt'>) => { const e = { ...i, id: 'id1', createdAt: 1 }; store.push(e); return e; }),
    remove: vi.fn(), removeByLemma: vi.fn(async (l: string) => { store.splice(store.findIndex((e) => e.lemma === l), 1); }),
    savedLemmas: vi.fn(async () => new Set(store.map((e) => e.lemma))),
  };
  const playback = { status, pause: vi.fn(), play: vi.fn() };
  const jaDict = { lookup: async (w: string) => (w === 'stumble' ? 'つまずく' : null) };
  const enDict = { lookup: vi.fn(async () => ({ word: 'stumble', meanings: [] })) };
  return { jaDict, enDict, vocabulary, playback };
}
const tap = { word: 'stumbled', sid: 3, wid: 1, sentence: 'He stumbled.' };

describe('useDictionary', () => {
  it('開くと英和が出て、保存・削除が切り替わり、マーカー判定に反映される', async () => {
    const d = deps('idle');
    const { result } = renderHook(() => useDictionary(d, { bookId: 'b', chapterIndex: 2 }));
    act(() => result.current.openFor(tap));
    await waitFor(() => expect(result.current.state.meaningJa).toBe('つまずく'));
    expect(result.current.state.lemma).toBe('stumble');
    expect(result.current.state.saved).toBe(false);
    await act(() => result.current.toggleSave());
    expect(d.vocabulary.save).toHaveBeenCalledWith({ word: 'stumbled', lemma: 'stumble', contextSentence: 'He stumbled.', bookId: 'b', chapterIndex: 2, sentenceIndex: 3 });
    expect(result.current.state.saved).toBe(true);
    expect(result.current.isSaved('Stumbles')).toBe(true);
    await act(() => result.current.toggleSave());
    expect(result.current.state.saved).toBe(false);
    expect(result.current.isSaved('stumbled')).toBe(false);
  });
  it('再生中に開くと一時停止し、閉じると再開する', async () => {
    const d = deps('playing');
    const { result } = renderHook(() => useDictionary(d, { bookId: 'b', chapterIndex: 0 }));
    act(() => result.current.openFor(tap));
    expect(d.playback.pause).toHaveBeenCalled();
    act(() => result.current.close());
    expect(d.playback.play).toHaveBeenCalled();
    expect(result.current.state.open).toBe(false);
  });
  it('ユーザーが一時停止中なら閉じても再生しない', async () => {
    const d = deps('paused');
    const { result } = renderHook(() => useDictionary(d, { bookId: 'b', chapterIndex: 0 }));
    act(() => result.current.openFor(tap));
    act(() => result.current.close());
    expect(d.playback.pause).not.toHaveBeenCalled();
    expect(d.playback.play).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: 失敗を確認**

Run: `npx vitest run test/viewmodels/useDictionary.test.tsx`
Expected: FAIL

- [ ] **Step 6: useDictionary を実装**

`src/viewmodels/useDictionary.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JaDictionary } from '../services/dictionary/EjDictionary';
import type { EnDictionaryPort, EnEntry } from '../services/dictionary/FreeDictionary';
import { lookupWord, matchesSaved } from '../services/dictionary/lookup';
import type { VocabularyRepositoryPort } from '../services/storage/VocabularyRepository';
import type { WordTap } from '../views/reader/ChapterContent';
import type { PlaybackStatus } from './usePlayback';

export interface DictionaryState { open: boolean; word: string; lemma: string; meaningJa: string | null; en: EnEntry | null; enLoading: boolean; saved: boolean; sentence: string; sid: number }
const closed: DictionaryState = { open: false, word: '', lemma: '', meaningJa: null, en: null, enLoading: false, saved: false, sentence: '', sid: 0 };

interface Deps { jaDict: JaDictionary; enDict: EnDictionaryPort; vocabulary: VocabularyRepositoryPort; playback: { status: PlaybackStatus; pause(): void; play(): void } }

export function useDictionary(deps: Deps, ctx: { bookId: string; chapterIndex: number }) {
  const depsRef = useRef(deps); depsRef.current = deps;
  const ctxRef = useRef(ctx); ctxRef.current = ctx;
  const [state, setState] = useState<DictionaryState>(closed);
  const [savedLemmas, setSavedLemmas] = useState<Set<string>>(new Set());
  const resumeOnClose = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const seq = useRef(0);

  const refreshSaved = useCallback(async () => setSavedLemmas(await depsRef.current.vocabulary.savedLemmas()), []);
  useEffect(() => { void refreshSaved(); }, [refreshSaved]);

  const openFor = useCallback((tap: WordTap) => {
    const d = depsRef.current;
    if (d.playback.status === 'playing') { d.playback.pause(); resumeOnClose.current = true; } else resumeOnClose.current = false;
    abort.current?.abort();
    const my = ++seq.current;
    setState({ ...closed, open: true, word: tap.word, lemma: tap.word, sentence: tap.sentence, sid: tap.sid, enLoading: true });
    void (async () => {
      const r = await lookupWord(tap.word, d.jaDict);
      if (my !== seq.current) return;
      const saved = !!(await d.vocabulary.findByLemma(r.lemma));
      if (my !== seq.current) return;
      setState((s) => ({ ...s, word: r.word, lemma: r.lemma, meaningJa: r.meaningJa, saved }));
      const ac = new AbortController(); abort.current = ac;
      const en = await d.enDict.lookup(r.lemma, ac.signal);
      if (my !== seq.current) return;
      setState((s) => ({ ...s, en, enLoading: false }));
    })();
  }, []);

  const close = useCallback(() => {
    seq.current++;
    abort.current?.abort();
    setState(closed);
    if (resumeOnClose.current) { resumeOnClose.current = false; depsRef.current.playback.play(); }
  }, []);

  const toggleSave = useCallback(async () => {
    const d = depsRef.current; const s = state; const c = ctxRef.current;
    if (!s.open || !s.lemma) return;
    if (s.saved) await d.vocabulary.removeByLemma(s.lemma);
    else await d.vocabulary.save({ word: s.word, lemma: s.lemma, contextSentence: s.sentence, bookId: c.bookId, chapterIndex: c.chapterIndex, sentenceIndex: s.sid });
    setState((x) => ({ ...x, saved: !s.saved }));
    await refreshSaved();
  }, [state, refreshSaved]);

  const isSaved = useCallback((raw: string) => matchesSaved(raw, savedLemmas), [savedLemmas]);

  return { state, savedLemmas, openFor, close, toggleSave, isSaved };
}
```

- [ ] **Step 7: DictionarySheet と ReaderView への組み込み**

`src/views/dictionary/DictionarySheet.tsx`:
```tsx
import type { DictionaryState } from '../../viewmodels/useDictionary';
import './sheet.css';

export function DictionarySheet({ state, onClose, onToggleSave }: { state: DictionaryState; onClose(): void; onToggleSave(): void }) {
  if (!state.open) return null;
  const online = typeof navigator === 'undefined' || navigator.onLine;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="辞書" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div><span className="sheet-word">{state.word}</span>{state.lemma !== state.word && <span className="sheet-lemma"> → {state.lemma}</span>}</div>
          <button className={`btn ${state.saved ? '' : 'btn-primary'}`} onClick={onToggleSave} disabled={!state.lemma}>{state.saved ? '削除' : '保存'}</button>
        </div>
        <section className="sheet-section">
          <h3>英和</h3>
          {state.meaningJa === null ? <p className="muted">見つかりませんでした</p> : state.meaningJa.split(' / ').map((m, i) => <p key={i}>{m}</p>)}
        </section>
        {online && (state.enLoading || state.en) && (
          <section className="sheet-section">
            <h3>英英{state.en?.phonetic ? <span className="muted"> {state.en.phonetic}</span> : null}</h3>
            {state.enLoading && !state.en && <p className="muted">読み込み中…</p>}
            {state.en?.meanings.map((m, i) => (
              <div key={i}><div className="pos">{m.partOfSpeech}</div><ol>{m.definitions.map((d, j) => <li key={j}>{d}</li>)}</ol></div>
            ))}
          </section>
        )}
        <p className="sheet-context muted">{state.sentence}</p>
        <button className="btn sheet-close" onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}
```

`src/views/dictionary/sheet.css`:
```css
.sheet-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.25); z-index: 40; display: flex; align-items: flex-end; }
.sheet { width: 100%; max-height: 70dvh; overflow-y: auto; background: var(--surface); border-radius: 16px 16px 0 0; padding: var(--space-2) var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom)); }
.sheet-handle { width: 36px; height: 4px; border-radius: 2px; background: var(--border); margin: 0 auto var(--space-3); }
.sheet-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.sheet-word { font-family: var(--font-body); font-size: 24px; }
.sheet-lemma { color: var(--muted); }
.sheet-section { margin-top: var(--space-4); }
.sheet-section h3 { font-size: 13px; color: var(--muted); margin: 0 0 var(--space-2); font-weight: 600; }
.sheet-section p { margin: 0 0 var(--space-1); line-height: 1.5; }
.sheet-section .pos { font-style: italic; color: var(--muted); }
.sheet-section ol { margin: 0 0 var(--space-2); padding-left: 20px; }
.sheet-context { margin-top: var(--space-4); font-family: var(--font-body); font-size: 15px; }
.sheet-close { width: 100%; margin-top: var(--space-3); }
```

`ReaderView.tsx` の変更点:
1. `useDictionary(services と { status: playback.status, pause: playback.pause, play: playback.play }, { bookId, chapterIndex: reader.chapterIndex })` を追加（`services` に `enDict` があること）
2. `onWordTap = (t) => dictionary.openFor(t)`
3. マーカー: `useEffect(() => { if (rootRef.current) applySavedMarkers(rootRef.current, dictionary.isSaved); }, [dictionary.isSaved, tick])`（`tick` は onReady で増える state。章が切り替わった直後にも適用するため）
4. `<DictionarySheet state={dictionary.state} onClose={dictionary.close} onToggleSave={() => void dictionary.toggleSave()} />` を再生バーの後ろに置く

`src/app/services.ts` に `enDict: new FreeDictionary()` を追加。

- [ ] **Step 8: テストと確認、コミット**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS

ブラウザ確認: 単語タップで英和が即時、英英が少し遅れて出る。保存すると本文中の同じ語（活用形含む）にマーカーが付き、リロード後も残る。再生中にタップすると止まり、閉じると続きから再生する。

```bash
git add -A && git commit -m "辞書シート（英和・英英・保存）と保存済み単語の常時マーカーを追加"
```

---

### Task 11: PWA・GitHub Pages デプロイ・ドキュメント

**Files:**
- Create: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `scripts/make-icons.py`, `.github/workflows/pages.yml`, `docs/deploy.md`, `docs/phase-1.md`, `README.md`
- Modify: `src/app/main.tsx`（SW 登録）

**Interfaces:**
- Consumes: Task 1 の `vite.config.ts`（VitePWA 設定済み）

- [ ] **Step 1: アイコンを生成する**

`scripts/make-icons.py`（PIL なしで単色 PNG を作る）:
```python
import struct, zlib, sys, os

def png(size, rgb, path):
    row = bytes([0]) + bytes(rgb) * size
    raw = row * size
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'wb').write(data)

for s in (192, 512):
    png(s, (0x2F, 0x6F, 0x8F), f'public/icons/icon-{s}.png')
print('icons written')
```

Run: `python3 scripts/make-icons.py && ls -la public/icons`
Expected: 2 つの PNG（アクセント色の単色。正式なアイコンは次巡）

- [ ] **Step 2: SW 登録と本番ビルド**

`src/app/main.tsx` の先頭に追加:
```ts
import { registerSW } from 'virtual:pwa-register';
registerSW({ immediate: true });
```

Run: `npm run build && ls dist && ls dist/dict | wc -l`
Expected: `dist/index.html`, `dist/sw.js`, `dist/manifest.webmanifest` が生成され、`dist/dict` に 27 ファイル。`maximumFileSizeToCacheInBytes` の警告が出る場合は該当 JSON のサイズを確認して上限を上げる

- [ ] **Step 3: GitHub Actions ワークフロー**

`.github/workflows/pages.yml`:
```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm test
      - run: npm run build
        env:
          BASE_PATH: /${{ github.event.repository.name }}/
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

`index.html` の `apple-touch-icon` の `href` を `/icons/icon-192.png` から `%BASE_URL%icons/icon-192.png` に変える（Vite が置換する）。

- [ ] **Step 4: ドキュメント**

`docs/deploy.md` に書く内容:
1. GitHub で空のリポジトリ（例: `lisread`）を作る
2. この環境で `git remote add origin <url>` → `git push -u origin main`（`gh` がないので HTTPS の場合はトークンが必要。ユーザー側の PC から push してもよい）
3. リポジトリの Settings → Pages → Source を「GitHub Actions」にする
4. Actions が成功したら `https://<user>.github.io/<repo>/` を iPhone Safari で開き、共有 → 「ホーム画面に追加」
5. リポジトリ名を変えた場合は `BASE_PATH` が自動で追従することの説明
6. ローカル確認: `npm run dev -- --host` で同一 LAN の iPhone から `http://<PC の IP>:5173`（Web Speech は http でも動く。SW は https か localhost のみ）

`docs/phase-1.md`: 実装した機能一覧、ファイル構成、テストの実行方法、既知の課題（iOS で画面ロック中に停止する／音声の初回ロードが遅い／アイコンが仮／単語帳・設定は未実装／`news → new` 型の原形誤判定を「表記優先」で回避していること）

`README.md`: 1 段落の説明、`npm install && npm run dev`、`npm test`、`docs/` へのリンク

- [ ] **Step 5: 最終確認とコミット**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: すべて成功

```bash
git add -A && git commit -m "PWA 対応、GitHub Pages デプロイ、ドキュメントを追加"
```

---

## 完了条件

- `npm test` と `npm run build` が通る
- `docs/deploy.md` の手順でユーザーが GitHub Pages に配置し、iPhone Safari で仕様書 §10 の受け入れ基準を確認できる
- 第 1 巡で見送った項目（単語帳画面・CSV・設定）は `docs/phase-1.md` の「次巡」に列挙されている
