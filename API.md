# AIプロバイダー構成メモ

## デッキ生成
- **モデル**: Gemini 2.5 Flash-Lite
- **経路**: `deck-cache.js` → `_shared/gemini.js`
- **切り替え条件**: `GEMINI_API_KEY` が設定されていれば Gemini、未設定なら Groq にフォールバック

## キャラクター検証
- **モデル**: Groq (Llama 3.3 70B)
- **経路**: `deck-cache.js` → `_shared/groq.js`
- **備考**: 生成と異なるモデルで検証する「クロスモデル検証」。Geminiで生成した場合でも検証は常にGroqを使う

## 単語定義（callAI）
- **モデル**: Ollama → Groq → Gemini（この順でフォールバック）
- **経路**: `src/api.js` のフォールバックチェーン
- **備考**: Ollamaはローカル環境のみ。本番ではOllamaが自動スキップされGroqから開始する

## 環境変数
| 変数名 | 用途 |
|--------|------|
| `GEMINI_API_KEY` | Gemini 2.5 Flash-Lite（デッキ生成） |
| `GROQ_API_KEY` | Groq Llama 3.3 70B（キャラクター検証 + callAIフォールバック） |
| `OLLAMA_BASE_URL` | Ollama（ローカル開発用、単語定義の第1優先） |
| `OLLAMA_MODEL` | Ollamaで使用するモデル名（例: qwen3:1.7b） |
