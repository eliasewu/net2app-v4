#!/bin/bash
# ============================================================
# NET2APP Hub - One-Line Deploy Script
# Ubuntu 22.04 / Debian 12
#
# Usage:
#   First-time install: sudo bash install.sh yourdomain.com
#   Deploy updates:     sudo bash deploy.sh
#
# One-liner:
#   curl -sL https://raw.githubusercontent.com/eliasewu/net2app-hub/main/deploy.sh | sudo bash
# ============================================================
set -e
APP_DIR="/opt/net2app-hub"
cd "$APP_DIR" 2>/dev/null || { echo "[ERROR] Run install.sh first"; exit 1; }

# Quiet npm as root
npm config set user 0 2>/dev/null || true

echo "==> Installing dependencies..."
npm install --no-audit --no-fund 2>/dev/null || true
npm install express pg bcryptjs jsonwebtoken cors dotenv --save --no-audit --no-fund 2>/dev/null || true

echo "==> Building frontend..."
npm run build || { echo "[FAIL] Frontend build failed"; exit 1; }

echo "==> Restarting service..."
systemctl daemon-reload 2>/dev/null || true
systemctl restart net2app-hub 2>/dev/null || nohup node server.cjs > /tmp/net2app-hub.log 2>&1 &

echo "==> Done!"
echo "  URL:  https://$(hostname -I 2>/dev/null | awk '{print $1}')"
echo "  API:  http://localhost:3001"
systemctl --no-pager status net2app-hub 2>/dev/null | head -5 || echo "  PID:  $(pgrep -f 'node server.cjs' 2>/dev/null)"
