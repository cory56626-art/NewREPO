#!/usr/bin/env bash
# Starts Skyhand in the background. Codespaces runs this every time the codespace starts.
cd "$(dirname "$0")/.." || exit 1
pkill -f "node src/server.js" 2>/dev/null || true
setsid nohup node src/server.js > /tmp/skyhand.log 2>&1 < /dev/null &

# Let the phone's home-screen app reach port 3000 without a GitHub login.
# Skyhand still asks for APP_PASSWORD. If this fails, set it by hand: PORTS tab > port 3000 > Port Visibility > Public.
if [ -n "$CODESPACE_NAME" ] && command -v gh > /dev/null; then
  (sleep 10; gh codespace ports visibility 3000:public -c "$CODESPACE_NAME" > /dev/null 2>&1 || true) &
fi
echo "Skyhand is starting. Log: /tmp/skyhand.log"
