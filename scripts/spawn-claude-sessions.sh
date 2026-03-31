#!/bin/bash
# spawn-claude-sessions.sh
# タスクごとに新しいターミナルタブを開き、claude セッションを起動する
#
# Usage: spawn-claude-sessions.sh task1.md task2.md ...
#   各 .md ファイルの中身が claude の初期プロンプトとして渡される

PROJECT_DIR="/Users/KikuchiKanon/Documents/claude flash auto"

if [ $# -eq 0 ]; then
  echo "Usage: $0 <task-file.md> [task-file2.md] ..."
  exit 1
fi

opened=0

for task_file in "$@"; do
  if [ ! -f "$task_file" ]; then
    echo "⚠ ファイルが見つかりません: $task_file"
    continue
  fi

  # ファイル名からタスク名を取得（表示用）
  task_name=$(basename "$task_file" .md)

  # AppleScript で新しいターミナルタブを開き、claude を起動
  osascript <<APPLESCRIPT
tell application "Terminal"
  activate
  -- 新しいタブを開く
  tell application "System Events" to keystroke "t" using command down
  delay 0.5
  -- claude を起動（引き継ぎファイルの中身を初期プロンプトとして渡す）
  do script "cd '${PROJECT_DIR}' && claude \"\$(cat '${task_file}')\"" in front window
end tell
APPLESCRIPT

  echo "✓ タブを開きました: $task_name"
  opened=$((opened + 1))

  # タブが安定するまで少し待つ
  sleep 1
done

echo ""
echo "完了: ${opened} 個のセッションを起動しました"
