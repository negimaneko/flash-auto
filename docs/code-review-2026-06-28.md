# コードレビュー報告（2026-06-28）

分析ファイル数: 37件

---

## 【致命的】

### 📁 api/notify-telegram.js:25-27
**⚠️ 問題:** `?test=1` クエリパラメータだけで認証なしにTelegramへ任意メッセージを送信できる。本番でも curl で `POST /api/notify-telegram?test=1` にリクエストすれば誰でも送信可能（CORSはブラウザのみ有効）。

**💡 修正案:** テスト用でも最低限のシークレット検証（例: `X-Test-Token` ヘッダー）を追加する。または `?test=1` パラメータを開発環境のみ有効にする。

---

### 📁 api/notify-telegram.js:29-31 / api/post-x.js:38-40 / api/daily-report.js:31-34
**⚠️ 問題:** `CRON_SECRET` 未設定時に認証を完全スキップ。環境変数の設定漏れだけで誰でも X 投稿・Telegram 通知・デイリーレポートをトリガーできる。

**💡 修正案:** 未設定時は「環境変数が必要」エラーを返す（スキップではなく拒否）。
```js
// Before
if (!cronSecret) {
  console.warn("[post-x] CRON_SECRET 未設定 — 認証スキップ");
  return true;
}
// After
if (!cronSecret) {
  console.error("[post-x] CRON_SECRET が未設定です");
  return false; // 拒否
}
```

---

## 【改善推奨】

### 📁 api/deck-cache.js:647-685
**⚠️ 問題:** クレジット消費のread-modify-write競合。`readCredits()` → `upsert()` の間に同一 `userId` の並列リクエストが来ると上限を超えて生成できる。

**💡 修正案:** Supabase の atomic increment RPC（例: `increment_credit`）でカウントを一括管理する。

---

### 📁 api/daily-report.js:119-147
**⚠️ 問題:** `users` テーブルを条件なしで全件取得、`events` は最新 5000 件に制限。ユーザー増加で集計精度が落ちパフォーマンスが悪化する。

**💡 修正案:** `users` は今日以降の `created_at` に絞り、`events` は日付範囲フィルタで取得する。

---

### 📁 vite.config.js:42-120
**⚠️ 問題:** `buildInitialPrompt` / `buildContinuationPrompt` がデッドコード（プロキシは `import('./api/deck-cache.js')` を使用）。かつ `parseDeckPayload` が `<think>` ブロックを除去しないため qwen3 等の推論モデルでローカルパースが失敗しうる。

**💡 修正案:** vite.config.js 内の重複関数を削除し、`parseDeckPayload` を api/deck-cache.js からインポートして共有する。

---

### 📁 api/public-library.js:26-30
**⚠️ 問題:** `GET /api/public-library` にレートリミットがなくリスト全件を何度でも取得できる。

**💡 修正案:** GET にも `checkRateLimit` を適用する。

---

## 【軽微】

### 📁 src/App.jsx:119
**⚠️ 問題:** `showToast` の `setTimeout` 戻り値が `clearTimeout` されていない（アンマウント後も実行される可能性）。

**💡 修正案:** タイマー ID を ref で保持してクリーンアップする。

---

### 📁 src/utils.js:66
**⚠️ 問題:** `uid()` が `Math.random()` ベースの 7 文字 ID でカード ID に使用されており衝突の可能性がある。

**💡 修正案:** `crypto.randomUUID()` に変更する（`tracking.js` の `buildAnonymousUserId` と同様）。

---

*生成: Claude Code (automated code review routine)*
