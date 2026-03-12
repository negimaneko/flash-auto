# MNEMOX

MNEMOX は、AI 生成と回答判定を行う単語帳アプリです。ローカルの Ollama 上の `qwen` 系モデルを優先し、利用できない場合は Groq にフォールバックします。

## ローカルで qwen を使う手順

### 1. Ollama を起動する

`qwen3.5 9b` をダウンロード済みでも、API サーバが起動していないと MNEMOX から使えません。

```bash
ollama serve
```

別ターミナルで、モデル名を確認してください。

```bash
ollama list
```

### 2. `.env.local` を作る

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3.5:9b
GROQ_API_KEY=your_groq_api_key_here
```

`OLLAMA_MODEL` は `ollama list` に出る正確な名前に合わせてください。Groq はフォールバック用なので、ローカル専用でよければ未設定でも動きます。

### 3. 起動する

```bash
npm install
npm run dev
```

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

## 補足

- `/api/ollama` を最優先で呼び、失敗した場合は `/api/groq`、`/api/gemini` の順にフォールバックします。
- Vercel からユーザーのローカル Ollama には接続できないため、`qwen` を使う場合は基本的にローカル起動が前提です。
- 現在の正式な API ルートは `/api/groq` です。
- `/api/gemini` は古いビルド互換のためのエイリアスとして残しています。
- `/api/gemini` は実体としては `/api/groq` のエイリアスです。
