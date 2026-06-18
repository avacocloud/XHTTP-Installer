#!/usr/bin/env bash
# ─────────────────────────────────────────────
#  xhttp-info  —  XHTTP Panel management CLI
#  Usage: xhttp-info [reset-password|set-path]
# ─────────────────────────────────────────────

PORT="${PANEL_PORT:-3000}"
BASE="http://127.0.0.1:$PORT/api/v1/local"

# ANSI colors
R='\033[0;31m' G='\033[0;32m' Y='\033[0;33m'
B='\033[0;34m' C='\033[0;36m' W='\033[1;37m' N='\033[0m'

# ── helpers ──────────────────────────────────

die() { echo -e "${R}✗ $*${N}" >&2; exit 1; }

check_panel() {
  curl -sf "$BASE/info" -o /dev/null 2>/dev/null || \
    die "Panel is not running. Start it with: pm2 start xhttp-panel"
}

get_info() {
  curl -sf "$BASE/info" 2>/dev/null
}

parse() { echo "$1" | grep -o "\"$2\":\"[^\"]*\"" | cut -d'"' -f4; }

# ── screens ──────────────────────────────────

show_header() {
  local INFO; INFO=$(get_info)
  local WEB_PATH PANEL_URL LOCAL_URL
  WEB_PATH=$(parse "$INFO" webPath)
  PANEL_URL=$(parse "$INFO" panelUrl)
  LOCAL_URL=$(parse "$INFO" localUrl)

  echo ""
  echo -e "${W}╔══════════════════════════════════════════════╗${N}"
  echo -e "${W}║          XHTTP Panel — Management            ║${N}"
  echo -e "${W}╠══════════════════════════════════════════════╣${N}"
  printf  "${W}║${N}  ${C}%-10s${N} %s\n" "URL:"   "$PANEL_URL"
  printf  "${W}║${N}  ${C}%-10s${N} /%s\n" "Path:"  "$WEB_PATH"
  printf  "${W}║${N}  ${C}%-10s${N} %s\n" "Local:" "$LOCAL_URL"
  echo -e "${W}╚══════════════════════════════════════════════╝${N}"
  echo ""
}

do_reset_password() {
  echo -e "${Y}New password (min 6 chars):${N}"
  read -rsp "> " PASS; echo ""
  [[ ${#PASS} -ge 6 ]] || die "Password too short (min 6 chars)"

  local RES
  RES=$(curl -sf -X POST "$BASE/reset-password" \
    -H "Content-Type: application/json" \
    -d "{\"password\":$(printf '%s' "$PASS" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}" 2>/dev/null)

  echo "$RES" | grep -q '"ok":true' \
    && echo -e "${G}✓ Password changed successfully${N}" \
    || die "Failed: $RES"
}

do_update() {
  echo -e "${C}Updating XHTTP Panel...${N}"
  echo ""

  local REPO="avacocloud/XHTTP-Panel"
  local INSTALL_DIR="/root/xhttp-panel"
  local TARBALL="xhttp-panel-release.tar.gz"

  # Download latest release
  local RELEASE_URL
  RELEASE_URL=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null | \
    grep -oP '"browser_download_url":\s*"\K[^"]+xhttp-panel-release\.tar\.gz' | head -1 || true)

  if [[ -z "$RELEASE_URL" ]]; then
    die "No release found on GitHub. Check: https://github.com/${REPO}/releases"
  fi

  # Backup data (both dist/data and root data/)
  echo -e "${Y}Backing up data...${N}"
  rm -rf /tmp/xhttp-panel-data-backup
  for d in "$INSTALL_DIR/dist/data" "$INSTALL_DIR/data"; do
    if [[ -d "$d" ]]; then
      mkdir -p /tmp/xhttp-panel-data-backup
      cp -r "$d"/. /tmp/xhttp-panel-data-backup/ 2>/dev/null || true
    fi
  done
  [[ -d /tmp/xhttp-panel-data-backup ]] && echo -e "${G}✓ Data backed up${N}" || echo -e "${Y}⚠ No existing data found${N}"

  # Download
  echo -e "${C}Downloading latest release...${N}"
  curl -fsSL "$RELEASE_URL" -o "/tmp/$TARBALL" || die "Download failed"
  echo -e "${G}✓ Downloaded${N}"

  # Extract (only replace dist/, keep data/ safe)
  rm -rf "$INSTALL_DIR/dist"
  tar -xzf "/tmp/$TARBALL" -C "$INSTALL_DIR"
  rm -f "/tmp/$TARBALL"
  echo -e "${G}✓ Files updated${N}"

  # Restore data to both locations
  if [[ -d /tmp/xhttp-panel-data-backup ]]; then
    mkdir -p "$INSTALL_DIR/dist/data" "$INSTALL_DIR/data"
    cp -r /tmp/xhttp-panel-data-backup/. "$INSTALL_DIR/dist/data/"
    cp -r /tmp/xhttp-panel-data-backup/. "$INSTALL_DIR/data/"
    rm -rf /tmp/xhttp-panel-data-backup
    echo -e "${G}✓ Data restored (DB + encryption key + tokens kept)${N}"
  fi

  # Update CLI
  local SELF_URL="https://raw.githubusercontent.com/${REPO}/main/xhttp-info.sh"
  curl -fsSL "$SELF_URL" -o /usr/local/bin/xhttp-info 2>/dev/null && \
    chmod +x /usr/local/bin/xhttp-info && \
    echo -e "${G}✓ CLI updated${N}" || true

  # Dependencies
  cd "$INSTALL_DIR"
  if npm install --omit=dev --silent 2>/dev/null; then
    echo -e "${G}✓ Dependencies OK${N}"
  else
    npm install --omit=dev 2>&1 || echo -e "${Y}⚠ npm install had issues${N}"
    echo -e "${G}✓ Dependencies OK${N}"
  fi

  # Restart
  pm2 restart xhttp-panel --update-env >/dev/null 2>&1 && \
    echo -e "${G}✓ Panel restarted${N}" || \
    echo -e "${Y}⚠ Could not restart — run: pm2 restart xhttp-panel${N}"

  echo ""
  echo -e "${G}✔ Update complete!${N}"
}

do_set_path() {
  echo -e "${Y}New web path (4–32 chars, a-z 0-9 _ -)${N}"
  read -rp "> " NEW_PATH

  [[ "$NEW_PATH" =~ ^[a-z0-9_-]{4,32}$ ]] || \
    die "Invalid path — only lowercase letters, numbers, _ and -"

  local RES
  RES=$(curl -sf -X POST "$BASE/set-web-path" \
    -H "Content-Type: application/json" \
    -d "{\"path\":\"$NEW_PATH\"}" 2>/dev/null)

  if echo "$RES" | grep -q '"ok":true'; then
    echo -e "${G}✓ Web path changed to: /${NEW_PATH}${N}"
    echo -e "${Y}Restart panel to apply: pm2 restart xhttp-panel${N}"
  else
    die "Failed: $RES"
  fi
}

main_menu() {
  show_header
  echo -e "  ${W}[1]${N} Reset admin password"
  echo -e "  ${W}[2]${N} Change web path"
  echo -e "  ${W}[3]${N} Update panel"
  echo -e "  ${W}[q]${N} Quit"
  echo ""
  read -rp "Choice: " CHOICE

  case "$CHOICE" in
    1) do_reset_password ;;
    2) do_set_path ;;
    3) do_update ;;
    q|Q) exit 0 ;;
    *) echo -e "${R}Invalid choice${N}" ;;
  esac
}

# ── entry point ──────────────────────────────

check_panel

case "${1:-}" in
  reset-password) do_reset_password ;;
  set-path)       do_set_path ;;
  update)         do_update ;;
  info)           show_header ;;
  *)              main_menu ;;
esac
