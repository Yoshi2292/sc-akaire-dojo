# 朱入れ道場

情報処理安全確保支援士試験（SC）科目B（記述式）対策の自己ホスト型PWA。

```
GitHub Pages（静的PWA・React/Vite）
        │  fetch（X-App-Token付き）
        ▼
Cloudflare Worker（APIキー保持・プロキシ・入力制限）
        │  x-api-key
        ▼
Anthropic API（claude-sonnet-4-6）
```

## ローカル開発

```
npm install
npm run dev
```

`VITE_API_BASE_URL` を設定しない場合、AI採点・生成はローカルモック（`[MOCK]` 表示）で動作する。実際のAPIに接続する場合は `.env.local` を作成する。

```
# .env.local
VITE_API_BASE_URL=http://localhost:8787
```

## Cloudflare Workerのセットアップ

```
cd worker
wrangler login
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put APP_TOKEN
wrangler deploy
```

ローカル結合確認:

```
cd worker
wrangler dev --port 8787
```

（`worker/.dev.vars` にローカル用の `ANTHROPIC_API_KEY` / `APP_TOKEN` を記載すれば `wrangler dev` で読み込まれる。`.dev.vars` はgitignore対象。）

デプロイ後、Workerの `ALLOWED_ORIGINS`（`worker/src/index.js`）に本番のGitHub PagesオリジンとローカルVite開発オリジンが含まれていることを確認する。

アプリ初回起動時（またはヘッダー右上の⚙）から、`APP_TOKEN` と同じ値をアクセストークンとして入力する。

## GitHub Pagesへのデプロイ

1. GitHubリポジトリの Settings → Pages → Source を「GitHub Actions」に設定する。
2. Settings → Secrets and variables → Actions に `VITE_API_BASE_URL`（デプロイ済みWorkerのURL）を登録する。
3. `main` ブランチにpushすると `.github/workflows/deploy.yml` が自動デプロイする。

## iPhoneでのインストール

Safariでサイトを開き、共有メニュー →「ホーム画面に追加」。スタンドアロン表示で起動する。

## 過去問JSONインポート

ホーム画面の「過去問JSONインポート」から、以下の形式のJSON配列を貼り付けて登録できる（Claudeチャット側でPDFから変換する運用）。

```json
[
  {
    "type": "kijutsu",
    "field": "server",
    "scenario": "状況要約（150〜250字）",
    "exhibit": "表3 プロセス一覧（抜粋）\nプロセスID|コマンド\n100|java Main\n200|run",
    "question": "設問2(1) 下線②の理由を40字以内で述べよ。",
    "charLimit": 40,
    "modelAnswer": "公式解答例の記述",
    "keywords": ["k1", "k2", "k3"],
    "source": "pdf",
    "ref": "R7秋 午後 問1"
  }
]
```

`exhibit`（任意）は FWルール表・プロセス一覧などの図表を、改行・パイプ区切りのプレーンテキストで指定する。ドリル画面で等幅・横スクロール表示され、AI採点時は【図表】として渡される。`exhibit` のない既存データもそのまま動作する。

### 複数解答欄（「それぞれXX字以内で答えよ」対応）

1つの設問で複数の記述を個別の字数制限つきで求める場合は、`charLimit`（単数）の代わりに `charLimits`（配列・2つ以上）を使う。`answerLabels`（任意）で各欄の見出しを付けられる（省略時は①②③）。ドリル画面では解答欄と字数ゲージが欄ごとに分かれて表示され、採点時は各解答がラベル付きで結合されて送られる。

```json
{
  "type": "kijutsu",
  "field": "network",
  "question": "設問3(4) 動作を\"遮断\"ではなく\"検知\"にする利点と、被害を最小化するために実施すべき内容を、それぞれ25字以内で答えよ。",
  "charLimits": [25, 25],
  "answerLabels": ["利点", "実施内容"],
  "modelAnswer": "利点: … / 実施内容: …",
  "keywords": ["k1", "k2"],
  "source": "pdf",
  "ref": "R6秋 午後 問1"
}
```

`charLimits` が2つ以上ある場合はそちらが優先され、`charLimit`（単数）の既存データは従来どおり単一欄で動作する。

## データのバックアップ

設定画面（⚙）からデータ全体をJSONでエクスポート／インポートできる（iPhone⇄Mac間の移行用。インポートは既存データを置き換える）。
