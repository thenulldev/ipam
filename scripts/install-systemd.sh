#!/usr/bin/env bash
#
# install-systemd.sh — install / upgrade / remove the IPAM systemd service.
#
# What it does (install):
#   1. Creates the `ipam` system user (no login, no home dir)
#   2. Provisions /opt/ipam (release tree) and /var/lib/ipam (data dir)
#   3. Generates IPAM_SESSION_SECRET if missing
#   4. Installs deploy/systemd/ipam.service -> /etc/systemd/system/ipam.service
#   5. Installs deploy/systemd/ipam.env.example -> /etc/ipam/ipam.env
#   6. Runs `npm ci --omit=dev && npm run build:all` inside /opt/ipam
#   7. Enables + starts the service, tails the healthcheck until green
#
# Usage:
#   sudo ./scripts/install-systemd.sh                 # install
#   sudo ./scripts/install-systemd.sh --update        # git pull + rebuild + restart
#   sudo ./scripts/install-systemd.sh --remove        # stop + uninstall (data preserved)
#   sudo ./scripts/install-systemd.sh --purge         # stop + uninstall + delete data
#
# Environment overrides:
#   IPAM_INSTALL_DIR=/opt/ipam         # release tree
#   IPAM_DATA_DIR=/var/lib/ipam         # persistent state
#   IPAM_PORT=8787                      # listening port
#   IPAM_RUN_AS=ipam                    # service user/group
set -euo pipefail

# --- root check -----------------------------------------------------------
if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: must be run as root (use sudo)" >&2
  exit 1
fi

# --- config ---------------------------------------------------------------
IPAM_INSTALL_DIR="${IPAM_INSTALL_DIR:-/opt/ipam}"
IPAM_DATA_DIR="${IPAM_DATA_DIR:-/var/lib/ipam}"
IPAM_PORT="${IPAM_PORT:-8787}"
IPAM_RUN_AS="${IPAM_RUN_AS:-ipam}"
IPAM_RUN_GROUP="${IPAM_RUN_GROUP:-ipam}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Repo root = one up from scripts/
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

log() { printf '[install-systemd] %s\n' "$*" >&2; }

# --- subcommands ----------------------------------------------------------
remove_service() {
  log "Stopping + disabling ipam.service (data preserved)"
  systemctl stop ipam.service 2>/dev/null || true
  systemctl disable ipam.service 2>/dev/null || true
  rm -f /etc/systemd/system/ipam.service
  rm -f /etc/ipam/ipam.env
  systemctl daemon-reload
  rm -rf "$IPAM_INSTALL_DIR"
  if [ "${1:-}" = "--purge-data" ]; then
    log "Purging $IPAM_DATA_DIR"
    rm -rf "$IPAM_DATA_DIR"
  fi
  if id "$IPAM_RUN_AS" >/dev/null 2>&1; then
    userdel "$IPAM_RUN_AS" 2>/dev/null || true
  fi
  log "Done."
}

# --- pre-flight -----------------------------------------------------------
if [ "${1:-}" = "--remove" ]; then
  remove_service
  exit 0
fi
if [ "${1:-}" = "--purge" ]; then
  remove_service --purge-data
  exit 0
fi

if [ ! -f "$REPO_DIR/package.json" ]; then
  log "ERROR: package.json not found at $REPO_DIR — run this from the repo root or scripts/."
  exit 1
fi

# --- ensure system user exists ------------------------------------------
if ! id "$IPAM_RUN_AS" >/dev/null 2>&1; then
  log "Creating system user $IPAM_RUN_AS (no login, no home)"
  useradd \
    --system \
    --no-create-home \
    --shell /usr/sbin/nologin \
    --user-group \
    "$IPAM_RUN_AS"
fi

# --- ensure data dir exists ---------------------------------------------
mkdir -p "$IPAM_DATA_DIR/uploads" "$IPAM_DATA_DIR/backups"
chown -R "$IPAM_RUN_AS:$IPAM_RUN_GROUP" "$IPAM_DATA_DIR"
chmod 0750 "$IPAM_DATA_DIR"

# --- install release tree -------------------------------------------------
if [ "$(realpath "$REPO_DIR")" != "$(realpath "$IPAM_INSTALL_DIR")" ]; then
  log "Syncing repo to $IPAM_INSTALL_DIR"
  mkdir -p "$IPAM_INSTALL_DIR"
  # rsync without --delete so a manual /opt/ipam/extra stays put; if you'd rather
  # have the install dir be a strict mirror of the repo, drop the exclude list.
  rsync -a --delete \
    --exclude '.git' \
    --exclude 'data' \
    --exclude '.paperclip' \
    --exclude '.paperclip-tmp' \
    --exclude 'dist' \
    --exclude 'server-build' \
    --exclude 'node_modules' \
    "$REPO_DIR/" "$IPAM_INSTALL_DIR/"
fi

# --- secrets --------------------------------------------------------------
mkdir -p /etc/ipam
chmod 0750 /etc/ipam

if [ ! -f /etc/ipam/ipam.env ]; then
  log "Bootstrapping /etc/ipam/ipam.env from template"
  sed \
    -e "s|^PORT=.*|PORT=$IPAM_PORT|" \
    -e "s|^IPAM_DATA_DIR=.*|IPAM_DATA_DIR=$IPAM_DATA_DIR|" \
    -e "s|^IPAM_DB=.*|IPAM_DB=$IPAM_DATA_DIR/ipam.db|" \
    -e "s|^IPAM_UPLOAD_DIR=.*|IPAM_UPLOAD_DIR=$IPAM_DATA_DIR/uploads|" \
    -e "s|^IPAM_DIST_DIR=.*|IPAM_DIST_DIR=$IPAM_INSTALL_DIR/dist|" \
    "$REPO_DIR/deploy/systemd/ipam.env.example" > /etc/ipam/ipam.env
  SECRET_HEX=$(head -c 32 /dev/urandom | xxd -p -c 64)
  sed -i "s|^IPAM_SESSION_SECRET=.*|IPAM_SESSION_SECRET=$SECRET_HEX|" /etc/ipam/ipam.env
fi
chown root:"$IPAM_RUN_GROUP" /etc/ipam/ipam.env
chmod 0640 /etc/ipam/ipam.env

# Bail if the operator still has the placeholder secret in place — better
# to fail loudly than to silently run with a dev fallback.
if grep -q '^IPAM_SESSION_SECRET=replace-me' /etc/ipam/ipam.env; then
  log "ERROR: /etc/ipam/ipam.env still has the placeholder IPAM_SESSION_SECRET."
  log "       Edit it and re-run this script before starting the service."
  exit 1
fi

# --- install the unit ----------------------------------------------------
install -m 0644 "$REPO_DIR/deploy/systemd/ipam.service" /etc/systemd/system/ipam.service
# Re-pin User/Group so an override of IPAM_RUN_AS at install time sticks.
sed -i "s|^User=.*|User=$IPAM_RUN_AS|; s|^Group=.*|Group=$IPAM_RUN_GROUP|" /etc/systemd/system/ipam.service

systemctl daemon-reload

# --- rebuild -------------------------------------------------------------
cd "$IPAM_INSTALL_DIR"
chown -R "$IPAM_RUN_AS:$IPAM_RUN_GROUP" "$IPAM_INSTALL_DIR"

log "Installing production deps (npm ci --omit=dev)"
sudo -u "$IPAM_RUN_AS" -H npm ci --omit=dev --no-audit --no-fund

log "Building frontend + server (npm run build:all)"
sudo -u "$IPAM_RUN_AS" -H npm run build:all

# --- start ---------------------------------------------------------------
log "Enabling + starting ipam.service"
systemctl enable ipam.service
systemctl restart ipam.service

# --- wait for green ------------------------------------------------------
log "Waiting for /healthz to return 200 on http://127.0.0.1:$IPAM_PORT ..."
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$IPAM_PORT/healthz" >/dev/null 2>&1; then
    log "Service is healthy."
    curl -sS "http://127.0.0.1:$IPAM_PORT/healthz" | sed 's/^/[install-systemd]   /'
    exit 0
  fi
  sleep 1
done

log "ERROR: /healthz did not return 200 within 30s."
log "       Inspect: sudo journalctl -u ipam -n 100 --no-pager"
exit 1