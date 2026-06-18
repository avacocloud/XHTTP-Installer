#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  XHTTP Panel — Update Script
#  Usage: bash update.sh
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

INSTALL_DIR="/root/xhttp-panel"
CLI_PATH="/usr/local/bin/xhttp-info"
PM2_APP_NAME="xhttp-panel"
TARBALL="xhttp-panel-release.tar.gz"

R='\033[0;31m'; G='\033[0;32m'; Y='\033[0;33m'
C='\033[0;36m'; W='\033[1;37m'; N='\033[0m'

info() { echo -e "${C}➜${N}  $*"; }
ok()   { echo -e "${G}✔${N}  $*"; }
die()  { echo -e "${R}✘${N}  $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root"
[[ -f "$TARBALL" ]] || die "File not found: $TARBALL"

echo ""
echo -e "${W}══════════════════════════════════════${N}"
echo -e "${W}      XHTTP Panel — Update            ${N}"
echo -e "${W}══════════════════════════════════════${N}"
echo ""

# 1. Backup data
info "Backing up data..."
[[ -d "$INSTALL_DIR/dist/data" ]] && cp -r "$INSTALL_DIR/dist/data" /tmp/xhttp-panel-data-backup 2>/dev/null || true
ok "Data backed up"

# 2. Extract new files
info "Extracting new files..."
rm -rf "$INSTALL_DIR/dist"
tar -xzf "$TARBALL" -C "$INSTALL_DIR"
ok "Files updated"

# 3. Restore data
if [[ -d /tmp/xhttp-panel-data-backup ]]; then
  mkdir -p "$INSTALL_DIR/dist/data"
  cp -r /tmp/xhttp-panel-data-backup/. "$INSTALL_DIR/dist/data/"
  rm -rf /tmp/xhttp-panel-data-backup
  ok "Data restored"
fi

# 4. npm install (in case dependencies changed)
info "Checking dependencies..."
cd "$INSTALL_DIR"
npm install --omit=dev --silent 2>/dev/null
ok "Dependencies OK"

# 5. Update CLI
cp "$INSTALL_DIR/xhttp-info.sh" "$CLI_PATH"
chmod +x "$CLI_PATH"
ok "CLI updated"

# 6. Restart
pm2 restart "$PM2_APP_NAME" --update-env >/dev/null
ok "Panel restarted"

echo ""
echo -e "${G}  ✔  Update complete!${N}"
echo ""
