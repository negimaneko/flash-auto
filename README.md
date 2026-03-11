# MNEMOX

MNEMOX は、Groq を使って AI 生成と回答判定を行う単語帳アプリです。

## Vercel で使う手順

### 1. 依存関係を入れる

```bash
npm install
```

### 2. Vercel に Groq API キーを登録する

`GROQ_API_KEY` を `development` `preview` `production` の 3 つすべてに設定してください。

```bash
vercel env add GROQ_API_KEY development
vercel env add GROQ_API_KEY preview
vercel env add GROQ_API_KEY production
```

補助スクリプトを使う場合はこれでも OK です。

```bash
node setup-key.js
```

このスクリプトはキーを検証し、Vercel 環境変数を更新して、そのまま本番デプロイまで実行します。

### 3. デプロイする

```bash
vercel --prod
```

## ローカル開発

`.env.local` を作って、Groq API キーを設定してください。

```env
GROQ_API_KEY=your_groq_api_key_here
```

その後に起動します。

```bash
npm run dev
```

## 補足

- 現在の正式な API ルートは `/api/groq` です。
- `/api/gemini` は古いビルド互換のためのエイリアスとして残しています。
- 実際の AI プロバイダは Gemini ではなく Groq です。