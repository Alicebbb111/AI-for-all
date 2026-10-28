#!/bin/zsh
# ─────────────────────────────────────────────────────────────
# OmniTransit v5 — สคริปต์เริ่มระบบ (ฟรี 100% ศูนย์ dependency)
# ใช้: ./start.sh   หรือ   zsh start.sh
# ต้องมี Node.js 18+ เท่านั้น — ไม่ต้อง npm install
# ─────────────────────────────────────────────────────────────
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ ไม่พบ Node.js — กรุณาติดตั้ง Node.js 18 ขึ้นไปก่อน (https://nodejs.org)"
  exit 1
fi

PORT="${PORT:-8787}"
echo "🚌 กำลังเริ่ม OmniTransit v5 ที่พอร์ต $PORT … (กด Ctrl+C เพื่อหยุด)"
PORT="$PORT" exec node server.js
