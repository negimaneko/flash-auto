#!/bin/bash
# 生成画像をWeb用に圧縮するスクリプト
# 使い方: ./scripts/compress-image.sh <入力画像パス> [出力ファイル名] [幅px]

INPUT="$1"
OUTPUT="${2:-compressed-$(date +%Y%m%d-%H%M%S).png}"
WIDTH="${3:-512}"

if [ -z "$INPUT" ]; then
  echo "使い方: ./scripts/compress-image.sh <入力画像パス> [出力ファイル名] [幅px]"
  exit 1
fi

if [ ! -f "$INPUT" ]; then
  echo "エラー: ファイルが見つかりません: $INPUT"
  exit 1
fi

OUTDIR="$(dirname "$0")/../generated_imgs"
OUTPATH="$OUTDIR/$OUTPUT"

sips -s format png -s formatOptions 70 --resampleWidth "$WIDTH" "$INPUT" --out "$OUTPATH" > /dev/null 2>&1

ORIGINAL_SIZE=$(ls -lh "$INPUT" | awk '{print $5}')
COMPRESSED_SIZE=$(ls -lh "$OUTPATH" | awk '{print $5}')

echo "圧縮完了: $ORIGINAL_SIZE → $COMPRESSED_SIZE"
echo "保存先: $OUTPATH"
