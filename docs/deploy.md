# デプロイ手順（GitHub Pages）

この開発環境には `gh` CLI も GitHub リモートも設定されていません。以下の手順はユーザー（自分の PC またはこの環境）側で行ってください。

## 1. GitHub にリポジトリを作る

GitHub 上で空のリポジトリを作成する（例: `lisread`）。README や .gitignore は追加しない。

## 2. リモートを設定して push する

この環境、またはクローンしたローカル PC で以下を実行する。

```bash
git remote add origin <リポジトリの URL>
git push -u origin main
```

HTTPS の URL を使う場合は GitHub の個人アクセストークンが必要になる（`gh` CLI が使えないため）。この環境から push できない場合は、ユーザー自身の PC でリポジトリをクローンし、そこから push してもよい。

## 3. GitHub Pages の設定

リポジトリの Settings → Pages → Source を「GitHub Actions」にする。これで `main` ブランチへの push（または `workflow_dispatch`）をトリガーに `.github/workflows/pages.yml` がビルド・デプロイを行う。

## 4. iPhone での確認

Actions のワークフローが成功したら、`https://<ユーザー名>.github.io/<リポジトリ名>/` を iPhone の Safari で開く。共有ボタン →「ホーム画面に追加」で PWA として追加できる。以降はホーム画面のアイコンから起動し、`docs/phase-1.md` の受け入れチェックリストを確認する。

## 5. リポジトリ名を変えた場合

`.github/workflows/pages.yml` はビルド時に `BASE_PATH` を `/${{ github.event.repository.name }}/` として自動的に設定する（`vite.config.ts` の `base: process.env.BASE_PATH ?? '/'` を参照）。そのため、リポジトリ名を変更してもワークフロー側の変更は不要で、`BASE_PATH` が自動的に新しいリポジトリ名に追従する。

## 6. ローカルで同一 LAN の iPhone から確認する

デプロイ前に手元で動作確認したい場合は、以下を実行する。

```bash
npm run dev -- --host
```

同じ Wi-Fi に接続した iPhone の Safari から `http://<PC の IP アドレス>:5173` を開く。Web Speech API は `http` でも動作するが、Service Worker（オフライン動作）は `https` または `localhost` でのみ有効になる点に注意する。オフライン動作やホーム画面追加の確認は、GitHub Pages にデプロイした `https` 環境で行うこと。
