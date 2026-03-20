#!/usr/bin/env python3
"""flash auto デイリーレポート送信スクリプト"""

import json
import subprocess
import sys
from datetime import datetime, timezone, timedelta

JST = timezone(timedelta(hours=9))
now_jst = datetime.now(JST)
today_start = now_jst.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).isoformat()
today_end = now_jst.replace(hour=23, minute=59, second=59, microsecond=0).astimezone(timezone.utc).isoformat()

# 環境変数（.env.local から直接読み込む）
env = {}
try:
    with open("/Users/KikuchiKanon/Documents/claude flash auto/.env.local") as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
except Exception as e:
    print(f"❌ .env.local 読み込み失敗: {e}", file=sys.stderr)
    sys.exit(1)

KEY = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
TOKEN = env.get("TELEGRAM_BOT_TOKEN", "")
CHAT_ID = env.get("TELEGRAM_CHAT_ID", "")
BASE = "https://raxizxpxodxvziqrwrqc.supabase.co/rest/v1"
HEADERS = ["-H", f"apikey: {KEY}", "-H", f"Authorization: Bearer {KEY}"]


def fetch(url):
    r = subprocess.run(["curl", "-s", "--max-time", "15", url] + HEADERS, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"curl失敗: {r.stderr}")
    return json.loads(r.stdout)


def send_telegram(text):
    r = subprocess.run([
        "curl", "-s", "--max-time", "15", "-X", "POST",
        f"https://api.telegram.org/bot{TOKEN}/sendMessage",
        "-d", f"chat_id={CHAT_ID}",
        "--data-urlencode", f"text={text}"
    ], capture_output=True, text=True)
    result = json.loads(r.stdout)
    if not result.get("ok"):
        raise RuntimeError(f"Telegram送信失敗: {result}")
    return result


def send_photo(chart_url, caption):
    r = subprocess.run([
        "curl", "-s", "--max-time", "15", "-X", "POST",
        f"https://api.telegram.org/bot{TOKEN}/sendPhoto",
        "-F", f"chat_id={CHAT_ID}",
        "-F", f"photo={chart_url}",
        "-F", f"caption={caption}"
    ], capture_output=True, text=True)
    result = json.loads(r.stdout)
    return result.get("ok", False)


def make_chart(labels, data, title, chart_type="bar"):
    colors = [
        "rgba(54,162,235,0.8)", "rgba(255,206,86,0.8)", "rgba(75,192,192,0.8)",
        "rgba(153,102,255,0.8)", "rgba(255,159,64,0.8)", "rgba(255,99,132,0.8)"
    ]
    payload = {
        "backgroundColor": "white",
        "chart": {
            "type": chart_type,
            "data": {
                "labels": labels,
                "datasets": [{
                    "label": title,
                    "data": data,
                    "backgroundColor": colors[:len(data)],
                    "borderColor": colors[:len(data)],
                    "fill": False
                }]
            },
            "options": {
                "title": {"display": True, "text": title},
                "scales": {"yAxes": [{"ticks": {"beginAtZero": True}}]}
            }
        }
    }
    r = subprocess.run([
        "curl", "-s", "--max-time", "15", "-X", "POST",
        "https://quickchart.io/chart/create",
        "-H", "Content-Type: application/json",
        "-d", json.dumps(payload)
    ], capture_output=True, text=True)
    result = json.loads(r.stdout)
    return result.get("url", "")


# ─── データ取得 ───────────────────────────────────────
try:
    users = fetch(f"{BASE}/users?select=id,is_internal,created_at")
except Exception as e:
    send_telegram(f"❌ flash auto デイリーレポート失敗\nSupabase接続エラー: {e}")
    sys.exit(1)

internal_ids = {u["id"] for u in users if u.get("is_internal")}
external_total = len([u for u in users if not u.get("is_internal")])
new_today = len([
    u for u in users
    if not u.get("is_internal") and today_start <= u["created_at"] <= today_end
])

try:
    events = fetch(f"{BASE}/events?select=event_name,occurred_at,user_id,metadata&order=occurred_at.desc&limit=5000")
except Exception as e:
    send_telegram(f"❌ flash auto デイリーレポート失敗\nイベント取得エラー: {e}")
    sys.exit(1)

today_events = [
    e for e in events
    if today_start <= e["occurred_at"] <= today_end
    and e.get("user_id") not in internal_ids
]

# ─── 集計 ─────────────────────────────────────────────
counts = {}
users_by_event = {}
for e in today_events:
    name = e["event_name"]
    counts[name] = counts.get(name, 0) + 1
    if name not in users_by_event:
        users_by_event[name] = set()
    if e.get("user_id"):
        users_by_event[name].add(e["user_id"])

app_open = counts.get("app_open", 0)
app_open_uniq = len(users_by_event.get("app_open", set()))
gen_word = counts.get("generate_word", 0)
gen_deck = counts.get("generate_theme_deck", 0)
save_deck = counts.get("save_deck", 0)
review_card = counts.get("review_card", 0)

gen_users = len(users_by_event.get("generate_word", set()) | users_by_event.get("generate_theme_deck", set()))
save_users = len(users_by_event.get("save_deck", set()))
review_users = len(users_by_event.get("review_card", set()))

save_rate = f"{save_users/gen_users*100:.0f}%" if gen_users > 0 else "-%"
review_rate = f"{review_users/save_users*100:.0f}%" if save_users > 0 else "-%"

# AI集計
ai_providers = {}
latencies = []
fallbacks = 0
errors = 0
for e in today_events:
    meta = e.get("metadata") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}
    if p := meta.get("provider"):
        ai_providers[p] = ai_providers.get(p, 0) + 1
    if lat := meta.get("latency_ms"):
        latencies.append(lat)
    if meta.get("is_fallback"):
        fallbacks += 1
    if meta.get("error"):
        errors += 1

ai_total = sum(ai_providers.values())
provider_str = " / ".join(f"{k} {v}回" for k, v in ai_providers.items()) if ai_providers else "データなし"
avg_lat = f"{sum(latencies)/len(latencies):.0f}ms" if latencies else "データなし"
fallback_rate = f"{fallbacks/ai_total*100:.0f}%" if ai_total > 0 else "-%"
error_rate = f"{errors/ai_total*100:.0f}%" if ai_total > 0 else "-%"

# 直近7日の日別app_open
from collections import defaultdict
daily = defaultdict(int)
for e in events:
    if e["event_name"] == "app_open" and e.get("user_id") not in internal_ids:
        d = e["occurred_at"][:10]
        daily[d] += 1
week_labels = sorted(daily.keys())[-7:]
week_data = [daily[d] for d in week_labels]
week_labels_disp = [d[5:] for d in week_labels]  # MM-DD形式

# ─── グラフ生成 ────────────────────────────────────────
chart1_url = ""
chart2_url = ""
try:
    chart1_url = make_chart(
        ["app_open", "generate_word", "generate_theme_deck", "save_deck", "review_card"],
        [app_open, gen_word, gen_deck, save_deck, review_card],
        "flash auto 本日のイベント"
    )
except Exception:
    pass

try:
    chart2_url = make_chart(week_labels_disp, week_data, "直近7日のapp_open", chart_type="line")
except Exception:
    pass

# ─── Google フォーム回答取得 ──────────────────────────
feedback_summary = "取得に失敗しました"
feedback_count = 0
try:
    r = subprocess.run([
        "curl", "-s", "-L", "--max-time", "15",
        "https://docs.google.com/spreadsheets/d/1YkVPFQ3c_K_Uu-MldkcEIkUbKIr5kyEs6lwbXy2YSPs/export?format=csv"
    ], capture_output=True, text=True)
    lines = r.stdout.strip().split("\n")
    today_str = now_jst.strftime("%Y/%m/%d")
    today_rows = [l for l in lines[1:] if l.startswith(today_str)]
    feedback_count = len(today_rows)
    if feedback_count == 0:
        feedback_summary = "本日の回答はありませんでした"
    else:
        feedback_summary = f"{feedback_count}件の回答あり（内容は別途確認）"
except Exception:
    pass

# ─── Telegram送信 ─────────────────────────────────────
date_str = now_jst.strftime("%-m/%-d")

if chart1_url:
    send_photo(chart1_url, "📊 本日のイベント（内部ユーザー除外）")

if chart2_url:
    send_photo(chart2_url, "📈 直近7日のapp_open")

report = f"""📊 flash auto デイリーレポート（{date_str}）

■ 今日の数値（内部ユーザー除外）
・新規ユーザー: {new_today}人
・app_open: {app_open}回（ユニーク {app_open_uniq}人）
・generate_word: {gen_word}回
・generate_theme_deck: {gen_deck}回
・save_deck: {save_deck}回（実行率 {save_rate}）
・review_card: {review_card}回（実行率 {review_rate}）

■ AI 生成状況
・使用プロバイダー: {provider_str}
・平均レイテンシ: {avg_lat}
・フォールバック発生率: {fallback_rate}
・エラー率: {error_rate}

■ ご意見箱（本日）
・回答数: {feedback_count}件
・{feedback_summary}

■ 外部ユーザー累計: {external_total}人"""

send_telegram(report)
print("✅ レポート送信完了")
