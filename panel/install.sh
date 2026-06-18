#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  XHTTP Panel — Quick Installer
#  Usage: bash <(curl -fsSL https://raw.githubusercontent.com/avacocloud/XHTTP-Panel/main/install.sh)
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

REPO="avacocloud/XHTTP-Panel"
INSTALL_DIR="/root/xhttp-panel"

R='\033[0;31m'; G='\033[0;32m'; Y='\033[0;33m'
C='\033[0;36m'; W='\033[1;37m'; N='\033[0m'

info() { echo -e "${C}➜${N}  $*"; }
ok()   { echo -e "${G}✔${N}  $*"; }
warn() { echo -e "${Y}⚠${N}  $*"; }
die()  { echo -e "${R}✘${N}  $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root: sudo bash install.sh"

echo ""
echo -e "${W}══════════════════════════════════════${N}"
echo -e "${W}      XHTTP Panel — Quick Install     ${N}"
echo -e "${W}══════════════════════════════════════${N}"
echo ""

# ── Download latest release ───────────────────────────────
info "Fetching latest release from GitHub..."
RELEASE_URL=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null | \
  grep -oP '"browser_download_url":\s*"\K[^"]+xhttp-panel-release\.tar\.gz' | head -1 || true)

if [[ -z "$RELEASE_URL" ]]; then
  warn "No release found — downloading setup files from main branch..."
  mkdir -p "$INSTALL_DIR"
  cd "$INSTALL_DIR"
  curl -fsSL "https://raw.githubusercontent.com/${REPO}/main/release/setup.sh" -o setup.sh
  curl -fsSL "https://raw.githubusercontent.com/${REPO}/main/release/update.sh" -o update.sh
  die "xhttp-panel-release.tar.gz not found in releases. Upload it first, then re-run."
fi

SETUP_URL=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null | \
  grep -oP '"browser_download_url":\s*"\K[^"]+setup\.sh' | head -1 || true)

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

info "Downloading release tarball..."
curl -fsSL "$RELEASE_URL" -o xhttp-panel-release.tar.gz
ok "Downloaded: xhttp-panel-release.tar.gz"

if [[ -n "$SETUP_URL" ]]; then
  curl -fsSL "$SETUP_URL" -o setup.sh
else
  curl -fsSL "https://raw.githubusercontent.com/${REPO}/main/setup.sh" -o setup.sh
fi
ok "Downloaded: setup.sh"

# ── Run setup ─────────────────────────────────────────────
info "Running setup..."
chmod +x setup.sh
exec bash setup.sh
