#!/usr/bin/env bash
# ============================================================
# run-debug-check.sh — ハイブリッドデバッグチェック
#
# Phase 1: npm test + npm run lint を実行（固定ロジック・トークン0）
# ゲート: 両方通過 → exit 0（Claude起動しない）
# Phase 2: 失敗時のみ claude -p で原因診断（判断ロジック）
# ============================================================

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

# 色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ANSIエスケープ除去関数
strip_ansi() {
  perl -pe 's/\e\[[0-9;]*m//g'
}

# 結果格納
TEST_OUTPUT=""
TEST_EXIT=0
LINT_OUTPUT=""
LINT_EXIT=0

echo -e "${CYAN}[Phase 1] 固定ロジック実行中...${NC}"
echo ""

# --- テスト実行 ---
echo -e "${CYAN}[1/2] npm test${NC}"
TEST_OUTPUT=$(npm test 2>&1) || TEST_EXIT=$?

if [ $TEST_EXIT -eq 0 ]; then
  PASS_COUNT=$(echo "$TEST_OUTPUT" | strip_ansi | grep "Tests" | perl -ne 'print $1 if /(\d+) passed/')
  PASS_COUNT=${PASS_COUNT:-"?"}
  echo -e "  ${GREEN}✓ テスト通過${NC} (${PASS_COUNT} passed)"
else
  FAIL_COUNT=$(echo "$TEST_OUTPUT" | strip_ansi | grep "Tests" | perl -ne 'print $1 if /(\d+) failed/')
  FAIL_COUNT=${FAIL_COUNT:-"?"}
  echo -e "  ${RED}✗ テスト失敗${NC} (${FAIL_COUNT} failed)"
fi

# --- Lint実行 ---
echo -e "${CYAN}[2/2] npm run lint${NC}"
LINT_OUTPUT=$(npm run lint 2>&1) || LINT_EXIT=$?

if [ $LINT_EXIT -eq 0 ]; then
  # 警告の有無をチェック（"X problems" の数字を取得）
  WARNING_COUNT=$(echo "$LINT_OUTPUT" | sed -n 's/.*✖ \([0-9][0-9]*\) problem.*/\1/p')
  WARNING_COUNT=${WARNING_COUNT:-0}
  if [ "$WARNING_COUNT" = "0" ]; then
    echo -e "  ${GREEN}✓ Lint通過${NC} (問題なし)"
  else
    echo -e "  ${YELLOW}△ Lint通過${NC} (警告 ${WARNING_COUNT}件)"
  fi
else
  ERROR_COUNT=$(echo "$LINT_OUTPUT" | sed -n 's/.*\([0-9][0-9]*\) error.*/\1/p')
  ERROR_COUNT=${ERROR_COUNT:-"?"}
  echo -e "  ${RED}✗ Lintエラー${NC} (${ERROR_COUNT} errors)"
fi

echo ""

# --- ゲート判定 ---
if [ $TEST_EXIT -eq 0 ] && [ $LINT_EXIT -eq 0 ]; then
  echo -e "${GREEN}[ゲート] 全チェック通過。Claude起動不要。${NC}"

  # 警告がある場合は表示だけする
  WARNING_COUNT=$(echo "$LINT_OUTPUT" | sed -n 's/.*✖ \([0-9][0-9]*\) problem.*/\1/p')
  WARNING_COUNT=${WARNING_COUNT:-0}
  if [ "$WARNING_COUNT" != "0" ]; then
    echo ""
    echo -e "${YELLOW}--- Lint警告（参考） ---${NC}"
    echo "$LINT_OUTPUT" | grep -E "warning" | grep -v "^>" || true
  fi

  exit 0
fi

# --- Phase 2: Claude起動 ---
echo -e "${RED}[Phase 2] 失敗検出。Claudeに診断を依頼します...${NC}"
echo ""

# 診断用レポートを構築
REPORT="以下のデバッグチェック結果を分析し、修正方針を日本語で簡潔に回答してください。

プロジェクト: flash-auto (${PROJECT_ROOT})
"

if [ $TEST_EXIT -ne 0 ]; then
  # テスト出力から失敗部分だけ抽出（最大100行）
  FAILED_TESTS=$(echo "$TEST_OUTPUT" | grep -A 20 -E "FAIL|AssertionError|Error:" | head -100)
  REPORT+="
## テスト失敗
\`\`\`
${FAILED_TESTS}
\`\`\`
"
fi

if [ $LINT_EXIT -ne 0 ]; then
  REPORT+="
## Lintエラー
\`\`\`
${LINT_OUTPUT}
\`\`\`
"
fi

REPORT+="
## 指示
1. 各エラーの原因を特定
2. 修正方針を提示（コード変更が必要な場合はファイル名と行番号を含める）
3. テスト期待値とコード実装の不一致がある場合、どちらを直すべきか判断
"

# claude -p で診断（--output-format text でプレーンテキスト出力）
if command -v claude &> /dev/null; then
  echo "$REPORT" | claude -p --output-format text
else
  echo -e "${RED}[エラー] claude コマンドが見つかりません。${NC}"
  echo ""
  echo "--- 診断レポート（手動確認用） ---"
  echo "$REPORT"
  exit 1
fi
