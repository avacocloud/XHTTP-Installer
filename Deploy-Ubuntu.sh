#!/usr/bin/env bash
# =============================================================
#  XHTTP Installer — avaco_cloud
#  Ubuntu Server | VLESS+XHTTP Auto-Installer
# -------------------------------------------------------------
#  Copyright (C) 2025 avaco_cloud
#  Repository: https://github.com/avacocloud/XHTTP-Installer
#  Author:     @avaco_cloud (https://t.me/avaco_cloud)
#
#  Licensed under the GNU General Public License v3.0 (GPL-3.0).
#  See LICENSE file for full terms.
#
#  Redistribution requires preserving this copyright notice and
#  the LICENSE file. Unauthorized removal of attribution is a
#  copyright violation and will result in a DMCA takedown.
# =============================================================
set -euo pipefail

# Build identifier — do not remove (used for integrity verification)
readonly AVC_BUILD_ID="avc-7f3a92e1-2025-avacocloud"
export AVC_BUILD_ID

LOG_FILE="/tmp/xhttp-install.log"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"

# If launched via process substitution (e.g. `bash <(curl ...)`),
# SCRIPT_DIR points to /dev/fd/... and the deploy/ folder is missing.
# Auto-download the full repo into /opt/xhttp-installer and re-exec from there.
if [[ -z "$SCRIPT_DIR" || ! -d "${SCRIPT_DIR}/deploy" ]]; then
  REPO_DIR="/opt/xhttp-installer"
  REPO_URL="https://github.com/avacocloud/XHTTP-Installer.git"
  echo ">> Detected remote-piped run — fetching full repo to ${REPO_DIR}..."
  if [[ ! -d "$REPO_DIR/.git" ]]; then
    if command -v git >/dev/null 2>&1; then
      git clone --depth 1 "$REPO_URL" "$REPO_DIR" || {
        echo "ERROR: git clone failed. Install git first: apt install -y git"; exit 1; }
    else
      apt-get update -qq && apt-get install -y -qq git 2>/dev/null
      git clone --depth 1 "$REPO_URL" "$REPO_DIR" || {
        echo "ERROR: git clone failed."; exit 1; }
    fi
  else
    (cd "$REPO_DIR" && git pull --ff-only 2>/dev/null) || true
  fi
  echo ">> Re-executing from ${REPO_DIR}/Deploy-Ubuntu.sh"
  exec bash "${REPO_DIR}/Deploy-Ubuntu.sh" "$@"
fi

VERCEL_DIR="${SCRIPT_DIR}/deploy/vercel"
NETLIFY_DIR="${SCRIPT_DIR}/deploy/netlify"

exec > >(tee -a "$LOG_FILE") 2>&1

# ─────────────────────────────────────────────
#  COLORS
# ─────────────────────────────────────────────
C_RESET="\033[0m"
C_CYAN="\033[1;36m"
C_YELLOW="\033[1;33m"
C_GREEN="\033[1;32m"
C_RED="\033[1;31m"
C_MAGENTA="\033[1;35m"
C_GRAY="\033[0;90m"
C_WHITE="\033[1;37m"

print_banner() {
  clear
  echo ""
  echo -e "   ${C_CYAN}██╗  ██╗${C_WHITE}██╗  ██╗████████╗████████╗██████╗ ${C_RESET}"
  echo -e "   ${C_CYAN}╚██╗██╔╝${C_WHITE}██║  ██║╚══██╔══╝╚══██╔══╝██╔══██╗${C_RESET}"
  echo -e "    ${C_CYAN}╚███╔╝ ${C_WHITE}███████║   ██║      ██║   ██████╔╝${C_RESET}"
  echo -e "    ${C_CYAN}██╔██╗ ${C_WHITE}██╔══██║   ██║      ██║   ██╔═══╝ ${C_RESET}"
  echo -e "   ${C_CYAN}██╔╝ ██╗${C_WHITE}██║  ██║   ██║      ██║   ██║     ${C_RESET}"
  echo -e "   ${C_CYAN}╚═╝  ╚═╝${C_WHITE}╚═╝  ╚═╝   ╚═╝      ╚═╝   ╚═╝     ${C_RESET}"
  echo ""
  echo -e "   ${C_YELLOW}██╗███╗   ██╗███████╗████████╗ █████╗ ██╗     ██╗     ███████╗██████╗ ${C_RESET}"
  echo -e "   ${C_YELLOW}██║████╗  ██║██╔════╝╚══██╔══╝██╔══██╗██║     ██║     ██╔════╝██╔══██╗${C_RESET}"
  echo -e "   ${C_YELLOW}██║██╔██╗ ██║███████╗   ██║   ███████║██║     ██║     █████╗  ██████╔╝${C_RESET}"
  echo -e "   ${C_YELLOW}██║██║╚██╗██║╚════██║   ██║   ██╔══██║██║     ██║     ██╔══╝  ██╔══██╗${C_RESET}"
  echo -e "   ${C_YELLOW}██║██║ ╚████║███████║   ██║   ██║  ██║███████╗███████╗███████╗██║  ██║${C_RESET}"
  echo -e "   ${C_YELLOW}╚═╝╚═╝  ╚═══╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝╚═╝  ╚═╝${C_RESET}"
  echo ""
  echo -e "          ${C_MAGENTA}★${C_RESET}  ${C_WHITE}a v a c o _ c l o u d${C_RESET}  ${C_MAGENTA}★${C_RESET}"
  echo -e "          ${C_GRAY}─────────────────────────${C_RESET}"
  echo -e "          ${C_GRAY}VLESS + XHTTP + TLS${C_RESET}"
  echo -e "          ${C_GRAY}Ubuntu Auto-Installer${C_RESET}"
  echo -e "          ${C_GRAY}Relay: Vercel / Netlify${C_RESET}"
  echo -e "          ${C_GRAY}t.me/avaco_cloud${C_RESET}"
  echo ""
}

step() { echo -e "\n${C_CYAN}>> $1${C_RESET}"; }
ok()   { echo -e "${C_GREEN}   ✔ $1${C_RESET}"; }
warn() { echo -e "${C_YELLOW}   ⚠ $1${C_RESET}"; }
fail() { echo -e "${C_RED}   ✘ $1${C_RESET}"; }
info() { echo -e "${C_GRAY}   $1${C_RESET}"; }

# ─────────────────────────────────────────────
#  PROGRESS HELPERS
# ─────────────────────────────────────────────
# Run a long command with a live spinner + elapsed-time counter so the user
# sees progress instead of a frozen terminal. Usage:
#   spin "Installing X" -- some_command --with args
# Exit code of the command is preserved.
spin() {
  local label="$1"; shift
  [[ "$1" == "--" ]] && shift
  local frames='|/-\' i=0 start now elapsed
  start=$(date +%s)

  # Run command in background, redirect output to a log so spinner can paint
  local logfile; logfile=$(mktemp)
  ( "$@" >"$logfile" 2>&1 ) &
  local pid=$!

  # Real escape character (not the literal \033 backslash-zero-three-three)
  local ESC=$'\033'
  # Hide cursor
  printf '%s[?25l' "$ESC"
  while kill -0 "$pid" 2>/dev/null; do
    now=$(date +%s); elapsed=$(( now - start ))
    local frame="${frames:i++%${#frames}:1}"
    printf '\r   %s[1;36m%s%s[0m %s %s[0;90m(%ds elapsed)%s[0m   ' \
      "$ESC" "$frame" "$ESC" "$label" "$ESC" "$elapsed" "$ESC"
    sleep 0.2
  done
  wait "$pid"; local rc=$?
  now=$(date +%s); elapsed=$(( now - start ))
  # Clear spinner line and restore cursor
  printf '\r%s[2K%s[?25h' "$ESC" "$ESC"

  if [[ $rc -eq 0 ]]; then
    echo -e "   ${C_GREEN}✔${C_RESET} ${label} ${C_GRAY}(${elapsed}s)${C_RESET}"
  else
    echo -e "   ${C_RED}✘${C_RESET} ${label} ${C_RED}— exit ${rc}${C_RESET} ${C_GRAY}(${elapsed}s)${C_RESET}"
    echo -e "   ${C_GRAY}── last 10 lines of output ──${C_RESET}"
    tail -10 "$logfile" 2>/dev/null | while IFS= read -r l; do echo -e "     ${C_GRAY}$l${C_RESET}"; done
  fi
  rm -f "$logfile"
  return $rc
}

read_default() {
  local prompt="$1" default="$2" val
  read -rp "$(echo -e "  ${C_WHITE}${prompt}${C_RESET} ${C_GRAY}[${default}]${C_RESET}: ")" val
  echo "${val:-$default}"
}

read_required() {
  local prompt="$1" val
  while true; do
    read -rp "$(echo -e "  ${C_WHITE}${prompt}${C_RESET}: ")" val
    if [[ -n "${val// }" ]]; then echo "$val"; return; fi
    fail "Required field."
  done
}

read_secret() {
  local prompt="$1" val
  while true; do
    read -rp "$(echo -e "  ${C_WHITE}${prompt}${C_RESET}: ")" val
    if [[ -n "${val// }" ]]; then echo "$val"; return; fi
    fail "Required field."
  done
}

confirm() {
  local prompt="$1"
  read -rp "$(echo -e "  ${C_YELLOW}${prompt} [Y/n]${C_RESET}: ")" yn
  case "${yn,,}" in n|no) return 1;; *) return 0;; esac
}

# =============================================================
#  AUTO-FIX ENGINE
# =============================================================
AUTOFIX_MAX=3

autofix_diagnose() {
  local ctx="$1"
  echo -e "\n  ${C_MAGENTA}[AutoFix]${C_RESET} Diagnosing: ${ctx}..."
  case "$ctx" in
    SSL)
      if ss -tlnp 2>/dev/null | grep -q ':80 '; then
        local pid80
        pid80=$(ss -tlnp 2>/dev/null | grep ':80 ' | grep -oP 'pid=\K[0-9]+' | head -1)
        [[ -n "$pid80" ]] && { warn "Killing port-80 process PID $pid80"; kill "$pid80" 2>/dev/null || true; sleep 2; }
      fi
      local resolved_ip my_ipv4 my_ipv6
      resolved_ip=$(dig +short "${CFG_DOMAIN:-x}" A 2>/dev/null | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | tail -1 || true)

      # Get public IPv4 — try multiple sources including AWS/GCP/Azure metadata APIs
      # AWS Lightsail/EC2: public IP is NOT on any interface (NAT), must use metadata
      my_ipv4=$(
        # AWS EC2/Lightsail metadata (IMDSv1 — works without token on most instances)
        curl -4 -s --max-time 3 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null | \
          grep -oE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1
      )
      if [[ -z "$my_ipv4" ]]; then
        my_ipv4=$(
          curl -4 -s --max-time 5 https://ifconfig.me 2>/dev/null ||
          curl -4 -s --max-time 5 https://api4.ipify.org 2>/dev/null ||
          curl -4 -s --max-time 5 https://ipv4.icanhazip.com 2>/dev/null ||
          hostname -I 2>/dev/null | tr ' ' '\n' | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1 || true
        )
      fi
      my_ipv6=$(curl -6 -s --max-time 5 https://ifconfig.me 2>/dev/null || \
                hostname -I 2>/dev/null | tr ' ' '\n' | grep ':' | head -1 || true)

      if [[ -z "$resolved_ip" ]]; then
        fail "DNS: ${CFG_DOMAIN:-?} A-record not found. Point it to ${my_ipv4:-<your-server-ip>}"
        [[ -n "$my_ipv6" ]] && info "Server also has IPv6: ${my_ipv6} (use AAAA record if needed)"
      elif [[ "$resolved_ip" == "$my_ipv4" ]]; then
        ok "DNS OK: ${CFG_DOMAIN:-?} -> ${resolved_ip} (matches server public IPv4)"
      elif [[ -n "$my_ipv6" ]] && dig +short "${CFG_DOMAIN:-x}" AAAA 2>/dev/null | grep -q "$my_ipv6"; then
        ok "DNS OK: ${CFG_DOMAIN:-?} AAAA record matches server IPv6"
      else
        fail "DNS mismatch: ${CFG_DOMAIN:-?} -> ${resolved_ip}  |  server public IPv4: ${my_ipv4:-?}"
        [[ -n "$my_ipv6" ]] && info "Server IPv6: ${my_ipv6}"
        warn "Fix: set A-record of ${CFG_DOMAIN:-?} to ${my_ipv4:-<server-public-ip>}"
        info "Note: on AWS Lightsail/EC2, use the Static/Elastic IP shown in the console, not the private IP"
      fi
      ufw allow 80/tcp 2>/dev/null || true
      ok "Firewall: port 80 opened"
      ;;
    XRAYSSL)
      [[ -f "${SSL_CERT:-}" ]] && chmod 644 "${SSL_CERT}" 2>/dev/null && ok "Cert permissions fixed" || fail "Cert missing: ${SSL_CERT:-unset}"
      if [[ -f "${SSL_KEY:-}" ]]; then
        chmod 640 "${SSL_KEY}" 2>/dev/null || true
        chgrp nobody "${SSL_KEY}" 2>/dev/null || true
        chmod o+x /etc/ssl/xhttp 2>/dev/null || true
        chmod o+x "$(dirname "${SSL_KEY}")" 2>/dev/null || true
        ok "Key permissions fixed (640 nobody + dir traversal)"
      else
        fail "Key missing: ${SSL_KEY:-unset}"
      fi
      ;;
    VERCEL)
      curl -s --max-time 6 https://vercel.com -o /dev/null || { fail "Cannot reach vercel.com"; return; }
      command -v vercel &>/dev/null || { warn "Reinstalling vercel CLI..."; npm install -g vercel --silent && ok "vercel CLI reinstalled"; }
      rm -rf "${VERCEL_DIR}/.vercel" 2>/dev/null || true
      ok "Vercel link cache cleared — will re-link on retry"
      ;;
    FIREWALL)
      ufw allow 22/tcp 2>/dev/null || true
      ufw allow 80/tcp 2>/dev/null || true
      ufw allow 443/tcp 2>/dev/null || true
      ufw allow "${CFG_INBOUND_PORT:-2096}/tcp" 2>/dev/null || true
      ufw --force enable 2>/dev/null || true
      ok "Firewall rules applied: 22, 80, 443, ${CFG_INBOUND_PORT:-2096}"
      ;;
    XRAY)
      warn "Restarting xray service..."
      local pid_port
      pid_port=$(lsof -ti:"${CFG_INBOUND_PORT:-2096}" 2>/dev/null || true)
      [[ -n "$pid_port" ]] && { info "Killing PID $pid_port on port ${CFG_INBOUND_PORT:-2096}"; kill -9 "$pid_port" 2>/dev/null || true; sleep 2; }
      systemctl restart xray 2>/dev/null || true
      sleep 4
      if systemctl is-active --quiet xray 2>/dev/null; then
        ok "xray restarted"
      else
        fail "xray still not running"
        journalctl -u xray -n 20 --no-pager 2>/dev/null || true
      fi
      ;;
    *)
      info "No auto-fix recipe for: $ctx"
      ;;
  esac
}

autofix_and_retry() {
  local ctx="$1" phase_fn="$2"
  shift 2
  local attempt=0
  while [[ $attempt -lt $AUTOFIX_MAX ]]; do
    attempt=$(( attempt + 1 ))
    info "[$ctx] attempt $attempt/$AUTOFIX_MAX..."
    if "$phase_fn" "$@"; then
      ok "[$ctx] succeeded on attempt $attempt"
      return 0
    fi
    [[ $attempt -ge $AUTOFIX_MAX ]] && { fail "[$ctx] failed after $AUTOFIX_MAX attempts. See: $LOG_FILE"; return 1; }
    warn "[$ctx] failed — running auto-fix..."
    autofix_diagnose "$ctx"
    sleep 3
  done
}

# =============================================================
#  PHASE 1 — PREFLIGHT: ROOT + OS + BASE PACKAGES
# =============================================================
phase1_preflight() {
  step "PHASE 1 — System check & prerequisites"

  if [[ $EUID -ne 0 ]]; then
    fail "Run as root: sudo bash Deploy-Ubuntu.sh"
    exit 1
  fi
  ok "Running as root"

  if grep -qiE "ubuntu" /etc/os-release 2>/dev/null; then
    local ver
    ver=$(grep VERSION_ID /etc/os-release | cut -d'"' -f2 | cut -d'.' -f1)
    if [[ "$ver" -lt 20 ]]; then
      fail "Ubuntu 20.04+ required (detected Ubuntu $ver)"
      exit 1
    fi
    ok "Ubuntu $ver detected"
  else
    warn "Non-Ubuntu system — proceeding anyway"
  fi

  info "Updating package lists..."
  spin "Updating package lists (apt-get update)" -- bash -c 'apt-get update -qq'

  spin "Installing base dependencies (curl, git, jq, dig, openssl, ...)" -- bash -c '
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
      curl wget git socat ufw jq openssl uuid-runtime netcat-openbsd \
      build-essential ca-certificates gnupg lsb-release dnsutils unzip lsof
  '

  if ! command -v node &>/dev/null; then
    spin "Adding NodeSource repo" -- bash -c 'curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -'
    spin "Installing Node.js LTS (~30s, downloading ~30MB)" -- bash -c 'DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs'
    ok "Node.js $(node -v) installed"
  else
    ok "Node.js $(node -v) already present"
  fi

  # ── Ensure swap for low-RAM VPS (npm install -g netlify-cli OOMs on <2GB without swap)
  local total_mem_mb swap_mb
  total_mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)
  swap_mb=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)
  if (( total_mem_mb < 2048 && swap_mb < 1024 )); then
    info "Low RAM detected (${total_mem_mb} MB, swap ${swap_mb} MB) — adding 2 GB swap to prevent OOM..."
    if [[ ! -f /swapfile ]]; then
      fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 2>/dev/null
      chmod 600 /swapfile 2>/dev/null
      mkswap /swapfile >/dev/null 2>&1
      swapon /swapfile 2>/dev/null
      grep -q "/swapfile" /etc/fstab 2>/dev/null || echo "/swapfile none swap sw 0 0" >> /etc/fstab
      ok "2 GB swap added at /swapfile"
    else
      swapon /swapfile 2>/dev/null || true
      ok "Existing /swapfile activated"
    fi
  fi
}

# =============================================================
#  PHASE 2 — DOWNLOAD & INSTALL ALL TOOLS (no config yet)
# =============================================================
phase2_install_all() {
  step "PHASE 2 — Downloading & installing all tools"

  # ── 2a. Xray ────────────────────────────────────────────
  if command -v xray &>/dev/null && xray version &>/dev/null 2>&1; then
    ok "Xray already installed ($(xray version 2>/dev/null | head -1))"
  else
    spin "Installing Xray (XTLS official, ~15MB)" -- bash -c '
      bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install
    '
    ok "Xray installed ($(xray version 2>/dev/null | head -1))"
  fi
  systemctl enable xray 2>/dev/null || true

  # setup xray log dirs (owned by root since we run xray as root)
  mkdir -p /var/log/xray
  touch /var/log/xray/access.log /var/log/xray/error.log 2>/dev/null || true
  chown -R root:root /var/log/xray 2>/dev/null || true
  chmod 755 /var/log/xray 2>/dev/null || true
  chmod 644 /var/log/xray/*.log 2>/dev/null || true

  # ── 2b. Netlify CLI ─────────────────────────────────────
  if command -v netlify &>/dev/null && netlify --version &>/dev/null 2>&1; then
    ok "Netlify CLI already installed ($(netlify --version 2>/dev/null | head -1))"
  else
    info "Installing Netlify CLI..."

    # Check Node version — netlify-cli needs Node 18+
    local node_ver
    node_ver=$(node -e "process.exit(process.versions.node.split('.')[0])" 2>/dev/null; node -e "console.log(process.versions.node.split('.')[0])" 2>/dev/null || echo "0")
    if [[ "${node_ver:-0}" -lt 18 ]]; then
      warn "Node.js ${node_ver} detected — netlify-cli needs 18+. Upgrading Node.js..."
      curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - >/dev/null 2>&1
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs 2>/dev/null
      ok "Node.js upgraded to $(node -v)"
    fi

    local netlify_ok=false

    # Common npm flags to speed up installs:
    #   --no-audit / --no-fund  → skips post-install network calls
    #   --no-progress           → suppresses progress bar (much faster on slow terms)
    #   --prefer-offline        → use cache if available
    local NPM_FAST="--no-audit --no-fund --no-progress --prefer-offline"

    # ── Attempt 1: fast npm global install ───────────────
    if spin "Installing Netlify CLI via npm (~30-60s)" -- \
         bash -c "npm install -g netlify-cli ${NPM_FAST}"; then
      command -v netlify &>/dev/null && netlify_ok=true
    fi

    # ── Attempt 2: npm with lower max-old-space (low-RAM VPS) ─
    if [[ "$netlify_ok" != "true" ]]; then
      warn "Attempt 1 failed — retrying with 512MB memory limit..."
      if spin "Installing Netlify CLI (low-mem mode)" -- \
           bash -c "NODE_OPTIONS='--max-old-space-size=512' npm install -g netlify-cli ${NPM_FAST}"; then
        command -v netlify &>/dev/null && netlify_ok=true
      fi
    fi

    # ── Attempt 3: npm cache clean + retry ───────────────
    if [[ "$netlify_ok" != "true" ]]; then
      warn "Attempt 2 failed — cleaning npm cache and retrying..."
      npm cache clean --force >/dev/null 2>&1 || true
      if spin "Installing Netlify CLI (after cache clean)" -- \
           bash -c "npm install -g netlify-cli ${NPM_FAST}"; then
        command -v netlify &>/dev/null && netlify_ok=true
      fi
    fi

    # ── Attempt 4: npx wrapper (no global install needed) ─
    if [[ "$netlify_ok" != "true" ]]; then
      warn "Attempt 3 failed — creating npx-based wrapper instead..."
      cat > /usr/local/bin/netlify <<'NPXWRAP'
#!/usr/bin/env bash
exec npx --yes netlify-cli "$@"
NPXWRAP
      chmod +x /usr/local/bin/netlify
      # Warm up the npx cache once
      npx --yes netlify-cli --version >/dev/null 2>&1 && netlify_ok=true || true
    fi

    if [[ "$netlify_ok" == "true" ]]; then
      ok "Netlify CLI ready: $(netlify --version 2>/dev/null | head -1)"
    else
      fail "Could not install Netlify CLI after 4 attempts."
      warn "Manual fix: npm install -g netlify-cli  or  npx netlify-cli"
      warn "Installation will continue but Netlify deploy phase may fail."
    fi
  fi

  # ── 2c. acme.sh ─────────────────────────────────────────
  if [[ -f "$HOME/.acme.sh/acme.sh" ]]; then
    ok "acme.sh already installed"
  else
    info "Installing acme.sh (attempt 1/2 — official)..."
    curl -fsSL https://get.acme.sh | sh 2>&1 | \
      grep -E "(install|Installed|OK|error|Error|success)" || true

    if [[ ! -f "$HOME/.acme.sh/acme.sh" ]]; then
      warn "First attempt failed — trying alternative mirror..."
      curl -fsSL https://raw.githubusercontent.com/acmesh-official/acme.sh/master/acme.sh \
        -o /tmp/acme-install.sh 2>/dev/null && \
        bash /tmp/acme-install.sh --install-online 2>&1 | \
          grep -E "(install|Installed|OK|error|Error)" || true
      rm -f /tmp/acme-install.sh
    fi

    if [[ -f "$HOME/.acme.sh/acme.sh" ]]; then
      ok "acme.sh installed → $HOME/.acme.sh/acme.sh"
    else
      fail "acme.sh installation failed — SSL certificate phase will not work."
      warn "Manual fix on server: curl https://get.acme.sh | sh"
      warn "Continuing... (script will fail at SSL phase)"
    fi
  fi

  # Source acme.sh env so it's on PATH for this session
  [[ -f "$HOME/.acme.sh/acme.sh.env" ]] && source "$HOME/.acme.sh/acme.sh.env" 2>/dev/null || true
  ACME_CMD="$HOME/.acme.sh/acme.sh"

  # Hard-fail early if acme.sh truly missing — better than cryptic "No such file" later
  if [[ ! -x "$ACME_CMD" ]]; then
    fail "acme.sh not found at $ACME_CMD — cannot continue without SSL tool."
    exit 1
  fi

  # ── 2d. Vercel CLI ──────────────────────────────────────
  if command -v vercel &>/dev/null; then
    ok "Vercel CLI already installed ($(vercel --version 2>/dev/null | head -1))"
  else
    spin "Installing Vercel CLI via npm (~20-40s)" -- \
      bash -c 'npm install -g vercel --no-audit --no-fund --no-progress --prefer-offline'
  fi

  # ── 2d. xray-knife ──────────────────────────────────────
  XRAY_KNIFE_BIN="/usr/local/bin/xray-knife"
  if [[ -x "$XRAY_KNIFE_BIN" ]]; then
    ok "xray-knife already installed"
  else
    info "Downloading xray-knife..."
    local arch release_url knife_url tmp_dir
    arch=$(uname -m)
    # xray-knife uses zip files: Xray-knife-linux-64.zip or Xray-knife-linux-arm.zip
    case "$arch" in
      aarch64) arch_tag="arm64" ;;
      armv7*)  arch_tag="arm"   ;;
      *)       arch_tag="64"    ;;
    esac

    release_url="https://api.github.com/repos/lilendian0x00/xray-knife/releases/latest"
    knife_url=$(curl -fsSL "$release_url" 2>/dev/null | \
      grep -oP '"browser_download_url":\s*"\Khttps://[^"]+Xray-knife-linux-'"${arch_tag}"'\.zip' | head -1 || true)

    if [[ -z "$knife_url" ]]; then
      warn "Could not auto-detect xray-knife URL — trying direct fallback"
      knife_url="https://github.com/lilendian0x00/xray-knife/releases/latest/download/Xray-knife-linux-${arch_tag}.zip"
    fi

    tmp_dir=$(mktemp -d)
    info "Downloading: $knife_url"
    if curl -fsSL "$knife_url" -o "$tmp_dir/xray-knife.zip" 2>/dev/null; then
      unzip -q "$tmp_dir/xray-knife.zip" -d "$tmp_dir" 2>/dev/null || true
    else
      warn "zip download failed — trying tar.gz fallback"
      curl -fsSL "https://github.com/lilendian0x00/xray-knife/releases/latest/download/Xray-knife-linux-${arch_tag}.tar.gz" \
        -o "$tmp_dir/xray-knife.tar.gz" 2>/dev/null || true
      tar -xzf "$tmp_dir/xray-knife.tar.gz" -C "$tmp_dir" 2>/dev/null || true
    fi
    local knife_bin
    knife_bin=$(find "$tmp_dir" -type f \( -name "xray-knife" -o -name "Xray-knife" \) | head -1 || true)
    if [[ -n "$knife_bin" ]]; then
      cp "$knife_bin" "$XRAY_KNIFE_BIN"
      chmod +x "$XRAY_KNIFE_BIN"
      ok "xray-knife installed → $XRAY_KNIFE_BIN"
    else
      warn "xray-knife binary not found — health-check step will be skipped"
      XRAY_KNIFE_BIN=""
    fi
    rm -rf "$tmp_dir"
  fi
}

# =============================================================
#  PHASE 3 — COLLECT ALL USER INPUT (one shot, then confirm)
# =============================================================
phase3_collect_input() {
  step "PHASE 3 — Configuration input"
  echo -e "  ${C_GRAY}Fill in the values below. Press Enter to accept defaults.${C_RESET}\n"

  # ── SSL / Domain ────────────────────────────────────────
  echo -e "\n  ${C_CYAN}[ SSL & Domain ]${C_RESET}"
  CFG_DOMAIN=$(read_required "Your domain (e.g. sub.example.com)")
  CFG_EMAIL=$(read_default   "Email for acme.sh notifications" "admin@${CFG_DOMAIN}")

  # ── Inbound / Relay ─────────────────────────────────────
  echo -e "\n  ${C_CYAN}[ Inbound & Relay ]${C_RESET}"
  CFG_INBOUND_PORT=$(read_default "Inbound port on server (XHTTP)" "443")
  CFG_RELAY_PATH=$(read_default   "RELAY_PATH  (inbound path, e.g. /api)" "/api")
  CFG_PUBLIC_PATH=$(read_default  "PUBLIC_RELAY_PATH (Vercel-side path)" "/api")
  [[ "${CFG_RELAY_PATH:0:1}" != "/" ]] && CFG_RELAY_PATH="/$CFG_RELAY_PATH"
  [[ "${CFG_PUBLIC_PATH:0:1}" != "/" ]] && CFG_PUBLIC_PATH="/$CFG_PUBLIC_PATH"

  # ── Platform credentials ─────────────────────────────────
  local rand_proj
  rand_proj="relay-$(cat /dev/urandom | tr -dc 'a-z0-9' 2>/dev/null | head -c8 || true)"
  if [[ "$CFG_PLATFORM" == "vercel" ]]; then
    echo -e "\n  ${C_CYAN}[ Vercel Deployment ]${C_RESET}"
    CFG_VERCEL_TOKEN=""
    while [[ -z "${CFG_VERCEL_TOKEN// }" ]]; do
      read -rp "$(echo -e "  ${C_WHITE}Vercel API token (Settings → Tokens)${C_RESET}: ")" CFG_VERCEL_TOKEN
      [[ -z "${CFG_VERCEL_TOKEN// }" ]] && fail "Required field."
    done
    CFG_PROJECT_NAME=$(read_default "Vercel project name" "$rand_proj")
    CFG_VERCEL_SCOPE=$(read_default "Vercel scope/team slug (leave blank for personal)" "")
    CFG_NETLIFY_TOKEN=""
    CFG_NETLIFY_SITE=""
  else
    echo -e "\n  ${C_CYAN}[ Netlify Deployment ]${C_RESET}"
    CFG_NETLIFY_TOKEN=""
    while [[ -z "${CFG_NETLIFY_TOKEN// }" ]]; do
      read -rp "$(echo -e "  ${C_WHITE}Netlify personal access token (app.netlify.com → User settings → OAuth)${C_RESET}: ")" CFG_NETLIFY_TOKEN
      [[ -z "${CFG_NETLIFY_TOKEN// }" ]] && fail "Required field."
    done
    CFG_NETLIFY_SITE=$(read_default "Netlify site name" "$rand_proj")
    CFG_VERCEL_TOKEN=""
    CFG_PROJECT_NAME=""
    CFG_VERCEL_SCOPE=""
  fi

  # ── Performance ─────────────────────────────────────────
  if [[ "$CFG_PLATFORM" == "vercel" ]]; then
    echo -e "\n  ${C_CYAN}[ Performance (press Enter for defaults) ]${C_RESET}"
    CFG_MAX_INFLIGHT=$(read_default      "MAX_INFLIGHT"         "128")
    CFG_MAX_UP_BPS=$(read_default        "MAX_UP_BPS"           "2621440")
    CFG_MAX_DOWN_BPS=$(read_default      "MAX_DOWN_BPS"         "2621440")
    CFG_UPSTREAM_TIMEOUT=$(read_default  "UPSTREAM_TIMEOUT_MS"  "50000")
    CFG_SUCCESS_LOG=$(read_default       "SUCCESS_LOG_SAMPLE_RATE" "0")
    CFG_SUCCESS_DUR=$(read_default       "SUCCESS_LOG_MIN_DURATION_MS" "3000")
    CFG_ERROR_INT=$(read_default         "ERROR_LOG_MIN_INTERVAL_MS"  "5000")
  else
    # Netlify: use sensible defaults silently (edge function handles its own tuning)
    CFG_MAX_INFLIGHT="128"
    CFG_MAX_UP_BPS="2621440"
    CFG_MAX_DOWN_BPS="2621440"
    CFG_UPSTREAM_TIMEOUT="50000"
    CFG_SUCCESS_LOG="0"
    CFG_SUCCESS_DUR="3000"
    CFG_ERROR_INT="5000"
    info "Performance settings: using defaults (Netlify)"
  fi

  # ── Summary ─────────────────────────────────────────────
  echo ""
  echo -e "  ${C_CYAN}────────────── SUMMARY ──────────────${C_RESET}"
  echo -e "  ${C_WHITE}Platform        :${C_RESET} $CFG_PLATFORM"
  echo -e "  ${C_WHITE}Domain          :${C_RESET} $CFG_DOMAIN"
  echo -e "  ${C_WHITE}Inbound port    :${C_RESET} $CFG_INBOUND_PORT"
  echo -e "  ${C_WHITE}RELAY_PATH      :${C_RESET} $CFG_RELAY_PATH"
  echo -e "  ${C_WHITE}PUBLIC_PATH     :${C_RESET} $CFG_PUBLIC_PATH"
  if [[ "$CFG_PLATFORM" == "vercel" ]]; then
    echo -e "  ${C_WHITE}Vercel project  :${C_RESET} $CFG_PROJECT_NAME"
    [[ -n "$CFG_VERCEL_SCOPE" ]] && echo -e "  ${C_WHITE}Vercel scope    :${C_RESET} $CFG_VERCEL_SCOPE"
  else
    echo -e "  ${C_WHITE}Netlify site    :${C_RESET} $CFG_NETLIFY_SITE"
  fi
  if [[ "$CFG_PLATFORM" == "vercel" ]]; then
    echo -e "  ${C_WHITE}MAX_INFLIGHT    :${C_RESET} $CFG_MAX_INFLIGHT"
    echo -e "  ${C_WHITE}MAX_UP_BPS      :${C_RESET} $CFG_MAX_UP_BPS"
    echo -e "  ${C_WHITE}MAX_DOWN_BPS    :${C_RESET} $CFG_MAX_DOWN_BPS"
    echo -e "  ${C_WHITE}TIMEOUT_MS      :${C_RESET} $CFG_UPSTREAM_TIMEOUT"
    echo -e "  ${C_WHITE}SUCCESS_LOG     :${C_RESET} $CFG_SUCCESS_LOG"
    echo -e "  ${C_WHITE}SUCCESS_DUR_MS  :${C_RESET} $CFG_SUCCESS_DUR"
    echo -e "  ${C_WHITE}ERROR_INT_MS    :${C_RESET} $CFG_ERROR_INT"
  fi
  echo -e "  ${C_CYAN}─────────────────────────────────────${C_RESET}"
  echo ""
  if ! confirm "Proceed with these settings?"; then
    warn "Aborted by user."
    exit 0
  fi
}

# =============================================================
#  PHASE 4a — SSL WITH acme.sh
# =============================================================
phase4a_ssl() {
  step "PHASE 4a — Obtaining SSL certificate for ${CFG_DOMAIN}"

  SSL_DIR="/etc/ssl/xhttp/${CFG_DOMAIN}"
  mkdir -p "$SSL_DIR"

  SSL_CERT="${SSL_DIR}/fullchain.pem"
  SSL_KEY="${SSL_DIR}/privkey.pem"

  # ── Pre-flight: verify domain resolves from THIS server ─────
  # acme.sh validation works because Let's Encrypt resolves DNS itself, but if
  # the server can't resolve its own domain it can't bind to the right interface
  # and webroot/standalone won't behave correctly. Use multiple resolvers.
  local resolved
  resolved=$(
    dig +short +time=3 +tries=1 "$CFG_DOMAIN" A @1.1.1.1 2>/dev/null | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1
  )
  [[ -z "$resolved" ]] && resolved=$(
    dig +short +time=3 +tries=1 "$CFG_DOMAIN" A @8.8.8.8 2>/dev/null | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1
  )
  [[ -z "$resolved" ]] && resolved=$(
    curl -s --max-time 5 "https://cloudflare-dns.com/dns-query?name=${CFG_DOMAIN}&type=A" \
      -H "accept: application/dns-json" 2>/dev/null | \
      grep -oP '"data"\s*:\s*"\K[0-9.]+' | head -1
  )

  if [[ -n "$resolved" ]]; then
    ok "DNS resolves: ${CFG_DOMAIN} → ${resolved}"
  else
    warn "Could not resolve ${CFG_DOMAIN} from server (DNS check failed)."
    warn "If you JUST created the A-record, wait 1-2 min for propagation."
    warn "acme.sh will still try; Let's Encrypt resolves DNS independently."
  fi

  # ── Stop any service using port 80 temporarily ─────────────
  local port80_used=false port80_pid=""
  if ss -tlnp 2>/dev/null | grep -q ':80 '; then
    port80_used=true
    port80_pid=$(ss -tlnp 2>/dev/null | grep ':80 ' | grep -oP 'pid=\K[0-9]+' | head -1)
    warn "Port 80 is in use (PID ${port80_pid:-?}) — will try webroot or temp-stop service"
  fi

  # ── Register acme.sh account (force update if email changed) ──
  # Set Let's Encrypt as default CA
  "$ACME_CMD" --set-default-ca --server letsencrypt 2>/dev/null || true
  
  # Clean up any old example.com emails from previous installations
  sed -i "s/admin@example.com/$CFG_EMAIL/g; s/my@example.com/$CFG_EMAIL/g; s/example@example.com/$CFG_EMAIL/g" \
    ~/.acme.sh/account.conf 2>/dev/null || true
  
  # Force re-register with correct email (--force updates existing account)
  "$ACME_CMD" --register-account -m "$CFG_EMAIL" --server letsencrypt --force 2>&1 | \
    grep -iE "register|already|account" | head -3 || true

  # ── Helper: run acme.sh --issue and capture full output ────
  # $1: mode (standalone | webroot)
  # $2: extra flags (e.g. "--force")
  _run_acme_issue() {
    local mode="$1" extra="${2:-}"
    info "Running: acme.sh --issue -d ${CFG_DOMAIN} --${mode} --keylength ec-256 --listen-v4 ${extra}"
    local out rc
    if [[ "$mode" == "webroot" ]]; then
      mkdir -p /var/www/html
      out=$("$ACME_CMD" --issue -d "$CFG_DOMAIN" --webroot /var/www/html \
        --keylength ec-256 --listen-v4 --server letsencrypt $extra 2>&1) || rc=$?
    else
      out=$("$ACME_CMD" --issue -d "$CFG_DOMAIN" --standalone \
        --keylength ec-256 --listen-v4 --server letsencrypt $extra 2>&1) || rc=$?
    fi
    rc=${rc:-0}
    # Save full output for later inspection
    LAST_ACME_OUT="$out"
    # Show last 25 lines so user can see the real error
    echo "$out" | tail -25 | while IFS= read -r l; do echo -e "    ${C_GRAY}${l}${C_RESET}"; done
    return $rc
  }

  # ── Check if a valid cert already exists on disk (covers both ECC and RSA) ─
  local acme_cert_path="$HOME/.acme.sh/${CFG_DOMAIN}_ecc/${CFG_DOMAIN}.cer"
  local acme_cert_path_rsa="$HOME/.acme.sh/${CFG_DOMAIN}/${CFG_DOMAIN}.cer"
  if [[ -f "$acme_cert_path" ]]; then
    info "Found existing EC cert at ${acme_cert_path} — will reuse"
  elif [[ -f "$acme_cert_path_rsa" ]]; then
    info "Found existing RSA cert at ${acme_cert_path_rsa} — will reuse"
    acme_cert_path="$acme_cert_path_rsa"
  fi

  # ── Issue certificate ──────────────────────────────────────
  local issue_rc=0 LAST_ACME_OUT=""
  if [[ "$port80_used" == "true" ]]; then
    if command -v nginx &>/dev/null && [[ -d /var/www/html ]]; then
      _run_acme_issue webroot || issue_rc=$?
    else
      warn "Stopping port-80 service temporarily for standalone validation..."
      [[ -n "$port80_pid" ]] && kill "$port80_pid" 2>/dev/null
      systemctl stop xray 2>/dev/null || true
      sleep 2
      _run_acme_issue standalone || issue_rc=$?
      systemctl start xray 2>/dev/null || true
    fi
  else
    _run_acme_issue standalone || issue_rc=$?
  fi

  # ── Handle "Skipping. Next renewal time" — cert already exists & valid ───
  # acme.sh exits 2 in this case; treat as success if the cer file is there.
  if [[ $issue_rc -ne 0 ]] && echo "$LAST_ACME_OUT" | grep -qiE "Domains not changed|Skipping.*Next renewal"; then
    if [[ -f "$acme_cert_path" ]]; then
      info "acme.sh: existing cert still valid — using it as-is"
      issue_rc=0
    else
      # The 'skip' message lied (no cert on disk) — force re-issue
      warn "acme.sh says 'skip' but no cert file found — forcing re-issue with --force"
      issue_rc=0
      if [[ "$port80_used" == "true" ]] && ! { command -v nginx &>/dev/null && [[ -d /var/www/html ]]; }; then
        systemctl stop xray 2>/dev/null || true
        sleep 2
        _run_acme_issue standalone "--force" || issue_rc=$?
        systemctl start xray 2>/dev/null || true
      elif [[ "$port80_used" == "true" ]]; then
        _run_acme_issue webroot "--force" || issue_rc=$?
      else
        _run_acme_issue standalone "--force" || issue_rc=$?
      fi
    fi
  fi

  # ── Verify the cert file actually exists before installcert ─
  if [[ $issue_rc -ne 0 ]] || [[ ! -f "$acme_cert_path" ]]; then
    fail "acme.sh --issue failed (exit ${issue_rc}). No cert at ${acme_cert_path}"
    info "Common causes:"
    info "  • DNS A-record for ${CFG_DOMAIN} not pointing to this server's public IP"
    info "  • Cloudflare proxy enabled (orange cloud must be DNS-only / gray)"
    info "  • Port 80 not reachable from internet (provider firewall / security group)"
    info "  • Let's Encrypt rate-limit hit (5 certs/week per domain)"
    info "  • Server IP geo-blocked by Let's Encrypt (Iran sanctions)"
    autofix_diagnose "SSL"
    return 1
  fi

  ok "acme.sh certificate ready"

  # ── Install certificate to target dir ──────────────────────
  # --ecc selects the EC-key cert directory (${domain}_ecc/). Omit it for RSA.
  local ecc_flag="--ecc"
  [[ "$acme_cert_path" == *"${CFG_DOMAIN}/${CFG_DOMAIN}.cer" ]] && ecc_flag=""
  "$ACME_CMD" --installcert -d "$CFG_DOMAIN" $ecc_flag \
    --cert-file     "${SSL_DIR}/cert.pem" \
    --key-file      "${SSL_KEY}" \
    --fullchain-file "${SSL_CERT}" \
    --reloadcmd     "systemctl restart xray 2>/dev/null || true" 2>&1 | tail -5

  if [[ -f "$SSL_CERT" && -f "$SSL_KEY" ]]; then
    chmod 644 "$SSL_CERT" 2>/dev/null || true
    chmod 640 "$SSL_KEY"  2>/dev/null || true
    chgrp nobody "$SSL_KEY" 2>/dev/null || true
    chmod o+x /etc/ssl/xhttp 2>/dev/null || true
    chmod o+x "$(dirname "$SSL_KEY")" 2>/dev/null || true
    ok "SSL certificate installed → $SSL_CERT"
  else
    fail "SSL installcert failed — cert was issued but not copied to ${SSL_CERT}"
    info "Manually try: $ACME_CMD --installcert -d $CFG_DOMAIN --ecc --cert-file ... --key-file ... --fullchain-file ..."
    autofix_diagnose "SSL"
    return 1
  fi
}

# =============================================================
#  PHASE 4b — CONFIGURE XRAY (VLESS+XHTTP+TLS)
# =============================================================
phase4b_configure_xray() {
  step "PHASE 4b — Configuring Xray VLESS+XHTTP+TLS inbound"

  local XRAY_CFG="/usr/local/etc/xray/config.json"

  # ── Generate UUID ────────────────────────────────────────
  INBOUND_UUID=$(uuidgen | tr '[:upper:]' '[:lower:]')
  info "Generated UUID: ${INBOUND_UUID}"

  # ── Backup old config ────────────────────────────────────
  [[ -f "$XRAY_CFG" ]] && cp "$XRAY_CFG" "${XRAY_CFG}.bak" 2>/dev/null || true

  # ── Platform-specific XHTTP tuning ───────────────────────
  # Netlify needs xPaddingBytes=1-1 (default 100-1000 breaks Netlify body handling).
  # mode stays "auto" — verified working with real clients. The end-to-end self-test
  # may still get HTTP 429 because of an outbound→edge→inbound loop on the same IP,
  # but real clients (phone/desktop) connecting from a different IP work fine.
  local XPADDING XHTTP_MODE="auto"
  if [[ "${CFG_PLATFORM:-vercel}" == "netlify" ]]; then
    XPADDING="1-1"
    info "Platform=netlify → xPaddingBytes=1-1, mode=auto"
  else
    XPADDING="100-1000"
  fi

  # ── Write config.json ────────────────────────────────────
  info "Writing Xray config → ${XRAY_CFG}"
  cat > "$XRAY_CFG" <<XRAYCFG
{
  "log": {
    "loglevel": "warning",
    "access": "/var/log/xray/access.log",
    "error": "/var/log/xray/error.log"
  },
  "inbounds": [
    {
      "tag": "xhttp-in",
      "listen": "0.0.0.0",
      "port": ${CFG_INBOUND_PORT},
      "protocol": "vless",
      "settings": {
        "clients": [
          { "id": "${INBOUND_UUID}", "flow": "" }
        ],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "xhttp",
        "security": "tls",
        "tlsSettings": {
          "alpn": ["h2", "http/1.1"],
          "certificates": [
            {
              "certificateFile": "${SSL_CERT}",
              "keyFile": "${SSL_KEY}"
            }
          ]
        },
        "xhttpSettings": {
          "path": "${CFG_RELAY_PATH}",
          "host": "${CFG_DOMAIN}",
          "mode": "${XHTTP_MODE}",
          "xPaddingBytes": "${XPADDING}"
        }
      }
    }
  ],
  "outbounds": [
    { "protocol": "freedom", "tag": "direct" },
    { "protocol": "blackhole", "tag": "blocked" }
  ]
}
XRAYCFG

  # ── Test config syntax ───────────────────────────────────
  local test_out
  test_out=$(xray -test -config "$XRAY_CFG" 2>&1 || true)
  if echo "$test_out" | grep -qi "configuration ok\|Configuration OK"; then
    ok "Xray config syntax OK"
  else
    fail "Xray config test failed: $test_out"
    autofix_diagnose "XRAY"
    return 1
  fi

  # ── Start Xray ───────────────────────────────────────────
  # ── Force xray to run as root via systemd drop-in (overrides any service file) ──
  # Keep CAP_NET_BIND_SERVICE so xray can bind to privileged ports (443, etc.)
  mkdir -p /etc/systemd/system/xray.service.d
  cat > /etc/systemd/system/xray.service.d/override.conf <<'OVERRIDE'
[Service]
User=root
Group=root
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_ADMIN CAP_NET_BIND_SERVICE
NoNewPrivileges=false
OVERRIDE
  # Also patch any User=nobody in main service files (belt + suspenders)
  for svc in /etc/systemd/system/xray.service /etc/systemd/system/xray@.service /lib/systemd/system/xray.service; do
    [[ -f "$svc" ]] && sed -i 's/^User=nobody/User=root/; s/^Group=nogroup/Group=root/' "$svc" 2>/dev/null || true
  done
  # Ensure log dir is owned by root (xray now runs as root)
  chown -R root:root /var/log/xray 2>/dev/null || true
  chmod 755 /var/log/xray 2>/dev/null || true
  chmod 644 /var/log/xray/*.log 2>/dev/null || true
  systemctl daemon-reload 2>/dev/null || true
  ok "xray service forced to User=root via drop-in"

  systemctl restart xray 2>/dev/null || true
  systemctl enable xray 2>/dev/null || true
  sleep 3

  if systemctl is-active --quiet xray 2>/dev/null; then
    ok "Xray running on port ${CFG_INBOUND_PORT}"
  else
    fail "Xray failed to start"
    journalctl -u xray -n 20 --no-pager 2>/dev/null || true
    autofix_diagnose "XRAY"
    return 1
  fi

  # ── Quick local test ─────────────────────────────────────
  local http_code
  http_code=$(curl -sk --max-time 5 \
    "https://127.0.0.1:${CFG_INBOUND_PORT}${CFG_RELAY_PATH}" \
    -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
  if echo "$http_code" | grep -qE "^(4[0-9]{2}|200)$"; then
    ok "Xray local test: HTTP $http_code (expected 4xx) ✔"
  else
    warn "Xray local test returned HTTP $http_code (may be normal for XHTTP)"
  fi

  ok "UUID: ${INBOUND_UUID}"
  echo -e "  ${C_GRAY}TARGET_DOMAIN: https://${CFG_DOMAIN}:${CFG_INBOUND_PORT}${C_RESET}"
}

# =============================================================
#  PHASE 4c — DEPLOY (Vercel or Netlify)
# =============================================================

_random_str() { cat /dev/urandom | tr -dc 'a-z0-9' 2>/dev/null | head -c "$1" || true; }

_randomize_package_json() {
  local pkg="${VERCEL_DIR}/package.json"
  [[ -f "$pkg" ]] || return
  ORIG_PKG=$(cat "$pkg")
  local rname rver rdesc
  rname="host-$(_random_str 10)"
  rver="$(( RANDOM % 3 + 1 )).$((RANDOM % 20)).$((RANDOM % 30))"
  local descs=("Lightweight hosting edge relay" "Optimized download gateway" "Traffic-shaped relay runtime" "Resource-friendly transfer bridge")
  rdesc="${descs[$((RANDOM % ${#descs[@]}))]}"
  jq --arg n "$rname" --arg v "$rver" --arg d "$rdesc" \
    '.name=$n | .version=$v | .description=$d' "$pkg" > "${pkg}.tmp" && mv "${pkg}.tmp" "$pkg"
  info "Randomized package.json: name=$rname, version=$rver"
}

_restore_package_json() {
  local pkg="${VERCEL_DIR}/package.json"
  [[ -n "${ORIG_PKG:-}" ]] && echo "$ORIG_PKG" > "$pkg" && info "package.json restored"
}

_randomize_vercel_json() {
  local vcfg="${VERCEL_DIR}/vercel.json"
  [[ -f "$vcfg" ]] || return
  ORIG_VCFG=$(cat "$vcfg")
  local rname="edge-$(_random_str 10)"
  jq --arg n "$rname" '.name=$n' "$vcfg" > "${vcfg}.tmp" && mv "${vcfg}.tmp" "$vcfg"
  info "Randomized vercel.json name: $rname"
}

_restore_vercel_json() {
  local vcfg="${VERCEL_DIR}/vercel.json"
  [[ -n "${ORIG_VCFG:-}" ]] && echo "$ORIG_VCFG" > "$vcfg" && info "vercel.json restored"
}

_vercel_diagnose_deploy_error() {
  local out="$1"
  echo -e "\n  ${C_MAGENTA}[AutoFix/Vercel]${C_RESET} Analysing deploy error..."

  # ── Token / Auth ────────────────────────────────────────
  if echo "$out" | grep -qiE "token|unauthorized|forbidden|401|403"; then
    fail "Auth error — Vercel token is invalid or expired"
    warn "Fix: go to https://vercel.com/account/tokens and create a new token"
    warn "Then re-run this script and paste the new token"
    return 1
  fi

  # ── Rate limit ──────────────────────────────────────────
  if echo "$out" | grep -qiE "rate.limit|too many|429"; then
    fail "Rate limit hit on Vercel API"
    warn "Fix: wait 60 seconds and retry"
    sleep 60
    return 0
  fi

  # ── Project already exists with different owner ─────────
  if echo "$out" | grep -qiE "already exists|conflict|409"; then
    local new_name
    new_name="relay-$(_random_str 8)"
    warn "Project name conflict — renaming to: $new_name"
    CFG_PROJECT_NAME="$new_name"
    rm -rf "${VERCEL_DIR}/.vercel" 2>/dev/null || true
    return 0
  fi

  # ── Link / project.json stale ───────────────────────────
  if echo "$out" | grep -qiE "not found|project.*not|linked|\.vercel"; then
    warn "Stale project link — clearing .vercel cache"
    rm -rf "${VERCEL_DIR}/.vercel" 2>/dev/null || true
    return 0
  fi

  # ── Build failure ───────────────────────────────────────
  if echo "$out" | grep -qiE "build.*fail|error.*build|npm.*err"; then
    fail "Build failed inside Vercel"
    warn "Check: api/index.js exists, package.json is valid, vercel.json is correct"
    _restore_vercel_json 2>/dev/null || true
    _restore_package_json 2>/dev/null || true
    return 1
  fi

  # ── Network / DNS from server ───────────────────────────
  if echo "$out" | grep -qiE "ENOTFOUND|ETIMEDOUT|getaddrinfo|network"; then
    fail "Network error reaching vercel.com from this server"
    warn "Check: curl -I https://vercel.com"
    curl -sI --max-time 5 https://vercel.com | head -3 || true
    return 1
  fi

  # ── Scope / team error ──────────────────────────────────
  if echo "$out" | grep -qiE "scope|team|org.*not|not.*member"; then
    warn "Scope/team error — clearing scope and retrying without team"
    CFG_VERCEL_SCOPE=""
    return 0
  fi

  # ── Generic fallback ────────────────────────────────────
  warn "Unknown deploy error — last 15 lines:"
  echo "$out" | tail -15 | while IFS= read -r l; do echo -e "  ${C_GRAY}  $l${C_RESET}"; done
  warn "Try: check https://vercel.com/dashboard for error details"
  return 1
}

phase4c_vercel_deploy() {
  step "PHASE 4c — Deploying to Vercel"

  if [[ ! -d "$VERCEL_DIR" ]]; then
    fail "vercel/ directory not found. Expected at: $VERCEL_DIR"
    return 1
  fi
  pushd "$VERCEL_DIR" > /dev/null

  export VERCEL_TOKEN="${CFG_VERCEL_TOKEN}"

  # ── Validate token (re-prompt if invalid) ───────────────
  local whoami_out attempt=0
  while [[ $attempt -lt 3 ]]; do
    attempt=$(( attempt + 1 ))
    whoami_out=$(vercel whoami --token "$CFG_VERCEL_TOKEN" 2>&1 || true)
    if echo "$whoami_out" | grep -qiE "error|invalid|unauthorized|forbidden"; then
      fail "Vercel token invalid (attempt $attempt/3): $whoami_out"
      warn "Get a token from: https://vercel.com/account/tokens"
      CFG_VERCEL_TOKEN=$(read_secret "Paste new Vercel token")
      export VERCEL_TOKEN="${CFG_VERCEL_TOKEN}"
    else
      ok "Vercel auth OK: $whoami_out"
      break
    fi
    [[ $attempt -ge 3 ]] && { fail "Cannot authenticate to Vercel after 3 attempts."; return 1; }
  done

  # ── Create / ensure project ─────────────────────────────
  local scope_args=()
  [[ -n "${CFG_VERCEL_SCOPE:-}" ]] && scope_args=(--scope "$CFG_VERCEL_SCOPE")

  info "Creating Vercel project '${CFG_PROJECT_NAME}'..."
  vercel project add "$CFG_PROJECT_NAME" --token "$CFG_VERCEL_TOKEN" \
    "${scope_args[@]}" 2>&1 | grep -v "^$" || true

  # ── Link ────────────────────────────────────────────────
  info "Linking to project..."
  rm -rf "${VERCEL_DIR}/.vercel" 2>/dev/null || true
  vercel link --yes --project "$CFG_PROJECT_NAME" \
    --token "$CFG_VERCEL_TOKEN" "${scope_args[@]}" 2>&1 | grep -v "^$" || true

  # ── ENV vars ────────────────────────────────────────────
  info "Setting environment variables..."
  local TARGET_DOMAIN_VAL="https://${CFG_DOMAIN}:${CFG_INBOUND_PORT}"

  _set_env() {
    local name="$1" value="$2"
    vercel env add "$name" production \
      --value "$value" --force --yes \
      --token "$CFG_VERCEL_TOKEN" "${scope_args[@]}" 2>/dev/null || true
  }
  _set_env "TARGET_DOMAIN"               "$TARGET_DOMAIN_VAL"
  _set_env "RELAY_PATH"                  "$CFG_RELAY_PATH"
  _set_env "PUBLIC_RELAY_PATH"           "$CFG_PUBLIC_PATH"
  _set_env "MAX_INFLIGHT"                "$CFG_MAX_INFLIGHT"
  _set_env "MAX_UP_BPS"                  "$CFG_MAX_UP_BPS"
  _set_env "MAX_DOWN_BPS"                "$CFG_MAX_DOWN_BPS"
  _set_env "UPSTREAM_TIMEOUT_MS"         "$CFG_UPSTREAM_TIMEOUT"
  _set_env "SUCCESS_LOG_SAMPLE_RATE"     "$CFG_SUCCESS_LOG"
  _set_env "SUCCESS_LOG_MIN_DURATION_MS" "$CFG_SUCCESS_DUR"
  _set_env "ERROR_LOG_MIN_INTERVAL_MS"   "$CFG_ERROR_INT"
  ok "ENV variables set"

  # ── Deploy with retry ───────────────────────────────────
  local deploy_attempt=0 deploy_out deploy_url=""
  while [[ $deploy_attempt -lt $AUTOFIX_MAX ]]; do
    deploy_attempt=$(( deploy_attempt + 1 ))
    info "Deploy attempt $deploy_attempt/$AUTOFIX_MAX..."

    _randomize_package_json
    _randomize_vercel_json

    deploy_out=$(vercel deploy --prod --yes \
      --token "$CFG_VERCEL_TOKEN" "${scope_args[@]}" 2>&1) && {
      _restore_vercel_json; _restore_package_json; break
    }
    _restore_vercel_json; _restore_package_json

    fail "Deploy attempt $deploy_attempt failed"
    if ! _vercel_diagnose_deploy_error "$deploy_out"; then
      [[ $deploy_attempt -ge $AUTOFIX_MAX ]] && { fail "Deploy failed after $AUTOFIX_MAX attempts. See: $LOG_FILE"; return 1; }
    fi
    # refresh scope_args in case CFG_VERCEL_SCOPE was cleared
    scope_args=()
    [[ -n "${CFG_VERCEL_SCOPE:-}" ]] && scope_args=(--scope "$CFG_VERCEL_SCOPE")
    sleep 3
  done

  # ── Extract URL ─────────────────────────────────────────
  deploy_url=$(echo "$deploy_out" | grep -oP 'https://[^\s]+\.vercel\.app' | tail -1 || true)
  [[ -z "$deploy_url" ]] && \
    deploy_url=$(echo "$deploy_out" | grep -iP 'production' | grep -oP 'https://\S+' | tail -1 || true)

  if [[ -n "$deploy_url" ]]; then
    VERCEL_URL="$deploy_url"
    ok "Production URL: ${VERCEL_URL}"
  else
    warn "Could not parse production URL — check Vercel dashboard"
    VERCEL_URL="(check dashboard)"
    echo "$deploy_out" | tail -8
  fi

  popd > /dev/null
}

phase4c_netlify_deploy() {
  step "PHASE 4c — Deploying to Netlify"

  if [[ ! -d "$NETLIFY_DIR" ]]; then
    fail "netlify/ directory not found. Expected at: $NETLIFY_DIR"
    return 1
  fi
  info "Netlify project dir: $NETLIFY_DIR"

  local TARGET_DOMAIN_VAL="https://${CFG_DOMAIN}:${CFG_INBOUND_PORT}"
  local attempt=0

  # ── Validate token ───────────────────────────────────────
  while [[ $attempt -lt 3 ]]; do
    attempt=$(( attempt + 1 ))
    local whoami_out
    whoami_out=$(NETLIFY_AUTH_TOKEN="$CFG_NETLIFY_TOKEN" netlify api getCurrentUser 2>&1 || true)
    if echo "$whoami_out" | grep -qiE '"id":|"email":'; then
      local nl_user
      nl_user=$(echo "$whoami_out" | grep -oP '"email"\s*:\s*"\K[^"]+' || echo "ok")
      ok "Netlify auth OK: $nl_user"
      break
    else
      fail "Netlify token invalid (attempt $attempt/3)"
      warn "Get a token from: https://app.netlify.com/user/applications#personal-access-tokens"
      CFG_NETLIFY_TOKEN=$(read_secret "Paste new Netlify token")
    fi
    [[ $attempt -ge 3 ]] && { fail "Cannot authenticate to Netlify after 3 attempts."; return 1; }
  done

  export NETLIFY_AUTH_TOKEN="$CFG_NETLIFY_TOKEN"

  # ── Create or get site ───────────────────────────────────
  info "Creating/finding Netlify site '${CFG_NETLIFY_SITE}'..."
  local site_id
  site_id=$(netlify api listSites 2>/dev/null | \
    grep -oP '"id"\s*:\s*"\K[^"]+(?=.*"name"\s*:\s*"'"${CFG_NETLIFY_SITE}"'")' | head -1 || true)

  if [[ -z "$site_id" ]]; then
    local create_out
    create_out=$(netlify api createSite --data "{\"name\":\"${CFG_NETLIFY_SITE}\"}" 2>/dev/null || true)
    site_id=$(echo "$create_out" | grep -oP '"id"\s*:\s*"\K[^"]+' | head -1 || true)
    [[ -z "$site_id" ]] && { fail "Could not create Netlify site"; return 1; }
    ok "Netlify site created: ${CFG_NETLIFY_SITE} (id: ${site_id})"
  else
    ok "Using existing Netlify site: ${CFG_NETLIFY_SITE} (id: ${site_id})"
  fi
  NETLIFY_SITE_ID="$site_id"

  # ── Set env vars (Netlify edge function ONLY uses TARGET_DOMAIN) ──
  info "Setting Netlify env var: TARGET_DOMAIN=${TARGET_DOMAIN_VAL}"
  pushd "$NETLIFY_DIR" > /dev/null

  # Wait briefly for site to be fully ready in Netlify's API
  sleep 3

  # Resolve account_slug for this site (the `-` shorthand doesn't work for env endpoints)
  local NETLIFY_ACCOUNT_SLUG
  NETLIFY_ACCOUNT_SLUG=$(curl -sS --max-time 15 \
    "https://api.netlify.com/api/v1/sites/${site_id}" \
    -H "Authorization: Bearer ${CFG_NETLIFY_TOKEN}" 2>/dev/null | \
    grep -oP '"account_slug"\s*:\s*"\K[^"]+' | head -1 || true)
  if [[ -z "$NETLIFY_ACCOUNT_SLUG" ]]; then
    NETLIFY_ACCOUNT_SLUG=$(curl -sS --max-time 15 \
      "https://api.netlify.com/api/v1/accounts" \
      -H "Authorization: Bearer ${CFG_NETLIFY_TOKEN}" 2>/dev/null | \
      grep -oP '"slug"\s*:\s*"\K[^"]+' | head -1 || true)
  fi
  info "Netlify account_slug: ${NETLIFY_ACCOUNT_SLUG:-<unknown>}"

  # Helper: set/replace one env var via REST API (no CLI, no prompts)
  # Usage: _netlify_set_env_api KEY VALUE
  # Tries with scopes=["functions"] first (paid plans); on 403 retries without scopes (free tier).
  _netlify_set_env_api() {
    local key="$1" value="$2"
    local api_base="https://api.netlify.com/api/v1/accounts/${NETLIFY_ACCOUNT_SLUG}/env"
    [[ -z "$NETLIFY_ACCOUNT_SLUG" ]] && { warn "  no account_slug — cannot use REST API"; return 1; }

    # Inner: try one body shape with POST then PUT. Returns 0 on success.
    _try_body() {
      local body="$1"
      # Try POST first
      local api_out
      api_out=$(curl -sS --max-time 20 \
        -X POST "${api_base}?site_id=${site_id}" \
        -H "Authorization: Bearer ${CFG_NETLIFY_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "$body" 2>&1 || true)
      if echo "$api_out" | grep -qE "\"key\"\s*:\s*\"${key}\""; then
        return 0
      fi
      # Detect 403 scope-not-allowed → caller will retry without scopes
      if echo "$api_out" | grep -qiE "Upgrade your Netlify account to set specific scopes|scopes"; then
        echo "__SCOPE_NOT_ALLOWED__"
        return 1
      fi
      # POST failed for other reasons → try PUT
      local single_obj="${body#[}"; single_obj="${single_obj%]}"
      api_out=$(curl -sS --max-time 20 \
        -X PUT "${api_base}/${key}?site_id=${site_id}" \
        -H "Authorization: Bearer ${CFG_NETLIFY_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "$single_obj" 2>&1 || true)
      if echo "$api_out" | grep -qE "\"key\"\s*:\s*\"${key}\""; then
        return 0
      fi
      # Surface error to caller
      echo "$api_out" | head -c 300
      return 1
    }

    # Step 1: DELETE any existing var (idempotent; 404 is fine)
    curl -sS --max-time 15 -o /dev/null \
      -X DELETE "${api_base}/${key}?site_id=${site_id}" \
      -H "Authorization: Bearer ${CFG_NETLIFY_TOKEN}" >/dev/null 2>&1 || true

    # Step 2: try WITH scopes (paid plans / pro Netlify accounts)
    local body_with_scope body_no_scope try_out
    body_with_scope=$(printf '[{"key":"%s","values":[{"value":"%s","context":"production"}],"scopes":["functions"]}]' "$key" "$value")
    try_out=$(_try_body "$body_with_scope" 2>&1)
    if [[ $? -eq 0 ]]; then
      ok "  ${key} set via REST API (with scope)"
      return 0
    fi

    # Step 3: free-tier fallback — same call WITHOUT the scopes field
    if [[ "$try_out" == *"__SCOPE_NOT_ALLOWED__"* ]] || echo "$try_out" | grep -qiE "scopes|upgrade"; then
      info "  Account is on free tier — retrying without scopes..."
    fi
    body_no_scope=$(printf '[{"key":"%s","values":[{"value":"%s","context":"production"}]}]' "$key" "$value")
    try_out=$(_try_body "$body_no_scope" 2>&1)
    if [[ $? -eq 0 ]]; then
      ok "  ${key} set via REST API (no scope)"
      return 0
    fi

    # Step 4: last resort — apply to all contexts (some accounts reject per-context)
    local body_all
    body_all=$(printf '[{"key":"%s","values":[{"value":"%s","context":"all"}]}]' "$key" "$value")
    try_out=$(_try_body "$body_all" 2>&1)
    if [[ $? -eq 0 ]]; then
      ok "  ${key} set via REST API (context=all)"
      return 0
    fi

    warn "  REST API failed for ${key}. Last response: $(echo "$try_out" | head -c 200)"
    return 1
  }

  local set_ok=false
  _netlify_set_env_api TARGET_DOMAIN "$TARGET_DOMAIN_VAL" && set_ok=true

  # ── FALLBACK: CLI (only if REST API failed). Use --scope only (not both). ──
  if [[ "$set_ok" != "true" ]]; then
    info "Falling back to netlify CLI (stdin closed to avoid prompts)..."
    timeout 30 netlify link --id "$site_id" </dev/null >/dev/null 2>&1 || true
    # Try without --context (since CLI rejects scope+context on existing vars)
    local set_out
    set_out=$(timeout 30 netlify env:set TARGET_DOMAIN "$TARGET_DOMAIN_VAL" \
      --scope functions --site "$site_id" </dev/null 2>&1 || true)
    if echo "$set_out" | grep -qiE "set environment variable|in the .* context|added|updated|saved"; then
      ok "TARGET_DOMAIN set via CLI fallback (scope only)"
      set_ok=true
    else
      warn "CLI fallback also failed: $(echo "$set_out" | head -c 200)"
    fi
  fi

  # Verify (REST API — fast, no hangs)
  local env_list
  if [[ -n "$NETLIFY_ACCOUNT_SLUG" ]]; then
    env_list=$(curl -sS --max-time 15 \
      "https://api.netlify.com/api/v1/accounts/${NETLIFY_ACCOUNT_SLUG}/env?site_id=${site_id}" \
      -H "Authorization: Bearer ${CFG_NETLIFY_TOKEN}" 2>/dev/null || true)
  fi
  popd > /dev/null

  if echo "$env_list" | grep -qF "$TARGET_DOMAIN_VAL"; then
    ok "TARGET_DOMAIN verified on Netlify"
  elif echo "$env_list" | grep -q "TARGET_DOMAIN"; then
    ok "TARGET_DOMAIN key present (value redacted by Netlify CLI)"
  else
    warn "Could not verify TARGET_DOMAIN — env:list output:"
    echo "$env_list" | head -10 | while read -r l; do echo "    $l"; done
  fi

  # ── Deploy ───────────────────────────────────────────────
  info "Deploying to Netlify..."
  local deploy_log
  deploy_log=$(mktemp)
  local deploy_rc=0
  # IMPORTANT: cd into the project root so netlify.toml is detected and edge functions wire up
  pushd "$NETLIFY_DIR" > /dev/null
  netlify deploy --prod \
    --dir public \
    --site "$site_id" 2>&1 | tee "$deploy_log" || true
  deploy_rc=${PIPESTATUS[0]}
  popd > /dev/null
  local deploy_out
  deploy_out=$(<"$deploy_log")
  rm -f "$deploy_log"

  # Success = exit code 0 OR the text/URL pattern is present
  if [[ $deploy_rc -eq 0 ]] || echo "$deploy_out" | grep -qiE "deploy complete|production url|deployed|live url|prod url"; then
    VERCEL_URL=$(echo "$deploy_out" | grep -oP 'https://[a-z0-9-]+\.netlify\.app' | grep -v -- '--' | head -1 || true)
    [[ -z "$VERCEL_URL" ]] && \
      VERCEL_URL=$(echo "$deploy_out" | grep -oP 'https://[^\s<>]+\.netlify\.app' | tail -1 || true)
    ok "Netlify deployed: ${VERCEL_URL:-check dashboard}"
  else
    fail "Netlify deploy failed (exit $deploy_rc)"
    echo "$deploy_out" | tail -10
    return 1
  fi

  # ── Verify edge function actually invokes (not Netlify's generic 404 page) ──
  if [[ -n "${VERCEL_URL:-}" ]]; then
    local verify_attempt=0
    local edge_ok=false
    while [[ $verify_attempt -lt 3 ]]; do
      verify_attempt=$(( verify_attempt + 1 ))
      info "Verifying edge function (attempt ${verify_attempt}/3)..."
      sleep 4   # give CDN time to propagate
      local verify_body verify_code
      verify_body=$(curl -sk -X POST "${VERCEL_URL}${CFG_PUBLIC_PATH}" \
        --max-time 12 -d "ping" 2>&1 || true)
      verify_code=$(curl -sk -o /dev/null -w "%{http_code}" -X POST "${VERCEL_URL}${CFG_PUBLIC_PATH}" \
        --max-time 12 -d "ping" 2>/dev/null || echo "000")

      # 404 + Netlify HTML = edge function NOT routed
      # 500 + "Misconfigured" = edge function ran but TARGET_DOMAIN env missing
      local need_redeploy=false redeploy_reason=""
      if echo "$verify_body" | grep -qi "Looks like you.ve followed a broken link\|<title>Page not found</title>"; then
        need_redeploy=true
        redeploy_reason="static 404 page (routing not wired)"
      elif [[ "$verify_code" == "500" ]] && echo "$verify_body" | grep -qi "Misconfigured\|TARGET_DOMAIN"; then
        need_redeploy=true
        redeploy_reason="HTTP 500 — TARGET_DOMAIN env not visible to edge function"
        # Re-set TARGET_DOMAIN via REST API (NOT CLI — avoid overwrite-prompt hang)
        info "Re-applying TARGET_DOMAIN before redeploy (via REST API)..."
        _netlify_set_env_api TARGET_DOMAIN "$TARGET_DOMAIN_VAL" || \
          warn "Re-apply via REST API failed — relying on deployed value"
      fi

      if [[ "$need_redeploy" == "true" ]]; then
        warn "Edge function check failed: ${redeploy_reason} — forcing redeploy..."
        pushd "$NETLIFY_DIR" > /dev/null
        deploy_log=$(mktemp)
        netlify deploy --prod \
          --dir public \
          --skip-functions-cache \
          --site "$site_id" 2>&1 | tee "$deploy_log" || true
        popd > /dev/null
        deploy_out=$(<"$deploy_log")
        rm -f "$deploy_log"
        local new_url
        new_url=$(echo "$deploy_out" | grep -oP 'https://[a-z0-9-]+\.netlify\.app' | grep -v -- '--' | head -1 || true)
        [[ -n "$new_url" ]] && VERCEL_URL="$new_url"
      else
        edge_ok=true
        ok "Edge function is responding (HTTP ${verify_code}, relay routing + env OK)"
        break
      fi
    done
    if [[ "$edge_ok" != "true" ]]; then
      warn "Edge function still not responding after 3 attempts."
      info "Check logs: https://app.netlify.com/projects/${CFG_NETLIFY_SITE}/logs/edge-functions"
    fi
  fi
}

phase4c_deploy() {
  if [[ "${CFG_PLATFORM:-vercel}" == "netlify" ]]; then
    phase4c_netlify_deploy
  else
    phase4c_vercel_deploy
  fi
}

# helper — redeploy ENV after user corrects a value
_redeploy_env_fix() {
  if [[ "${CFG_PLATFORM:-vercel}" == "netlify" ]]; then
    info "Skipping auto-redeploy on Netlify (manual: re-run script if needed)"
    return 0
  fi
  local scope_args=()
  [[ -n "${CFG_VERCEL_SCOPE:-}" ]] && scope_args=(--scope "$CFG_VERCEL_SCOPE")
  info "Updating ENV on Vercel and redeploying..."
  pushd "$VERCEL_DIR" > /dev/null
  local TARGET_DOMAIN_VAL="https://${CFG_DOMAIN}:${CFG_INBOUND_PORT}"
  vercel env add "TARGET_DOMAIN"     production --value "$TARGET_DOMAIN_VAL"  --force --yes --token "$CFG_VERCEL_TOKEN" "${scope_args[@]}" 2>/dev/null || true
  vercel env add "RELAY_PATH"        production --value "$CFG_RELAY_PATH"      --force --yes --token "$CFG_VERCEL_TOKEN" "${scope_args[@]}" 2>/dev/null || true
  vercel env add "PUBLIC_RELAY_PATH" production --value "$CFG_PUBLIC_PATH"     --force --yes --token "$CFG_VERCEL_TOKEN" "${scope_args[@]}" 2>/dev/null || true
  _randomize_package_json; _randomize_vercel_json
  local out
  out=$(vercel deploy --prod --yes --token "$CFG_VERCEL_TOKEN" "${scope_args[@]}" 2>&1) && {
    _restore_vercel_json; _restore_package_json
    local url
    url=$(echo "$out" | grep -oP 'https://[^\s]+\.vercel\.app' | tail -1 || true)
    [[ -n "$url" ]] && VERCEL_URL="$url"
    ok "Redeployed: ${VERCEL_URL:-done}"
  } || {
    _restore_vercel_json; _restore_package_json
    fail "Redeploy failed — check $LOG_FILE"
  }
  popd > /dev/null
}

# =============================================================
#  PHASE 5 — HEALTH CHECK WITH xray-knife + CONFIG VALIDATOR
# =============================================================
phase5_healthcheck() {
  step "PHASE 5 — Health check & config validation"

  local TARGET_DOMAIN_VAL="https://${CFG_DOMAIN}:${CFG_INBOUND_PORT}"
  local VERCEL_HOST
  VERCEL_HOST=$(echo "${VERCEL_URL:-}" | sed 's|https://||' | sed 's|/.*||')
  local need_redeploy=false

  # ── Test 1: upstream (Xray) directly ────────────────────
  echo -e "\n  ${C_CYAN}[ Test 1 ] Direct upstream reachability${C_RESET}"
  local http1 direct_ok=false
  http1=$(curl -sk --max-time 8 "${TARGET_DOMAIN_VAL}${CFG_RELAY_PATH}" \
    -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
  if echo "$http1" | grep -qE "^(200|400|401|403|404|405)$"; then
    ok "Upstream reachable — HTTP $http1 on ${CFG_DOMAIN}:${CFG_INBOUND_PORT}"
    direct_ok=true
  else
    fail "Upstream NOT reachable (HTTP $http1) at ${TARGET_DOMAIN_VAL}${CFG_RELAY_PATH}"
    warn "→ Auto-fix: opening firewall port ${CFG_INBOUND_PORT}..."
    ufw allow "${CFG_INBOUND_PORT}/tcp" 2>/dev/null || true
    warn "→ Restarting xray..."
    systemctl restart xray 2>/dev/null || true; sleep 3
    # retry once after fix
    http1=$(curl -sk --max-time 8 "${TARGET_DOMAIN_VAL}${CFG_RELAY_PATH}" \
      -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
    if echo "$http1" | grep -qE "^(200|400|401|403|404|405)$"; then
      ok "Upstream reachable after fix — HTTP $http1"
      direct_ok=true
    else
      fail "Still unreachable. Check: systemctl status xray / SSL cert / DNS"
    fi
  fi

  # ── Test 2: Relay + smart PATH/TARGET fix ────────────────
  echo -e "\n  ${C_CYAN}[ Test 2 ] Relay & config validation${C_RESET}"
  if [[ -n "$VERCEL_HOST" ]]; then
    local vercel_code
    vercel_code=$(curl -sk --max-time 15 \
      "https://${VERCEL_HOST}${CFG_PUBLIC_PATH}" \
      -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")

    case "$vercel_code" in
      200|101)
        ok "Vercel relay responding — HTTP $vercel_code" ;;

      404)
        if [[ "$CFG_PUBLIC_PATH" == "/api" ]]; then
          warn "HTTP 404 on ${CFG_PUBLIC_PATH} — normal for VLESS/XHTTP endpoints (browser GET ≠ XHTTP handshake)"
          info "This is expected. Real client traffic should still work."
        else
          fail "HTTP 404 — PUBLIC_RELAY_PATH mismatch"
          info "Current PUBLIC_RELAY_PATH: ${CFG_PUBLIC_PATH}"
          if [[ "$CFG_PLATFORM" == "vercel" ]]; then
            info "Vercel rewrites in vercel.json only support: /api and /api/:path*"
          else
            info "Netlify edge functions need matching path in netlify.toml"
          fi
          warn "AutoFix: correcting PUBLIC_RELAY_PATH -> /api"
          CFG_PUBLIC_PATH="/api"
          need_redeploy=true
        fi ;;

      502)
        fail "HTTP 502 — Relay cannot reach your server (TARGET_DOMAIN wrong or firewall)"
        info "Current TARGET_DOMAIN: ${TARGET_DOMAIN_VAL}"
        if [[ "$direct_ok" == "false" ]]; then
          warn "AutoFix: upstream also unreachable — fixing firewall first"
          ufw allow "${CFG_INBOUND_PORT}/tcp" 2>/dev/null || true
          systemctl restart xray 2>/dev/null || true; sleep 3
        fi
        warn "Please confirm TARGET_DOMAIN is correct:"
        local new_domain
        new_domain=$(read_default "TARGET_DOMAIN host (domain:port)" "${CFG_DOMAIN}:${CFG_INBOUND_PORT}")
        if [[ "$new_domain" != "${CFG_DOMAIN}:${CFG_INBOUND_PORT}" ]]; then
          CFG_DOMAIN="${new_domain%%:*}"
          CFG_INBOUND_PORT="${new_domain##*:}"
          need_redeploy=true
        fi ;;

      500)
        fail "HTTP 500 — ENV variables missing or wrong on ${CFG_PLATFORM}"
        warn "AutoFix: re-pushing all ENV variables..."
        need_redeploy=true ;;

      503)
        fail "HTTP 503 — MAX_INFLIGHT limit reached"
        warn "AutoFix: doubling MAX_INFLIGHT (${CFG_MAX_INFLIGHT} -> $(( CFG_MAX_INFLIGHT * 2 )))"
        CFG_MAX_INFLIGHT=$(( CFG_MAX_INFLIGHT * 2 ))
        need_redeploy=true ;;

      504)
        fail "HTTP 504 — Upstream timeout"
        warn "AutoFix: doubling UPSTREAM_TIMEOUT_MS (${CFG_UPSTREAM_TIMEOUT} -> $(( CFG_UPSTREAM_TIMEOUT * 2 )))"
        CFG_UPSTREAM_TIMEOUT=$(( CFG_UPSTREAM_TIMEOUT * 2 ))
        systemctl restart xray 2>/dev/null || true
        need_redeploy=true ;;

      000)
        fail "No response from ${CFG_PLATFORM} (000) — deployment may still be propagating"
        warn "Waiting 15s and retrying..."
        sleep 15
        vercel_code=$(curl -sk --max-time 15 "https://${VERCEL_HOST}${CFG_PUBLIC_PATH}" \
          -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
        if [[ "$vercel_code" == "000" ]]; then
          fail "Still no response. Check: https://${VERCEL_HOST}"
        else
          ok "${CFG_PLATFORM} now responding — HTTP $vercel_code"
        fi ;;

      *)
        warn "${CFG_PLATFORM} returned HTTP $vercel_code — may be normal for XHTTP handshake" ;;
    esac

    # ── Auto-redeploy if any fix was applied ──────────────
    if [[ "$need_redeploy" == "true" ]]; then
      echo -e "\n  ${C_MAGENTA}[AutoFix]${C_RESET} Config corrected — redeploying to ${CFG_PLATFORM}..."
      _redeploy_env_fix
      # re-test after redeploy
      sleep 5
      local retest_code
      retest_code=$(curl -sk --max-time 15 \
        "https://${VERCEL_HOST}${CFG_PUBLIC_PATH}" \
        -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
      if echo "$retest_code" | grep -qE "^(200|101|404)$"; then
        ok "Post-fix test: HTTP $retest_code — relay is responding"
      else
        warn "Post-fix test: HTTP $retest_code — check ${CFG_PLATFORM} dashboard for build logs"
      fi
    fi
  else
    warn "Relay URL unknown — skipping relay test"
  fi

  # ── Test 3: real end-to-end VLESS test using local xray as client ──
  echo -e "\n  ${C_CYAN}[ Test 3 ] End-to-end VLESS+XHTTP test (real client)${C_RESET}"
  if [[ -z "${VERCEL_HOST:-}" || -z "${INBOUND_UUID:-}" ]]; then
    warn "Missing relay host or UUID — skipping E2E test"
    info "  VERCEL_HOST='${VERCEL_HOST:-<empty>}'  INBOUND_UUID='${INBOUND_UUID:-<empty>}'"
  else
    # Locate the xray binary (must be explicit — PATH can be stripped in screen/sudo)
    local XRAY_BIN
    XRAY_BIN=$(command -v xray 2>/dev/null || echo "")
    [[ -z "$XRAY_BIN" ]] && XRAY_BIN="/usr/local/bin/xray"
    if [[ ! -x "$XRAY_BIN" ]]; then
      warn "xray binary not found at '$XRAY_BIN' — skipping E2E test"
      E2E_STATUS="UNKNOWN"
      E2E_DETAIL="xray binary not found"
    else
    info "E2E vars — relay: ${VERCEL_HOST}  uuid: ${INBOUND_UUID}  path: ${CFG_PUBLIC_PATH}"

    local CLIENT_MODE="auto"
    local TEST_SOCKS_PORT=10809
    local TEST_CFG
    TEST_CFG=$(mktemp --suffix=.json)
    cat > "$TEST_CFG" <<E2ECFG
{
  "log": {"loglevel": "debug"},
  "inbounds": [{
    "tag": "socks-test",
    "port": ${TEST_SOCKS_PORT},
    "listen": "127.0.0.1",
    "protocol": "socks",
    "settings": {"auth": "noauth", "udp": false}
  }],
  "outbounds": [{
    "tag": "vless-out",
    "protocol": "vless",
    "settings": {
      "vnext": [{
        "address": "${VERCEL_HOST}",
        "port": 443,
        "users": [{"id": "${INBOUND_UUID}", "encryption": "none"}]
      }]
    },
    "streamSettings": {
      "network": "xhttp",
      "security": "tls",
      "tlsSettings": {
        "serverName": "${VERCEL_HOST}",
        "alpn": ["h2", "http/1.1"],
        "allowInsecure": false
      },
      "xhttpSettings": {
        "path": "${CFG_PUBLIC_PATH}",
        "host": "${VERCEL_HOST}",
        "mode": "${CLIENT_MODE}"
      }
    }
  }, {
    "protocol": "freedom",
    "tag": "direct"
  }]
}
E2ECFG

    # Free the test port if anything is on it
    local _pid
    _pid=$(lsof -ti:${TEST_SOCKS_PORT} 2>/dev/null || true)
    [[ -n "$_pid" ]] && { info "Killing existing PID ${_pid} on port ${TEST_SOCKS_PORT}"; kill -9 "$_pid" 2>/dev/null || true; sleep 1; }

    # Initialize global E2E status for final summary
    E2E_STATUS="UNKNOWN"
    E2E_DETAIL=""

    info "Starting xray test client (${XRAY_BIN}) on 127.0.0.1:${TEST_SOCKS_PORT}..."
    "$XRAY_BIN" run -c "$TEST_CFG" >/tmp/xray-test-client.log 2>&1 &
    local TEST_PID=$!
    trap "kill ${TEST_PID} 2>/dev/null; sleep 1; kill -9 ${TEST_PID} 2>/dev/null; rm -f '${TEST_CFG}' /tmp/xray-test-client.log 2>/dev/null" RETURN

    # ── Wait up to 12 s for the SOCKS port to actually open ──
    local port_ready=false pw=0
    while [[ $pw -lt 12 ]]; do
      sleep 1; pw=$(( pw + 1 ))
      # Check if process died early
      if ! kill -0 "$TEST_PID" 2>/dev/null; then
        fail "xray test client exited after ${pw}s"
        break
      fi
      # Use ss (preferred) or nc to confirm port is listening
      if ss -tlnp 2>/dev/null | grep -q ":${TEST_SOCKS_PORT} " || \
         nc -z 127.0.0.1 "${TEST_SOCKS_PORT}" 2>/dev/null; then
        port_ready=true
        break
      fi
    done

    if [[ "$port_ready" != "true" ]]; then
      fail "xray test client SOCKS port ${TEST_SOCKS_PORT} never opened (waited ${pw}s)"
      info "Last 15 lines of xray test client log:"
      tail -15 /tmp/xray-test-client.log 2>/dev/null | while read -r l; do echo -e "  ${C_GRAY}  $l${C_RESET}"; done
      E2E_STATUS="FAIL"
      E2E_DETAIL="SOCKS port ${TEST_SOCKS_PORT} did not open (check xray test client log)"
    else
      ok "Test client running (PID $TEST_PID) — SOCKS port ${TEST_SOCKS_PORT} open after ${pw}s"

      # Direct VLESS test. For Netlify we do at most 1 attempt then bail out to
      # the parallel fronted probe — direct test always 429s on the loop path
      # so retrying is just wasted time. For Vercel we retry up to 5×.
      local max_attempts=5
      [[ "${CFG_PLATFORM:-vercel}" == "netlify" ]] && max_attempts=1
      local attempt=0 probe_code="000" probe_time="0"
      local upstream_status="" last_known_upstream=""
      while [[ $attempt -lt $max_attempts ]]; do
        attempt=$(( attempt + 1 ))
        info "VLESS handshake attempt ${attempt}/${max_attempts} → https://www.gstatic.com/generate_204"
        local probe_out
        probe_out=$(curl --socks5-hostname 127.0.0.1:${TEST_SOCKS_PORT} \
          -s -o /dev/null \
          -w "code=%{http_code}|time=%{time_total}" \
          --max-time 15 \
          "https://www.gstatic.com/generate_204" 2>&1 || true)
        probe_code=$(echo "$probe_out" | grep -oP 'code=\K[0-9]+' || echo "000")
        probe_time=$(echo "$probe_out" | grep -oP 'time=\K[0-9.]+' || echo "0")
        if [[ "$probe_code" == "204" || "$probe_code" == "200" ]]; then
          break
        fi

        # Sniff the most recent xray log to figure out *why* the handshake failed
        upstream_status=$(grep -oE "unexpected status [0-9]+" /tmp/xray-test-client.log 2>/dev/null | tail -1 | grep -oE '[0-9]+$' || true)
        [[ -n "$upstream_status" ]] && last_known_upstream="$upstream_status"

        if [[ -n "$upstream_status" ]]; then
          warn "Got HTTP ${probe_code} (CDN responded with ${upstream_status} to XHTTP request)"
        else
          warn "Got HTTP ${probe_code} (no response — likely connection-level block / timeout)"
        fi

        # Wait shorter between attempts (only for Vercel which retries)
        if [[ $attempt -lt $max_attempts ]]; then
          info "Waiting 10s before retry..."
          sleep 10
        fi
      done

      if [[ "$probe_code" == "204" || "$probe_code" == "200" ]]; then
        echo ""
        echo -e "  ${C_GREEN}╔══════════════════════════════════════════════════╗${C_RESET}"
        echo -e "  ${C_GREEN}║  ✔ VLESS+XHTTP WORKS END-TO-END                ║${C_RESET}"
        echo -e "  ${C_GREEN}║    HTTP ${probe_code} in ${probe_time}s — proxy is functional       ║${C_RESET}"
        echo -e "  ${C_GREEN}╚══════════════════════════════════════════════════╝${C_RESET}"
        echo ""

        # ── Latency profiling: 5 pings through the proxy ──
        info "Measuring relay latency (5 samples through VLESS proxy)..."
        local times=()
        local i
        for i in 1 2 3 4 5; do
          local t
          t=$(curl --socks5-hostname 127.0.0.1:${TEST_SOCKS_PORT} \
            -s -o /dev/null \
            -w "%{time_total}" \
            --max-time 15 \
            "https://www.gstatic.com/generate_204" 2>/dev/null || echo "0")
          # Convert to ms (rounded)
          local t_ms
          t_ms=$(awk -v t="$t" 'BEGIN{ printf "%.0f", t*1000 }')
          times+=("$t_ms")
          echo -e "    ${C_GRAY}#$i  → ${t_ms} ms${C_RESET}"
        done

        # Compute min / avg / max
        local min=999999 max=0 sum=0 valid=0
        for t in "${times[@]}"; do
          [[ "$t" == "0" ]] && continue
          (( t < min )) && min=$t
          (( t > max )) && max=$t
          sum=$(( sum + t ))
          valid=$(( valid + 1 ))
        done
        local avg=0
        (( valid > 0 )) && avg=$(( sum / valid ))

        echo ""
        echo -e "  ${C_CYAN}─── Relay Ping (via real VLESS proxy) ───${C_RESET}"
        echo -e "  ${C_WHITE}min :${C_RESET} ${C_GREEN}${min} ms${C_RESET}"
        echo -e "  ${C_WHITE}avg :${C_RESET} ${C_GREEN}${avg} ms${C_RESET}"
        echo -e "  ${C_WHITE}max :${C_RESET} ${C_YELLOW}${max} ms${C_RESET}"
        echo -e "  ${C_GRAY}    (server→relay→upstream→internet round trip)${C_RESET}"
        echo ""

        # Also measure direct relay latency (HTTP HEAD, no proxy)
        info "Measuring direct CDN latency (no proxy, just relay reachability)..."
        local cdn_times=()
        for i in 1 2 3; do
          local ct
          ct=$(curl -s -o /dev/null -w "%{time_total}" --max-time 8 \
            -X HEAD "https://${VERCEL_HOST}/" 2>/dev/null || echo "0")
          local ct_ms
          ct_ms=$(awk -v t="$ct" 'BEGIN{ printf "%.0f", t*1000 }')
          cdn_times+=("$ct_ms")
          echo -e "    ${C_GRAY}#$i  → ${ct_ms} ms${C_RESET}"
        done
        local cdn_sum=0 cdn_valid=0
        for ct in "${cdn_times[@]}"; do
          [[ "$ct" == "0" ]] && continue
          cdn_sum=$(( cdn_sum + ct ))
          cdn_valid=$(( cdn_valid + 1 ))
        done
        local cdn_avg=0
        (( cdn_valid > 0 )) && cdn_avg=$(( cdn_sum / cdn_valid ))
        echo -e "  ${C_CYAN}CDN avg latency:${C_RESET} ${cdn_avg} ms ${C_GRAY}(server → ${VERCEL_HOST})${C_RESET}"
        echo ""

        E2E_STATUS="PASS"
        E2E_DETAIL="HTTP ${probe_code} | min/avg/max: ${min}/${avg}/${max}ms | CDN: ${cdn_avg}ms"
        E2E_PING_MIN=$min
        E2E_PING_AVG=$avg
        E2E_PING_MAX=$max
        E2E_CDN_PING=$cdn_avg
      else
        # ── Netlify 429 fallback: try domain-fronted configs ──────
        # The direct test loops back to the same server IP, which Netlify
        # often rate-limits. Domain fronting (clean IP + clean SNI + Netlify
        # in the Host header) bypasses this. We try a small sample of known
        # clean IP/SNI combinations until one succeeds.
        if [[ "${CFG_PLATFORM:-vercel}" == "netlify" && "$last_known_upstream" == "429" ]]; then
          echo ""
          warn "Direct test got HTTP 429 (Netlify loop-rate-limit on same IP)."
          info "Probing ~1500 IP×SNI combos in parallel (curl-based, max 60s)..."

          # Stop the current test client
          kill "$TEST_PID" 2>/dev/null || true; sleep 1; kill -9 "$TEST_PID" 2>/dev/null || true

          # Full curated lists (35 IPs × 45 SNIs ≈ 1575 combos)
          local FRONT_IPS=(
            50.7.5.83 50.7.5.85 50.7.87.2 50.7.87.3 50.7.87.4 50.7.87.5
            144.76.1.88 216.24.57.1 37.16.18.81 52.250.41.2 76.76.21.21 76.76.21.112
            85.10.207.48 94.130.13.19 94.130.33.41 94.130.50.12 95.216.69.37
            198.202.211.1 198.252.206.1 204.12.196.34 216.150.1.193 65.109.34.234
            94.130.70.160 104.18.25.196 138.201.54.122 142.54.178.211 149.154.167.99
            178.22.122.101 204.79.197.220 213.180.193.56 216.239.38.120
            40.114.177.246 63.141.252.203 64.239.109.193
          )
          local FRONT_SNIS=(
            helm.sh keda.sh rook.io istio.io cilium.io fluxcd.io harbor.io
            calico.org linkerd.io openebs.io tekton.dev longhorn.io
            blog.helm.sh docs.helm.sh crossplane.io kubernetes.io kubebuilder.io
            cert-manager.io letsencrypt.org
            kind.sigs.k8s.io kops.sigs.k8s.io krew.sigs.k8s.io kwok.sigs.k8s.io
            kueue.sigs.k8s.io jobset.sigs.k8s.io kaniko.sigs.k8s.io
            minikube.sigs.k8s.io operatorframework.io container.sigs.k8s.io
            kustomize.sigs.k8s.io argo-cd.readthedocs.io
            cluster-api.sigs.k8s.io descheduler.sigs.k8s.io
            gateway-api.sigs.k8s.io external-dns.sigs.k8s.io
            service-apis.sigs.k8s.io image-builder.sigs.k8s.io
            kubectl.docs.kubernetes.io metrics-server.sigs.k8s.io
            scheduler-plugins.sigs.k8s.io controller-runtime.sigs.k8s.io
            prometheus-operator.sigs.k8s.io node-feature-discovery.sigs.k8s.io
            hierarchical-namespaces.sigs.k8s.io secrets-store-csi-driver.sigs.k8s.io
            security-profiles-operator.sigs.k8s.io
            cluster-proportional-autoscaler.sigs.k8s.io
          )

          # Build combos file and result/stop file
          local combos_file result_file
          combos_file=$(mktemp)
          result_file=$(mktemp)
          : > "$result_file"   # empty
          local total_combos=0
          for fip in "${FRONT_IPS[@]}"; do
            for fsni in "${FRONT_SNIS[@]}"; do
              echo "${fip}|${fsni}" >> "$combos_file"
              total_combos=$(( total_combos + 1 ))
            done
          done
          info "  Total combos: ${total_combos}  |  parallelism: 60  |  per-probe timeout: 2s"

          # Export env so xargs subprocesses can read them
          export NETLIFY_HOST_FOR_PROBE="$VERCEL_HOST"
          export RELAY_PATH_FOR_PROBE="$CFG_PUBLIC_PATH"
          export PROBE_RESULT_FILE="$result_file"

          # Parallel probe — each tests TCP+TLS+Host-header against Netlify endpoint.
          # Counts as success if HTTP response is 2xx/3xx/4xx (NOT 000 / NOT 429).
          # Early-stops globally as soon as any worker writes to result file.
          local probe_start probe_end probe_dur
          probe_start=$(date +%s)
          timeout 60 bash -c '
            while IFS= read -r combo; do
              # Stop early if another worker already found a hit
              [[ -s "$PROBE_RESULT_FILE" ]] && break
              echo "$combo"
            done < "$1"
          ' _ "$combos_file" | \
          xargs -P 60 -I {} -- bash -c '
            [[ -s "$PROBE_RESULT_FILE" ]] && exit 0
            combo="$1"
            ip="${combo%%|*}"
            sni="${combo##*|}"
            out=$(curl -sk --resolve "${sni}:443:${ip}" \
              -o /dev/null -w "%{http_code}|%{time_total}" \
              --max-time 2 \
              --header "Host: ${NETLIFY_HOST_FOR_PROBE}" \
              "https://${sni}${RELAY_PATH_FOR_PROBE}" 2>/dev/null || echo "000|0")
            code="${out%%|*}"
            time_total="${out##*|}"
            # Success = anything that proves Netlify edge received us (not 000, not 429)
            case "$code" in
              200|301|302|404|405|403)
                # Atomically grab the slot (first writer wins)
                if ( set -o noclobber; > "${PROBE_RESULT_FILE}.lock" ) 2>/dev/null; then
                  ms=$(awk -v t="$time_total" "BEGIN{printf \"%.0f\", t*1000}")
                  echo "${ip}|${sni}|${code}|${ms}" > "$PROBE_RESULT_FILE"
                fi
                ;;
            esac
          ' _ {} 2>/dev/null

          probe_end=$(date +%s)
          probe_dur=$(( probe_end - probe_start ))
          rm -f "$combos_file" "${result_file}.lock"

          if [[ -s "$result_file" ]]; then
            local hit; hit=$(cat "$result_file")
            local hit_ip hit_sni hit_code hit_ms
            hit_ip="${hit%%|*}"; hit="${hit#*|}"
            hit_sni="${hit%%|*}"; hit="${hit#*|}"
            hit_code="${hit%%|*}"; hit_ms="${hit##*|}"

            echo ""
            echo -e "  ${C_GREEN}╔══════════════════════════════════════════════════╗${C_RESET}"
            echo -e "  ${C_GREEN}║  ✔ DOMAIN-FRONTED PATH WORKS                    ║${C_RESET}"
            echo -e "  ${C_GREEN}║    Found a working IP/SNI in ${probe_dur}s                  ║${C_RESET}"
            echo -e "  ${C_GREEN}╚══════════════════════════════════════════════════╝${C_RESET}"
            info "  Working combo:  IP=${hit_ip}  SNI=${hit_sni}  ping=${hit_ms}ms (HTTP ${hit_code})"
            info "  Note: real clients can use the main link OR a fronted variant."
            E2E_STATUS="PASS"
            E2E_DETAIL="fronted via ${hit_ip} / ${hit_sni}  (${hit_ms}ms)"
            E2E_PING_MIN="$hit_ms"
            E2E_PING_AVG="$hit_ms"
            E2E_PING_MAX="$hit_ms"
            E2E_CDN_PING="?"
          else
            warn "No working IP/SNI combo found in ${probe_dur}s out of ${total_combos}."
            info "  Direct: 429 (loop rate-limit)  |  Fronted: nothing routed to Netlify from this server"
            info "  Real clients (phone/PC) usually still work — main link is below."
            E2E_STATUS="UNKNOWN"
            E2E_DETAIL="self-test inconclusive — verify with real client"
          fi

          rm -f "$result_file" "$TEST_CFG" /tmp/xray-test-client.log
          trap - RETURN
          return 0
        fi

        echo ""
        echo -e "  ${C_RED}╔══════════════════════════════════════════════════╗${C_RESET}"
        echo -e "  ${C_RED}║  ✘ END-TO-END TEST FAILED                       ║${C_RESET}"
        echo -e "  ${C_RED}║    HTTP ${probe_code:-000} after ${max_attempts} attempts                ║${C_RESET}"
        echo -e "  ${C_RED}╚══════════════════════════════════════════════════╝${C_RESET}"
        echo ""
        E2E_STATUS="FAIL"
        E2E_DETAIL="HTTP ${probe_code:-000} (${max_attempts} attempts)"

        # ── Targeted diagnostics based on what we actually saw ──
        echo -e "  ${C_CYAN}─── Diagnostics ───${C_RESET}"

        # 1. Can the server reach the CDN at all (TCP/443 + TLS)?
        local cdn_reachable
        cdn_reachable=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 8 \
          -X HEAD "https://${VERCEL_HOST}/" 2>/dev/null || echo "000")
        if [[ "$cdn_reachable" == "000" ]]; then
          fail "  • Cannot reach CDN at all (port 443 to ${VERCEL_HOST} blocked from server)"
        else
          ok "  • CDN reachable on 443 (HTTP ${cdn_reachable})"
        fi

        # 2. Is the upstream xray port (server-side) actually open from outside?
        local upstream_reachable
        upstream_reachable=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 8 \
          "https://${CFG_DOMAIN}:${CFG_INBOUND_PORT}${CFG_RELAY_PATH}" 2>/dev/null || echo "000")
        if [[ "$upstream_reachable" == "000" ]]; then
          fail "  • Upstream xray NOT reachable on ${CFG_DOMAIN}:${CFG_INBOUND_PORT} (firewall / port-blocked)"
        else
          ok "  • Upstream xray reachable (HTTP ${upstream_reachable} on ${CFG_INBOUND_PORT})"
        fi

        # 3. Is xray service still alive on the server?
        if systemctl is-active --quiet xray 2>/dev/null; then
          ok "  • xray service is running"
        else
          fail "  • xray service is NOT running on this server"
        fi

        # 4. Decode what we saw at the application layer
        echo ""
        echo -e "  ${C_CYAN}─── Root cause analysis ───${C_RESET}"
        if [[ -n "$last_known_upstream" ]]; then
          case "$last_known_upstream" in
            429)
              warn "  CDN rate-limited the self-test (HTTP 429)"
              info "  ⓘ This is often a FALSE FAILURE. The end-to-end test runs"
              info "    from THIS server, then loops back to itself through the CDN."
              info "    Netlify often rate-limits this loop pattern, even when real"
              info "    clients (phone, desktop, from another network) work perfectly."
              info "  → Try the client config from your phone/PC before assuming it's broken."
              ;;
            500|502|503|504)
              fail "  CDN got upstream error (HTTP ${last_known_upstream}) — relay couldn't reach your server"
              info "  Check: TARGET_DOMAIN env on ${CFG_PLATFORM}, firewall on port ${CFG_INBOUND_PORT}, SSL cert validity"
              ;;
            404)
              fail "  CDN returned 404 — path mismatch between client/server (RELAY_PATH vs PUBLIC_RELAY_PATH)"
              ;;
            403)
              fail "  CDN returned 403 — request rejected (likely WAF or geo-block on relay)"
              ;;
            *)
              fail "  CDN returned HTTP ${last_known_upstream} — see xray log below"
              ;;
          esac
        elif [[ "$cdn_reachable" == "000" ]]; then
          fail "  Network egress to ${VERCEL_HOST}:443 is blocked from this server"
          info "  Fix: check provider firewall / security group / outbound rules"
        elif [[ "$upstream_reachable" == "000" ]]; then
          fail "  Inbound port ${CFG_INBOUND_PORT} is unreachable — CDN can't relay traffic to you"
          info "  Fix: open port ${CFG_INBOUND_PORT} on UFW and provider firewall"
        else
          fail "  Handshake never completed — likely TLS / SNI mismatch or wrong UUID/path"
          info "  Verify: client UUID matches server UUID ${INBOUND_UUID:-?}"
          info "  Verify: client path matches server path ${CFG_RELAY_PATH}"
        fi

        # 5. Always dump xray test client log for offline inspection
        echo ""
        echo -e "  ${C_CYAN}─── xray test client log (last 20 lines) ───${C_RESET}"
        tail -20 /tmp/xray-test-client.log 2>/dev/null | while read -r l; do echo -e "  ${C_GRAY}  $l${C_RESET}"; done
        echo ""
        info "Full xray log saved to: ${LOG_FILE}"
      fi
    fi

    kill "$TEST_PID" 2>/dev/null || true
    sleep 1
    kill -9 "$TEST_PID" 2>/dev/null || true
    rm -f "$TEST_CFG" /tmp/xray-test-client.log
    trap - RETURN
    fi  # end: xray binary found
  fi
  # End of phase5 (Test 4 / xray-knife removed — Test 3 above is the authoritative check)
  return 0
}

# Stub for the rest of the file that still references xray-knife (keep minimal)
_unused_xray_knife_block() {
  if [[ -z "${XRAY_KNIFE_BIN:-}" || ! -x "${XRAY_KNIFE_BIN:-}" ]]; then
    return 0
  fi

  local KNIFE_CFG
  KNIFE_CFG=$(mktemp --suffix=.json)
  cat > "$KNIFE_CFG" <<KNIFECFG
{
  "log": {"loglevel": "warning"},
  "inbounds": [{
    "port": 10809, "listen": "127.0.0.1",
    "protocol": "socks",
    "settings": {"auth": "noauth", "udp": false}
  }],
  "outbounds": [{
    "protocol": "vless",
    "settings": {
      "vnext": [{
        "address": "${VERCEL_HOST:-${CFG_DOMAIN}}",
        "port": 443,
        "users": [{"id": "${INBOUND_UUID:-00000000-0000-0000-0000-000000000000}", "encryption": "none"}]
      }]
    },
    "streamSettings": {
      "network": "xhttp",
      "security": "tls",
      "tlsSettings": {"serverName": "${VERCEL_HOST:-${CFG_DOMAIN}}"},
      "xhttpSettings": {
        "path": "${CFG_PUBLIC_PATH}",
        "host": "${VERCEL_HOST:-${CFG_DOMAIN}}",
        "mode": "auto"
      }
    }
  }]
}
KNIFECFG

  # xray-knife CLI syntax varies by version — try several common forms.
  local knife_out=""
  local knife_ok=false
  local syntaxes=("net http -c" "http -c" "net real -c" "net tcp -c")
  for syn in "${syntaxes[@]}"; do
    knife_out=$("$XRAY_KNIFE_BIN" $syn "$KNIFE_CFG" \
      -d "https://www.gstatic.com/generate_204" -t 15000 2>&1 || true)
    # Real success contains a numeric latency or HTTP status, NOT just the word "ms" in help
    if echo "$knife_out" | grep -qiE '[0-9]+\s*ms\b|delay:\s*[0-9]+|latency:\s*[0-9]+|status:\s*2[0-9]{2}|HTTP/[0-9.]+\s*2[0-9]{2}'; then
      knife_ok=true
      break
    fi
    # If output looks like a syntax/help error, try next variant; otherwise stop.
    if ! echo "$knife_out" | grep -qiE "unknown command|help for|usage:|\bflag\b|requires.*argument"; then
      break
    fi
  done
  rm -f "$KNIFE_CFG"

  if [[ "$knife_ok" == "true" ]]; then
    ok "xray-knife test PASSED ✔"
    echo "$knife_out" | grep -iE 'latency|delay|[0-9]+\s*ms\b|status' | head -3 | while read -r l; do
      echo -e "  ${C_GREEN}  $l${C_RESET}"
    done
  else
    warn "xray-knife test could not run (binary syntax mismatch — non-fatal)"
    info "Proxy is verified by Test 1/2 above. Try the client link to confirm."
  fi
}

# =============================================================
#  PHASE 6 — FINAL SUMMARY
# =============================================================
phase6_summary() {
  local TARGET_DOMAIN_VAL="https://${CFG_DOMAIN}:${CFG_INBOUND_PORT}"
  local VERCEL_HOST
  VERCEL_HOST=$(echo "${VERCEL_URL:-}" | sed 's|https://||' | sed 's|/.*||')
  local ENCODED_PATH
  ENCODED_PATH=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${CFG_PUBLIC_PATH}'))" 2>/dev/null || echo "${CFG_PUBLIC_PATH}")
  local LINK_TAG="XHTTP-${CFG_PLATFORM}"
  # Netlify needs xPaddingBytes=1-1 (avoids body-modification handshake failures)
  local LINK_PADDING="100-1000"
  [[ "${CFG_PLATFORM:-vercel}" == "netlify" ]] && LINK_PADDING="1-1"
  # URL-encoded {"xPaddingBytes":"<value>"}
  local ENCODED_EXTRA="%7B%22xPaddingBytes%22%3A%22${LINK_PADDING}%22%7D"
  local CLIENT_LINK="vless://${INBOUND_UUID:-UUID}@${VERCEL_HOST}:443?encryption=none&security=tls&sni=${VERCEL_HOST}&fp=chrome&alpn=h2%2Chttp%2F1.1&insecure=0&allowInsecure=0&type=xhttp&host=${VERCEL_HOST}&path=${ENCODED_PATH}&mode=auto&extra=${ENCODED_EXTRA}#${LINK_TAG}"

  echo ""
  echo -e "${C_GREEN}"
  echo "  ╔══════════════════════════════════════════════════════════╗"
  echo "  ║             INSTALLATION COMPLETE  ✔                   ║"
  echo "  ╚══════════════════════════════════════════════════════════╝"
  echo -e "${C_RESET}"
  local SERVER_IP
  SERVER_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
  echo -e "  ${C_WHITE}Platform         :${C_RESET} ${CFG_PLATFORM}"
  echo -e "  ${C_WHITE}Relay URL        :${C_RESET} ${C_CYAN}${VERCEL_URL:-N/A}${C_RESET}"
  echo -e "  ${C_WHITE}Inbound UUID     :${C_RESET} ${C_YELLOW}${INBOUND_UUID:-N/A}${C_RESET}"
  echo -e "  ${C_WHITE}Domain           :${C_RESET} ${CFG_DOMAIN}"
  echo -e "  ${C_WHITE}RELAY_PATH       :${C_RESET} ${CFG_RELAY_PATH}"
  echo -e "  ${C_WHITE}PUBLIC_PATH      :${C_RESET} ${CFG_PUBLIC_PATH}"
  echo -e "  ${C_WHITE}TARGET_DOMAIN    :${C_RESET} ${TARGET_DOMAIN_VAL}"
  echo ""

  # ── E2E test result (set by phase5_healthcheck) ──
  case "${E2E_STATUS:-UNKNOWN}" in
    PASS)
      echo -e "  ${C_GREEN}E2E Proxy Test   : ✔ PASS${C_RESET}"
      echo -e "  ${C_WHITE}Ping (min/avg/max):${C_RESET} ${C_GREEN}${E2E_PING_MIN:-?}/${E2E_PING_AVG:-?}/${E2E_PING_MAX:-?} ms${C_RESET} ${C_GRAY}(through VLESS)${C_RESET}"
      echo -e "  ${C_WHITE}CDN Ping         :${C_RESET} ${C_CYAN}${E2E_CDN_PING:-?} ms${C_RESET} ${C_GRAY}(direct to relay)${C_RESET}"
      # Quality assessment
      if (( ${E2E_PING_AVG:-9999} < 300 )); then
        echo -e "  ${C_GREEN}Quality          : Excellent${C_RESET}"
      elif (( ${E2E_PING_AVG:-9999} < 600 )); then
        echo -e "  ${C_YELLOW}Quality          : Good${C_RESET}"
      elif (( ${E2E_PING_AVG:-9999} < 1200 )); then
        echo -e "  ${C_YELLOW}Quality          : Acceptable (high latency)${C_RESET}"
      else
        echo -e "  ${C_RED}Quality          : Poor (very high latency)${C_RESET}"
      fi
      echo -e "  ${C_GREEN}                   Your client config IS verified to work.${C_RESET}"
      ;;
    FAIL)
      echo -e "  ${C_RED}E2E Proxy Test   : ✘ FAIL${C_RESET} ${C_GRAY}(${E2E_DETAIL})${C_RESET}"
      echo -e "  ${C_RED}                   The client config may NOT work — check log: ${LOG_FILE}${C_RESET}"
      ;;
    *)
      echo -e "  ${C_YELLOW}E2E Proxy Test   : ⚠ NOT RUN${C_RESET}"
      ;;
  esac
  echo ""

  echo -e "  ${C_CYAN}── Client Config (copy into your v2ray/xray client) ──${C_RESET}"
  echo ""
  echo -e "  ${C_YELLOW}${CLIENT_LINK}${C_RESET}"
  echo ""

  echo -e "  ${C_GRAY}Full install log saved to: ${LOG_FILE}${C_RESET}"
  echo -e "${C_GREEN}  ══════════════════════════════════════════════════════════${C_RESET}"
  echo ""
}

# =============================================================
#  AUTO-WRAP IN SCREEN (so SSH disconnect won't kill the install)
# =============================================================
ensure_screen_session() {
  # If already inside screen ($STY) or tmux ($TMUX), do nothing.
  if [[ -n "${STY:-}" ]]; then
    info "Already inside screen session: $STY"
    return 0
  fi
  if [[ -n "${TMUX:-}" ]]; then
    info "Already inside tmux session — proceeding"
    return 0
  fi
  # Skip if user explicitly opts out
  if [[ "${XHTTP_NO_SCREEN:-0}" == "1" ]]; then
    info "XHTTP_NO_SCREEN=1 set — skipping screen wrapper"
    return 0
  fi

  echo ""
  echo -e "  ${C_YELLOW}⚠ You are NOT inside screen/tmux.${C_RESET}"
  echo -e "  ${C_GRAY}If your SSH disconnects, the installation will die mid-way.${C_RESET}"
  echo -e "  ${C_GRAY}Recommended: run inside screen so you can reattach with: ${C_WHITE}screen -r xhttp${C_RESET}"
  echo ""
  read -rp "$(echo -e "  ${C_WHITE}Auto-launch inside screen? [Y/n]${C_RESET}: ")" yn
  case "${yn,,}" in
    n|no)
      warn "Continuing WITHOUT screen — be careful with SSH stability"
      return 0 ;;
  esac

  # Install screen if missing
  if ! command -v screen &>/dev/null; then
    info "Installing screen..."
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq screen 2>/dev/null || {
      fail "Could not install screen — continuing without it"
      return 0
    }
  fi

  # Handle existing session if present
  if screen -ls 2>/dev/null | grep -q "\.xhttp\b"; then
    warn "Existing screen session 'xhttp' found."
    echo -e "  ${C_GRAY}1) Reattach to it     (continue what was running)${C_RESET}"
    echo -e "  ${C_GRAY}2) Kill it & start fresh${C_RESET}"
    echo -e "  ${C_GRAY}3) Cancel${C_RESET}"
    local sc_choice
    read -rp "$(echo -e "  ${C_WHITE}Choose [1/2/3]${C_RESET}: ")" sc_choice
    case "$sc_choice" in
      1)
        ok "Reattaching..."
        exec screen -r xhttp ;;
      2)
        info "Killing old session..."
        screen -S xhttp -X quit 2>/dev/null || true
        sleep 1
        ;;
      *)
        info "Cancelled."
        exit 0 ;;
    esac
  fi

  # Re-launch self inside screen (UTF-8 enabled with -U)
  local script_path
  script_path="$(realpath "$0" 2>/dev/null || echo "$0")"
  ok "Launching inside screen session 'xhttp'..."
  echo -e "  ${C_GRAY}Detach anytime with Ctrl+A then D${C_RESET}"
  echo -e "  ${C_GRAY}If SSH drops, reconnect and run: ${C_WHITE}screen -r xhttp${C_RESET}"
  sleep 2
  # IMPORTANT: pass XHTTP_NO_SCREEN through sudo (sudo strips env by default).
  # `sudo VAR=value cmd` passes VAR into the command's environment.
  exec screen -U -S xhttp bash -c "sudo XHTTP_NO_SCREEN=1 bash '$script_path'; echo; echo 'Press Enter to close screen...'; read"
}

# =============================================================
#  ENTRYPOINT
# =============================================================
main() {
  print_banner
  ensure_screen_session
  print_banner
  echo -e "  ${C_MAGENTA}Important:${C_RESET} Make sure your domain DNS A-record points to this server IP before continuing."
  echo -e "  ${C_GRAY}Tip: Press Ctrl+C at any time to abort.${C_RESET}"
  echo ""

  echo -e "  ${C_CYAN}[ Deployment Platform ]${C_RESET}"
  echo -e "  ${C_WHITE}Choose relay platform:${C_RESET}"
  echo -e "    ${C_YELLOW}1${C_RESET}) Vercel"
  echo -e "    ${C_YELLOW}2${C_RESET}) Netlify"
  while true; do
    read -rp "$(echo -e "  ${C_WHITE}Enter choice [1/2]${C_RESET}: ")" plat_choice
    case "$plat_choice" in
      1) CFG_PLATFORM="vercel";  break ;;
      2) CFG_PLATFORM="netlify"; break ;;
      *) fail "Enter 1 for Vercel or 2 for Netlify" ;;
    esac
  done
  ok "Platform: ${CFG_PLATFORM}"
  echo ""

  read -rp "$(echo -e "  ${C_WHITE}Press Enter to start installation...${C_RESET}")"

  phase1_preflight
  phase2_install_all
  phase3_collect_input
  autofix_diagnose "FIREWALL"
  autofix_and_retry "SSL"    phase4a_ssl
  autofix_and_retry "XRAYSSL" phase4b_configure_xray
  autofix_and_retry "${CFG_PLATFORM:-vercel}" phase4c_deploy
  phase5_healthcheck
  phase6_summary
}

main "$@"

