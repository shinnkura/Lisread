# Lisread

英語の EPUB を読み込み、章ごとの読み上げ（Web Speech API）とハイライト追従、単語タップ 1 つで英和・英英辞書を引ける、オフライン対応（PWA）の静的 Web アプリ。IndexedDB にすべてのデータをローカル保存し、サーバー側の永続化は行わない。

## セットアップ

```bash
npm install
npm run dev
```

## テスト

```bash
npm test
```

## ドキュメント

- [docs/deploy.md](docs/deploy.md) — GitHub Pages へのデプロイ手順
- [docs/phase-1.md](docs/phase-1.md) — 実装済み機能、ディレクトリ構成、既知の課題、受け入れ基準チェックリスト
- [docs/design/tokens.md](docs/design/tokens.md) — デザイントークン
- [docs/superpowers/specs/2026-09-25-lisread-web-design.md](docs/superpowers/specs/2026-09-25-lisread-web-design.md) — 設計仕様書
- [docs/superpowers/plans/2026-09-25-lisread-web.md](docs/superpowers/plans/2026-09-25-lisread-web.md) — 実装計画

## デプロイ / 動作確認

GitHub Pages へのデプロイ手順は [docs/deploy.md](docs/deploy.md) を参照。実装済み機能・既知の課題・iPhone 実機での受け入れ基準チェックリストは [docs/phase-1.md](docs/phase-1.md) を参照。
