#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  XHTTP Panel — Install Script
#  Usage:
#    1. Upload xhttp-panel-release.tar.gz + this file to server
#    2. bash setup.sh
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

INSTALL_DIR="/root/xhttp-panel"
CLI_PATH="/usr/local/bin/xhttp-info"
PM2_APP_NAME="xhttp-panel"
TARBALL="xhttp-panel-release.tar.gz"
NODE_MAJOR=20
PANEL_PORT=3000

# ── colors ────────────────────────────────────────────────────
R='\033[0;31m'; G='\033[0;32m'; Y='\033[0;33m'
C='\033[0;36m'; W='\033[1;37m'; N='\033[0m'

info() { echo -e "${C}➜${N}  $*"; }
ok()   { echo -e "${G}✔${N}  $*"; }
warn() { echo -e "${Y}⚠${N}  $*"; }
die()  { echo -e "${R}✘${N}  $*" >&2; exit 1; }

# ── root check ────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || die "Run as root:  sudo bash setup.sh"

# ── tarball check ─────────────────────────────────────────────
[[ -f "$TARBALL" ]] || die "File not found: $TARBALL  (must be in the same directory)"

echo ""
echo -e "${W}══════════════════════════════════════${N}"
echo -e "${W}      XHTTP Panel — Installer         ${N}"
echo -e "${W}══════════════════════════════════════${N}"
echo ""

# ── 1. Node.js ────────────────────────────────────────────────
info "Checking Node.js..."
NEED_NODE=false
if command -v node &>/dev/null; then
  VER=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
  if [[ "$VER" -ge "$NODE_MAJOR" ]]; then
    ok "Node.js $(node -v) found"
  else
    warn "Node.js v$VER found — need v$NODE_MAJOR+"
    NEED_NODE=true
  fi
else
  warn "Node.js not found"
  NEED_NODE=true
fi

if $NEED_NODE; then
  info "Installing Node.js $NODE_MAJOR via NodeSource..."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs
  ok "Node.js $(node -v) installed"
fi

# ── 2. PM2 ───────────────────────────────────────────────────
info "Checking PM2..."
if command -v pm2 &>/dev/null; then
  ok "PM2 found"
else
  info "Installing PM2..."
  npm install -g pm2 --silent
  ok "PM2 installed"
fi

# ── 3. nginx ─────────────────────────────────────────────────
info "Checking nginx..."
if command -v nginx &>/dev/null; then
  ok "nginx found"
else
  info "Installing nginx..."
  apt-get update -qq
  apt-get install -y -qq nginx
  ok "nginx installed"
fi

# ── 4. Extract panel files ────────────────────────────────────
info "Extracting panel files to $INSTALL_DIR..."
# Find the tarball — it could be in current dir, $INSTALL_DIR, or script's dir
TARBALL_PATH=""
for candidate in "./$TARBALL" "$INSTALL_DIR/$TARBALL" "$(dirname "$0")/$TARBALL"; do
  [[ -f "$candidate" ]] && TARBALL_PATH="$candidate" && break
done
[[ -z "$TARBALL_PATH" ]] && die "Cannot find $TARBALL anywhere. Make sure it's in the same directory."

# Move tarball to /tmp so it survives the rm -rf below
cp "$TARBALL_PATH" "/tmp/$TARBALL"

if [[ -d "$INSTALL_DIR" ]]; then
  warn "Existing install found — backing up data directory..."
  rm -rf /tmp/xhttp-panel-data-backup
  for d in "$INSTALL_DIR/dist/data" "$INSTALL_DIR/data"; do
    if [[ -d "$d" ]]; then
      mkdir -p /tmp/xhttp-panel-data-backup
      cp -r "$d"/. /tmp/xhttp-panel-data-backup/ 2>/dev/null || true
    fi
  done
fi

rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
tar -xzf "/tmp/$TARBALL" -C "$INSTALL_DIR"
rm -f "/tmp/$TARBALL"
ok "Files extracted"

# ── 5. Restore data backup ────────────────────────────────────
if [[ -d /tmp/xhttp-panel-data-backup ]]; then
  mkdir -p "$INSTALL_DIR/dist/data" "$INSTALL_DIR/data"
  cp -r /tmp/xhttp-panel-data-backup/. "$INSTALL_DIR/dist/data/"
  cp -r /tmp/xhttp-panel-data-backup/. "$INSTALL_DIR/data/"
  rm -rf /tmp/xhttp-panel-data-backup
  ok "Previous data restored (DB + encryption key + tokens kept)"
fi

# ── 6. npm install (production only) ─────────────────────────
info "Installing npm dependencies..."
cd "$INSTALL_DIR"
if npm install --omit=dev --silent 2>&1; then
  ok "Dependencies installed"
else
  warn "npm install had warnings — retrying without --silent..."
  npm install --omit=dev 2>&1 || die "npm install failed"
  ok "Dependencies installed (with warnings)"
fi

# ── 7. PM2 start/restart ─────────────────────────────────────
info "Starting panel with PM2..."
pm2 delete "$PM2_APP_NAME" 2>/dev/null || true
pm2 start dist/server/index.js --name "$PM2_APP_NAME" >/dev/null
pm2 save >/dev/null
ok "Panel started"

# ── 8. PM2 startup on boot ───────────────────────────────────
info "Configuring PM2 startup on boot..."
env PATH="$PATH:/usr/bin" pm2 startup systemd -u root --hp /root 2>/dev/null | grep -E "^sudo|^env" | bash 2>/dev/null || true
pm2 save >/dev/null
ok "PM2 startup configured"

# ── 9. xhttp-info CLI ─────────────────────────────────────────
info "Installing xhttp-info CLI..."
cp "$INSTALL_DIR/xhttp-info.sh" "$CLI_PATH"
chmod +x "$CLI_PATH"
ok "xhttp-info installed → $CLI_PATH"

# ── 10. nginx config ─────────────────────────────────────────
info "Configuring nginx (port 80 → panel)..."
cat > /etc/nginx/sites-available/xhttp-panel <<EOF
server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:${PANEL_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
    }
}
EOF

# disable default site, enable ours
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
ln -sf /etc/nginx/sites-available/xhttp-panel /etc/nginx/sites-enabled/xhttp-panel 2>/dev/null || true

nginx -t -q 2>/dev/null && systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null
ok "nginx configured and reloaded"

# ── Done ──────────────────────────────────────────────────────
echo ""
sleep 1  # wait for panel to fully start

INFO=$(curl -sf "http://127.0.0.1:${PANEL_PORT}/api/v1/local/info" 2>/dev/null || echo "")
PANEL_URL=$(echo "$INFO" | grep -o '"panelUrl":"[^"]*"' | cut -d'"' -f4)
WEB_PATH=$(echo  "$INFO" | grep -o '"webPath":"[^"]*"'  | cut -d'"' -f4)

echo -e "${W}══════════════════════════════════════════════════${N}"
echo -e "${G}  ✔  XHTTP Panel installed successfully!          ${N}"
echo -e "${W}══════════════════════════════════════════════════${N}"
if [[ -n "$PANEL_URL" ]]; then
  echo -e "  ${C}URL:${N}    $PANEL_URL"
  echo -e "  ${C}Path:${N}   /$WEB_PATH"
fi
echo -e "  ${C}Local:${N}  http://localhost:${PANEL_PORT}"
echo -e "  ${C}Login:${N}  admin / admin  ${R}(change immediately!)${N}"
echo -e "  ${C}CLI:${N}    xhttp-info"
echo -e "${W}══════════════════════════════════════════════════${N}"
echo ""
