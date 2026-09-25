# Lisread Web 版 設計仕様（第 1 巡）

作成日: 2026-09-25

## 1. 目的と位置づけ

洋書（EPUB）を **聴きながら読み**、引っかかった英単語を **1タップで辞書で調べ**、単語帳に貯める英語多読アプリ。
iOS ネイティブ版の前に Web 版で「実際に使えるか」を検証する。ただし検証後も育てられる作りにする。

- 個人開発・無料・サーバーレス（静的サイト）。アカウント・課金・広告・アナリティクスなし
- 通信は Free Dictionary API のみ。それ以外は完全オフラインで動作する
- 検証環境: iPhone の Safari（GitHub Pages に配置し、ホーム画面に追加して使う）

### 1.1 今回の範囲（第 1 巡）

1. 本棚: EPUB 取り込み、グリッド表示、削除、最終位置から開く
2. リーダー: 章の縦スクロール表示、文・単語の span 分割、前後章ナビ、位置保存
3. 読み上げ: 文単位のキュー再生、文ハイライト追従と自動スクロール、前後の文、速度、音声選択
4. 辞書: 単語 1 タップ → 原形・英和・英英（非同期）のシート。保存/削除。保存済み単語の常時マーカー

### 1.2 次巡以降に回すもの

単語帳画面、CSV エクスポート、設定画面（フォントサイズ・テーマ手動切替・行間）、iPad/PC レイアウト最適化

### 1.3 実装しないもの

横ページめくり、SRS/クイズ、同期、DRM/PDF/MOBI、外部 TTS・音声書き出し、発音記号・語源・例文生成

## 2. 技術スタック

| 用途 | 採用 | 備考 |
|---|---|---|
| ビルド / UI | Vite + React 18 + TypeScript | 状態は hooks のみ。状態管理ライブラリなし |
| 永続化 | Dexie（IndexedDB） | 実行時依存 1 |
| EPUB 展開 | JSZip | 実行時依存 2 |
| XHTML 解析 | `DOMParser`（標準） | |
| 文・単語分割 | `Intl.Segmenter`（標準） | iOS Safari 14.1+ |
| 原形化 | wink-lemmatizer | 実行時依存 3。NaturalLanguage の代替 |
| 読み上げ | Web Speech API `speechSynthesis` | 外部 TTS なし |
| 英和辞書 | ejdict-hanashi（CC0）を頭文字別 JSON に分割し同梱 | 約 4.4MB、gzip 1.8MB |
| 英英辞書 | Free Dictionary API | オンライン時のみ、キー不要 |
| PWA | vite-plugin-pwa（開発依存） | オフライン動作・ホーム画面追加 |
| テスト | Vitest + jsdom | この Linux 環境で実行できる |
| 配布 | GitHub Actions → GitHub Pages | `main` push で自動配置 |

実行時依存は上記 3 つから増やさない。

## 3. ディレクトリ構成

```
Lisread/
  index.html
  vite.config.ts
  package.json
  scripts/build-dict.ts        # TSV → public/dict/{a..z}.json
  data/ejdict.tsv              # 辞書の元データ（リポジトリに含める）
  public/dict/                 # ビルド前スクリプトで生成（gitignore）
  public/manifest.webmanifest, icons/
  src/
    app/          App.tsx, router（画面切替）, theme.css（トークン）
    models/       types.ts（Book, Chapter, Asset, VocabularyEntry）
    services/
      epub/       EpubParser.ts（container.xml→OPF→spine/metadata/cover）
      storage/    db.ts（Dexie schema）, BookRepository.ts, VocabularyRepository.ts
      speech/     SpeechService.ts（interface + Web Speech 実装）
      dictionary/ Lemmatizer.ts, EjDictionary.ts, FreeDictionary.ts
      reader/     segmenter.ts（DOM を文・単語 span で包む）, sanitize.ts
    views/
      library/    LibraryView.tsx, BookCard.tsx
      reader/     ReaderView.tsx, ChapterContent.tsx, PlaybackBar.tsx
      dictionary/ DictionarySheet.tsx
    viewmodels/   useLibrary.ts, useReader.ts, usePlayback.ts, useDictionary.ts
  docs/
    design/tokens.md
    superpowers/specs/, plans/
  test/           Vitest（services 中心）
```

- Service は interface を切り、viewmodel（hooks）のテストでモック差し替えできるようにする
- 識別子は英語、コメント・コミットメッセージは日本語可

## 4. データモデル（Dexie）

```ts
Book {
  id: string            // crypto.randomUUID()
  title: string
  author?: string
  coverBlob?: Blob
  chapterCount: number
  lastChapterIndex: number       // 既定 0
  lastScrollProgress: number     // 0.0〜1.0、章内スクロール率
  addedAt: number                // epoch ms
  lastOpenedAt?: number
}
Chapter {
  id: string            // `${bookId}:${index}`
  bookId: string
  index: number         // spine 順
  title?: string        // nav / NCX から。なければ undefined
  href: string          // EPUB 内パス（OPF からの相対を解決した zip 内パス）
  html: string          // 取り込み時に展開した XHTML の <body> 内側（sanitize 前）
}
Asset {
  id: string            // `${bookId}:${path}`
  bookId: string
  path: string          // zip 内パス
  mime: string
  blob: Blob
}
VocabularyEntry {
  id: string
  word: string          // 本文中の表記（例: "stumbled"）
  lemma: string         // 原形（例: "stumble"）
  contextSentence: string
  bookId: string
  chapterIndex: number
  sentenceIndex: number // 章内の文番号（data-sid）
  createdAt: number
}
```

インデックス: `chapters: id, bookId, [bookId+index]`、`assets: id, bookId`、`vocabulary: id, lemma, bookId, createdAt`。
保存済み判定は **全書籍横断で lemma 一致**（lemma 単位で一意）。同じ lemma を再保存しようとした場合は既存を返す。

書籍削除時は chapters / assets / vocabulary を同一トランザクションで削除する。

## 5. 各機能の設計

### 5.1 取り込み（EpubParser）

1. `<input type="file" accept=".epub,application/epub+zip">` で受け取る（iOS ではファイル App から選べる）
2. JSZip で展開 → `META-INF/container.xml` → `rootfile` の OPF を読む
3. OPF から `dc:title`, `dc:creator`, 表紙（`meta[name=cover]` の item、または `properties="cover-image"`）、`manifest`, `spine` を取る
4. spine 順に各 XHTML を読み、`<body>` の内側を `Chapter.html` として保存。章タイトルは EPUB3 の nav（`toc` の `<a href>`）または NCX の navPoint を href で突き合わせ、なければ undefined
5. 画像・CSS は `Asset` として保存（フォント等 1 ファイル 5MB 超は除外）
6. 失敗時（zip でない / container.xml がない / OPF がない / spine が空）は例外にメッセージを持たせ、本棚にトーストで表示する

### 5.2 本棚（LibraryView）

- グリッド（2 列）。表紙（なければ書名のプレースホルダ）、書名、著者、進捗%
- 進捗% = `(lastChapterIndex + lastScrollProgress) / chapterCount`
- 長押し（500ms）で削除確認。タップでリーダーへ
- 右上に「取り込み」ボタン

### 5.3 リーダー（ReaderView / ChapterContent）

- 章単位で表示。縦スクロール固定
- 章 HTML を `DOMParser` で読み、`script`, `iframe`, `object`, `on*` 属性, `style` タグ以外の外部参照を除去（sanitize）。`img[src]` と `link[href]` は Asset の blob URL に差し替える。blob URL は章の離脱時に revoke する
- 分割（segmenter）: ブロック要素（p, h1〜h6, li, blockquote, td, div のうち直下にテキストを持つもの）ごとに配下テキストノードを連結し、`Intl.Segmenter('en', {granularity:'sentence'})` で文、その中を `granularity:'word'` かつ `isWordLike` の区間を単語として抽出。テキストノードを分割して `<span class="s" data-sid="N">`、`<span class="w" data-wid="M">` で包む。`sid` は章内通番、`wid` は文内通番。1 文の本文（読み上げ用テキスト）は `span.s` の `textContent` をそのまま使う
- 分割は表示直後に同期で行う。500 ページ級の章でも 1 秒以内を目標にし、超える場合は `requestIdleCallback` で分割する
- 章の先頭・末尾に前章 / 次章ボタン
- 読み上げ中の文に `.speaking` を付け背景色でハイライト。画面外なら `scrollIntoView({block:'center', behavior:'smooth'})`
- 保存済み lemma の単語には `.saved` を付ける（表示時に単語の lemma を計算するとコストが高いので、**保存済み lemma の集合と、その活用形をリーダー側で照合**する。照合は単語の小文字化 → lemmatize → 集合に含まれるか。章あたり数万語で数十 ms 程度。保存/削除のたびに再照合する）
- 離脱時（画面切替・`visibilitychange` の hidden・`pagehide`）に `lastChapterIndex` と `scrollTop / (scrollHeight - clientHeight)` を保存。開くときはその位置へ復元

### 5.4 読み上げ（SpeechService / usePlayback）

- interface `SpeechService { speak(text, opts): Promise<void>; cancel(); pause(); resume(); voices(): Voice[] }`
- 再生状態: `idle | playing | paused`。現在文 `sid`
- 再生: `sid` の文を `speak` し、resolve したら `sid+1` へ。章末なら次章をロードして `sid=0` から続行。最終章末で `idle`
- 一時停止: `speechSynthesis.pause()` ではなく **`cancel()` して現在の sid を保持**する（iOS の pause/resume は不安定なため）。再開は現在文の頭から
- 前の文 / 次の文: `cancel()` して sid を更新し再生
- 速度: 0.5〜2.0、0.1 刻み。`utterance.rate` にそのまま設定（Web Speech は 1.0 が標準速度）
- 音声: `speechSynthesis.getVoices()` から `lang` が `en-US` / `en-GB` のものを列挙。選択は `localStorage` に保存。`voiceschanged` イベントを待ってから列挙する
- 見張り: iOS Safari で utterance の `end` が来ないことがあるため、文の長さから見積もった時間の 3 倍を上限とするタイマーで次へ進める
- 辞書シートを開いたとき `playing` なら一時停止し、閉じたときに自動再開する（`playing` から一時停止した場合のみ）
- タブが hidden になったら一時停止する（iOS では音声が止まるため状態を合わせる）

### 5.5 辞書（DictionarySheet / useDictionary）

- 単語 span のタップ（`click`）で `{word, sid, wid, sentence}` を取得しシートを開く。300ms 以内に英和が出ることを目標にする
- 表示順: ①表記と原形（wink-lemmatizer で動詞・名詞・形容詞の順に試し、辞書にヒットした最初のものを採用。ヒットしなければ表記のまま）②英和（ejdict: 原形 → 表記の順に引く。`/` 区切りをそのまま改行表示）③英英（Free Dictionary API を `fetch`、`AbortController` 5 秒。オフライン・失敗時は表示しない）
- 「保存」で `VocabularyEntry` を作成（文脈は `span.s` 全文）。保存済みなら「削除」に切り替わる
- 下から出るシート。背景タップまたは閉じるボタンで閉じる

### 5.6 英和辞書データ（EjDictionary）

- `data/ejdict.tsv`（`見出し語[, 見出し語…]\t意味`）を `scripts/build-dict.ts` で頭文字別の `public/dict/{a..z}.json`（`Record<string,string>`、見出しは小文字）と `other.json`（英字以外）に分割。カンマ区切りの複数見出しは各見出しに同じ意味を割り当てる
- 初回の検索でその頭文字のファイルを `fetch` してメモリに保持。PWA の precache に含め、オフラインでも引ける

## 6. デザイン

- 静かな UI。本文が主役でコントロールは最小限
- 本文フォント: `ui-serif`（iOS では New York）、UI は `system-ui`
- アクセント 1 色、マーカーはセピア寄りの黄。ライト/ダークは OS 設定に追従（`prefers-color-scheme`）
- トークン（色・タイポグラフィ・余白）は `docs/design/tokens.md` に書き、`src/app/theme.css` の CSS 変数と一致させる
- モック画像は作らず、動くアプリそのものでデザインを確認する

## 7. エラーハンドリング

- 取り込み失敗: 理由付きトースト。DB には何も残さない（トランザクション）
- 章の読み込み失敗: 「この章を表示できません」と次章ボタン
- `speechSynthesis` 非対応 / 英語音声なし: 再生バーに理由を表示し再生を無効化
- 英英 API 失敗: 無表示（エラーを出さない）
- IndexedDB の容量不足: 取り込み時に検知してトースト

## 8. テスト（Vitest）

- EpubParser: 最小 EPUB（container.xml + OPF + 2 章 + 表紙）を JSZip でその場で生成して解析。壊れた入力（zip でない、OPF なし、spine 空）で例外
- segmenter: jsdom 上で `<p>Hello world. <i>Foo</i> bar.</p>` から sid/wid が期待どおりに付くこと（`Intl.Segmenter` は Node 22 で利用可）
- EjDictionary: 分割スクリプトの出力に対して原形 → 表記のフォールバック
- Lemmatizer: `stumbled → stumble`, `running → run`, `books → book`
- usePlayback: SpeechService のモックで、文の終端で次の文に進む・章末で次章へ進む・一時停止が sid を保持する
- VocabularyRepository: lemma の一意性、書籍削除の連鎖

## 9. 配布とデプロイ

- `.github/workflows/pages.yml`: `main` push で `npm ci` → 辞書ビルド → `vite build` → Pages へ配置
- `vite.config.ts` の `base` はリポジトリ名に合わせる（環境変数 `BASE_PATH` で上書き可）
- この環境には `gh` がないため、GitHub リポジトリの作成とリモート追加・push はユーザーが行う。Actions と Pages 設定の手順は `docs/deploy.md` に書く

## 10. 受け入れ基準（第 1 巡完了時）

- [ ] Project Gutenberg の EPUB（Pride and Prejudice）を iPhone Safari で取り込み、表紙と章が正しく出る
- [ ] 読み上げを開始すると文がハイライトされ、画面外に出たら自動スクロールする。章末で次章に続く
- [ ] 本文中の単語を 1 タップで英和の意味が 300ms 以内に出る
- [ ] 単語を保存すると本文中にマーカーが出て、再読み込み後も残る
- [ ] 機内モードでも英英以外の全機能が動く（PWA としてホーム画面に追加した状態）
- [ ] Vitest がすべて通る
