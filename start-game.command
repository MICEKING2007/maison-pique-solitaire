#!/bin/bash
# Maison Pique 本地启动器（macOS）
set -u
cd "$(dirname "$0")" || exit 1

PORT=8123
LOCAL_URL="http://127.0.0.1:${PORT}/"
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)

if lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Maison Pique 已经在运行：${LOCAL_URL}"
  open "${LOCAL_URL}"
  exit 0
fi

echo "正在打开 Maison Pique…"
python3 -m http.server "${PORT}" --bind 0.0.0.0 &
SERVER_PID=$!
trap 'kill ${SERVER_PID} 2>/dev/null' EXIT INT TERM
sleep 0.5

echo ""
echo "电脑打开：${LOCAL_URL}"
if [ -n "${LAN_IP}" ]; then
  echo "手机 / 平板打开：http://${LAN_IP}:${PORT}/"
  echo "（设备需要和电脑连接同一个 Wi-Fi）"
fi
echo ""
echo "关闭此窗口或按 Ctrl+C 可结束服务器。"

open "${LOCAL_URL}"
wait "${SERVER_PID}"
