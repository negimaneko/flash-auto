# MNEMOX

MNEMOX は、AI 生成と回答判定を行う単語帳アプリです。ローカルの Ollama 上の `qwen` 系モデルを優先し、利用できない場合は Groq にフォールバックします。

## ローカルで qwen を使う手順

### 1. Ollama を起動する

`qwen3 1.7b` をダウンロード済みでも、API サーバが起動していないと MNEMOX から使えません。

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
OLLAMA_MODEL=qwen3:1.7b
GROQ_API_KEY=your_groq_api_key_here
```

`OLLAMA_MODEL` は `ollama list` に出る正確な名前に合わせてください。Groq はフォールバック用なので、ローカル専用でよければ未設定でも動きます。

共有キャッシュを使う場合は、以下も追加してください。

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
AI_GENERATE_DAILY_LIMIT=3
```

そのうえで [supabase/schema.sql](/Users/KikuchiKanon/Documents/mnemox/supabase/schema.sql) を Supabase SQL Editor で実行してください。

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

`GROQ_API_KEY` `SUPABASE_URL` `SUPABASE_SERVICE_ROLE_KEY` を `development` `preview` `production` の 3 つすべてに設定してください。

```bash
vercel env add GROQ_API_KEY development
vercel env add GROQ_API_KEY preview
vercel env add GROQ_API_KEY production
vercel env add SUPABASE_URL development
vercel env add SUPABASE_URL preview
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY development
vercel env add SUPABASE_SERVICE_ROLE_KEY preview
vercel env add SUPABASE_SERVICE_ROLE_KEY production
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
- `/api/deck-cache` は Supabase を使って共有キャッシュを検索し、キャッシュがない場合だけ Groq で 10〜15 枚の単語帳を新規生成します。
- 匿名ユーザーIDごとに 1 日 3 クレジットです。キャッシュヒット時は消費せず、初回生成と続き追加がそれぞれ 1 クレジットです。
- 続き追加は既存カードと重複しない新しいカードを 5〜10 枚返し、共有キャッシュにも追記保存します。
- Vercel からユーザーのローカル Ollama には接続できないため、`qwen` を使う場合は基本的にローカル起動が前提です。
- 現在の正式な API ルートは `/api/groq` です。
- `/api/gemini` は古いビルド互換のためのエイリアスとして残しています。
- `/api/gemini` は実体としては `/api/groq` のエイリアスです。
