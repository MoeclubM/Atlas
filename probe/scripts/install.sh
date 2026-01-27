#!/usr/bin/env bash
set -euo pipefail

REPO_OWNER="MoeclubM"
REPO_NAME="Atlas"

DEFAULT_INSTALL_DIR="/usr/local/bin"
DEFAULT_BIN_NAME="atlas-probe"
DEFAULT_CONFIG_DIR="/etc/atlas-probe"
DEFAULT_CONFIG_PATH="${DEFAULT_CONFIG_DIR}/config.yaml"
DEFAULT_STATE_DIR="/var/lib/atlas-probe"
DEFAULT_SERVICE_NAME="atlas-probe.service"
DEFAULT_USER="atlas-probe"

usage() {
  cat <<'EOF'
Atlas Probe installer (Debian/Ubuntu)

Usage:
  sudo ./install.sh [--version vX.Y.Z] [--repo owner/name]

Options:
  --version <tag>    Install specific release tag (e.g. v1.2.3). Default: latest
  --repo <owner/name>Override GitHub repo. Default: MoeclubM/Atlas

This script:
  - Installs required packages: iputils-ping, mtr-tiny, traceroute, ca-certificates, curl
  - Downloads atlas-probe from GitHub Releases and verifies SHA256 from checksums.txt
  - Creates user atlas-probe and required directories
  - Writes config at /etc/atlas-probe/config.yaml (only if missing)
  - Installs systemd unit and enables service
EOF
}

need_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Please run as root (use sudo)." >&2
    exit 1
  fi
}

have_cmd() { command -v "$1" >/dev/null 2>&1; }

apt_install_deps() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    iputils-ping \
    mtr-tiny \
    traceroute
}

get_arch() {
  local arch
  arch="$(uname -m)"
  case "${arch}" in
    x86_64) echo "amd64" ;;
    aarch64|arm64) echo "arm64" ;;
    *)
      echo "Unsupported architecture: ${arch}" >&2
      exit 1
      ;;
  esac
}

github_api() {
  local path="$1"
  curl -fsSL "https://api.github.com${path}"
}

resolve_version() {
  local version="$1"
  if [[ -n "${version}" ]]; then
    echo "${version}"
    return
  fi

  # latest tag
  github_api "/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest" \
    | sed -n 's/^[[:space:]]*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]\+\)".*/\1/p' \
    | head -n 1
}

download_release_assets() {
  local version="$1"
  local arch="$2"

  local base_url="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${version}"
  local tgz="${DEFAULT_BIN_NAME}_${version}_linux_${arch}.tar.gz"

  mkdir -p /tmp/atlas-probe-install
  cd /tmp/atlas-probe-install

  curl -fsSLO "${base_url}/${tgz}"
  curl -fsSLO "${base_url}/checksums.txt"

  if ! grep -F "${tgz}" checksums.txt >/dev/null 2>&1; then
    echo "checksums.txt does not contain entry for ${tgz}" >&2
    exit 1
  fi

  (grep -F "${tgz}" checksums.txt | sha256sum -c -)

  tar -xzf "${tgz}"
  if [[ ! -f "${DEFAULT_BIN_NAME}" ]]; then
    echo "Archive missing ${DEFAULT_BIN_NAME}" >&2
    exit 1
  fi

  install -m 0755 "${DEFAULT_BIN_NAME}" "${DEFAULT_INSTALL_DIR}/${DEFAULT_BIN_NAME}"
}

ensure_user_and_dirs() {
  if ! id -u "${DEFAULT_USER}" >/dev/null 2>&1; then
    useradd --system --home "${DEFAULT_STATE_DIR}" --shell /usr/sbin/nologin "${DEFAULT_USER}"
  fi

  mkdir -p "${DEFAULT_CONFIG_DIR}" "${DEFAULT_STATE_DIR}"
  chown -R "${DEFAULT_USER}:${DEFAULT_USER}" "${DEFAULT_STATE_DIR}"
}

install_config_if_missing() {
  if [[ -f "${DEFAULT_CONFIG_PATH}" ]]; then
    return
  fi

  cat >"${DEFAULT_CONFIG_PATH}" <<'EOF'
probe:
  name: "atlas-probe"
  # location/region/lat/lon are auto-detected by probe at runtime.

server:
  # IMPORTANT: set to your web server WS endpoint
  url: "ws://YOUR_WEB_HOST:18080/ws"

  # IMPORTANT: must equal Web SHARED_SECRET
  auth_token: "YOUR_SHARED_SECRET"

  reconnect_interval: 5
  max_reconnect_attempts: 0

capabilities:
  - icmp_ping
  - tcp_ping
  - mtr
  - traceroute

executor:
  max_concurrent_tasks: 5
  task_timeout: 300

logging:
  level: info
  file: /var/log/atlas-probe/probe.log
EOF

  mkdir -p /var/log/atlas-probe
  chown -R "${DEFAULT_USER}:${DEFAULT_USER}" /var/log/atlas-probe
}

install_systemd_unit() {
  local unit_path="/etc/systemd/system/${DEFAULT_SERVICE_NAME}"

  cat >"${unit_path}" <<EOF
[Unit]
Description=Atlas Probe
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${DEFAULT_USER}
Group=${DEFAULT_USER}
WorkingDirectory=${DEFAULT_STATE_DIR}
ExecStart=${DEFAULT_INSTALL_DIR}/${DEFAULT_BIN_NAME} -config ${DEFAULT_CONFIG_PATH}
Restart=always
RestartSec=3

# Capabilities for ping/mtr/traceroute
AmbientCapabilities=CAP_NET_RAW CAP_NET_ADMIN
CapabilityBoundingSet=CAP_NET_RAW CAP_NET_ADMIN
NoNewPrivileges=true

# Basic hardening
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${DEFAULT_STATE_DIR} /var/log/atlas-probe ${DEFAULT_CONFIG_DIR}

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now "${DEFAULT_SERVICE_NAME}"
}

main() {
  need_root

  local version=""
  local repo_override=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --version)
        version="$2"; shift 2 ;;
      --repo)
        repo_override="$2"; shift 2 ;;
      -h|--help)
        usage; exit 0 ;;
      *)
        echo "Unknown argument: $1" >&2
        usage
        exit 1
        ;;
    esac
  done

  if [[ -n "${repo_override}" ]]; then
    REPO_OWNER="${repo_override%%/*}"
    REPO_NAME="${repo_override##*/}"
  fi

  echo "Installing dependencies..."
  apt_install_deps

  local arch
  arch="$(get_arch)"

  local resolved_version
  resolved_version="$(resolve_version "${version}")"
  if [[ -z "${resolved_version}" ]]; then
    echo "Failed to resolve version (latest)." >&2
    exit 1
  fi

  echo "Installing ${DEFAULT_BIN_NAME} ${resolved_version} for linux/${arch}..."
  download_release_assets "${resolved_version}" "${arch}"

  echo "Ensuring user and directories..."
  ensure_user_and_dirs

  echo "Installing config if missing..."
  install_config_if_missing

  echo "Installing systemd unit..."
  install_systemd_unit

  echo "Done. Service status:"
  systemctl --no-pager --full status "${DEFAULT_SERVICE_NAME}" || true

  echo "Note: edit ${DEFAULT_CONFIG_PATH} and set server.url + server.auth_token, then:"
  echo "  sudo systemctl restart ${DEFAULT_SERVICE_NAME}"
}

main "$@"
