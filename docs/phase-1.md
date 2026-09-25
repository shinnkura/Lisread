# Phase 1（第 1 巡）実装まとめ

## スタック

- Vite 8 / React 19 / TypeScript
- Dexie 4（IndexedDB）
- JSZip 3（EPUB 展開）
- wink-lemmatizer 3（英単語の原形化）
- Web Speech API（読み上げ・SpeechSynthesis）
- `Intl.Segmenter`（文・単語分割）
- vite-plugin-pwa（オフライン対応 / マニフェスト生成）
- Vitest（テスト）

## ディレクトリ構成

```
src/
  app/                    エントリポイント・ルーティング・SW 登録
  models/                 型定義・ドメインモデル
  services/
    epub/                 EPUB 解析・展開
    storage/              Dexie（IndexedDB）アクセス
    speech/               Web Speech 読み上げ制御
    dictionary/           辞書検索（英和・英英）
    reader/                本文の文・単語分割など
  views/
    library/               本棚画面
    reader/                 リーダー画面
    dictionary/             辞書シート
    common/                 共通コンポーネント
  viewmodels/               画面とサービスをつなぐ状態管理
test/                       Vitest によるテスト
scripts/
  build-dict.mjs            data/ejdict.tsv から public/dict/*.json を生成
data/
  ejdict.tsv                 英和辞書データ（ejdict-hanashi, CC0）
public/dict/                 build-dict.mjs が生成する辞書 JSON（git 管理外）
docs/design/tokens.md        デザイントークン
docs/superpowers/specs/2026-09-25-lisread-web-design.md   設計仕様書
docs/superpowers/plans/2026-09-25-lisread-web.md          実装計画
```

## 実装した機能一覧（第 1 巡）

- **本棚**: EPUB 取り込み、表紙付きグリッド表示、長押しでの削除、読書進捗（%）表示
- **リーダー**: 章単位の縦スクロール表示、前後の章への移動、読書位置の保存と復元、本文の文/単語単位での span 分割
- **読み上げ**: Web Speech API による読み上げ、文単位のキュー管理、ハイライト追従と自動スクロール、前の文/次の文への移動、速度 0.5〜2.0 倍、音声選択（en-US / en-GB）、章末で自動的に次章へ進む
- **辞書シート**: 英和（ejdict）、英英（Free Dictionary API）、単語の保存・削除、保存済み単語の本文中での常時マーカー表示
- **PWA**: オフライン動作（Service Worker によるアセットキャッシュ）、ホーム画面への追加

## テストの実行方法

```bash
npm install
npx vitest run       # 単体テスト
npx tsc --noEmit      # 型チェック
npm run build          # 本番ビルド（辞書生成 → 型チェック → vite build）
```

## 既知の課題

- iOS Safari では画面ロック・タブ切替中に読み上げが停止する。再表示後に再生ボタンを押せば続きから再生できる。
- 音声（Voice）リストの初回取得が遅いことがある。
- アイコン（`public/icons/icon-*.png`）は単色の仮アイコン。正式なアイコンは次巡で用意する。
- 単語帳画面・CSV エクスポート・設定画面（フォントサイズ・テーマ手動切替・行間）は次巡で実装する。
- 単語の原形化は「表記が辞書にあれば表記を優先する」方式にしている（`news → new` のような誤変換を防止するため）。
- 表紙画像・本文中の画像は Blob ではなく Uint8Array で IndexedDB に保存している（iOS Safari の IndexedDB 対策）。
- 3000 文の分割性能テストは jsdom 環境では 4 秒の閾値で回帰検知を行っている（実機では 1 秒以内に収まることを確認すること）。
- 保存された文番号が章の文数を超えている場合、最初の `speak` が非同期になり iOS で無音になる可能性がある。
- 端末に英語音声が 1 つもない場合、再生バー全体が無効化される。
- `resolvePath`（EPUB 内リソース解決）は絶対 URL を扱わない。
- 「次の文」「前の文」ボタンを連打した際の `cancel()` 直後の `speak()` の挙動は、実機での確認が必要。
- 画像読み込み前のスクロール復元がずれることがある。
- `other.json` シャードが事実上未使用（アポストロフィ始まりの語のみ対象で該当語がほぼ無い）。
- 英英辞書（EjDictionary）の遅延 catch が新しい in-flight promise を消してしまう稀なケースがある。
- 辞書シートに Escape での閉じる操作・`aria-modal`・フォーカストラップが未実装。
- 本文に `user-select` を指定していないため、指が動くとテキスト選択が始まる可能性がある。
- Service Worker の `autoUpdate` による更新で、読み上げ中の再生が中断することがある。
- views 層が `app/services` を直接 import しており、将来的には依存注入に置き換えたい。

- iOS Safari は音声未指定だと `lang` を無視して端末の既定音声（日本語）で読む。音声未指定（自動）のときは英語音声を自動で割り当てるよう修正済み。音声一覧は en-US / en-GB を先頭に、他の英語圏（en-AU など）も含める。より自然な声は iOS の設定 → アクセシビリティ → 読み上げコンテンツ → 声 → 英語 で Premium / 拡張版をダウンロードすると一覧に現れる

## 試作（spike）: ブラウザ内ニューラル TTS の検証ページ

- `#/tts-lab`（本棚の下部リンク）から開ける。Kokoro-82M（ONNX、`kokoro-js`）をブラウザ内で動かし、モデル読み込み時間・1 文の生成時間・実時間比を計測する
- 本実装ではない。検証が済んだら削除するか、正式な SpeechService 実装に置き換える。`kokoro-js` は試作のための依存で、本体の「実行時依存 3 つ」には数えない
- 同ページに Safari が公開している標準音声の一覧（絞り込みなし）も表示する。Premium 音声が見えるかの診断に使う
