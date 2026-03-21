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
  sudo ./install.sh [--version vX.Y.Z] [--repo owner/name] [--server-url ws://host:18080/ws] [--auth-token xxx] [--probe-name name]

Options:
  --version <tag>      Install specific release tag (e.g. v1.2.3). Default: latest
  --repo <owner/name>  Override GitHub repo. Default: MoeclubM/Atlas
  --server-url <url>   WebSocket controller URL, e.g. wss://atlas.example.com/ws
  --auth-token <token> Probe auth token. Must equal Web SHARED_SECRET
  --probe-name <name>  Probe name. Default: atlas-probe
  --no-start           Install/update files only. Do not enable or start the service

This script:
  - Installs required packages: iputils-ping, traceroute, ca-certificates, curl
  - Downloads atlas-probe from GitHub Releases and verifies SHA256 from checksums.txt
  - Creates user atlas-probe and required directories
  - Writes config at /etc/atlas-probe/config.yaml
  - Installs systemd unit
  - Starts service immediately when controller URL and auth token are configured
EOF
}

need_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Please run as root (use sudo)." >&2
    exit 1
  fi
}

apt_install_deps() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    iputils-ping \
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
  local work_dir

  work_dir="$(mktemp -d /tmp/atlas-probe-install.XXXXXX)"
  trap 'rm -rf "${work_dir}"' RETURN
  cd "${work_dir}"

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

yaml_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s' "${value}"
}

read_config_value() {
  local section="$1"
  local key="$2"

  if [[ ! -f "${DEFAULT_CONFIG_PATH}" ]]; then
    return
  fi

  awk -v section="${section}" -v key="${key}" '
    $0 ~ ("^" section ":") { in_section = 1; next }
    in_section && /^[^[:space:]]/ { in_section = 0 }
    in_section && $1 == key ":" {
      sub(/^[^:]+:[[:space:]]*/, "", $0)
      gsub(/^"/, "", $0)
      gsub(/"$/, "", $0)
      print $0
      exit
    }
  ' "${DEFAULT_CONFIG_PATH}"
}

is_placeholder_config() {
  local server_url="$1"
  local auth_token="$2"
  [[ -z "${server_url}" || -z "${auth_token}" || "${server_url}" == *"YOUR_WEB_HOST"* || "${auth_token}" == "YOUR_SHARED_SECRET" ]]
}

write_config() {
  local probe_name="$1"
  local server_url="$2"
  local auth_token="$3"

  cat >"${DEFAULT_CONFIG_PATH}" <<EOF
probe:
  name: "$(yaml_escape "${probe_name}")"
  # location/region/lat/lon are auto-detected by probe at runtime.

server:
  # IMPORTANT: set to your web server WS endpoint
  url: "$(yaml_escape "${server_url}")"

  # IMPORTANT: must equal Web SHARED_SECRET
  auth_token: "$(yaml_escape "${auth_token}")"

  reconnect_interval: 5
  max_reconnect_attempts: 0

capabilities:
  - icmp_ping
  - tcp_ping
  - traceroute

executor:
  max_concurrent_tasks: 5
  task_timeout: 300
EOF

  chmod 0640 "${DEFAULT_CONFIG_PATH}"
  chown root:"${DEFAULT_USER}" "${DEFAULT_CONFIG_PATH}"
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

# Capabilities for ping/traceroute
AmbientCapabilities=CAP_NET_RAW CAP_NET_ADMIN
CapabilityBoundingSet=CAP_NET_RAW CAP_NET_ADMIN
NoNewPrivileges=true

# Basic hardening
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${DEFAULT_STATE_DIR} ${DEFAULT_CONFIG_DIR}

[Install]
WantedBy=multi-user.target
EOF

  chmod 0644 "${unit_path}"
}

apply_config() {
  local requested_probe_name="$1"
  local requested_server_url="$2"
  local requested_auth_token="$3"

  local current_probe_name current_server_url current_auth_token
  local effective_probe_name effective_server_url effective_auth_token

  current_probe_name="$(read_config_value probe name || true)"
  current_server_url="$(read_config_value server url || true)"
  current_auth_token="$(read_config_value server auth_token || true)"

  effective_probe_name="${requested_probe_name:-${current_probe_name:-atlas-probe}}"
  effective_server_url="${requested_server_url:-${current_server_url:-ws://YOUR_WEB_HOST:18080/ws}}"
  effective_auth_token="${requested_auth_token:-${current_auth_token:-YOUR_SHARED_SECRET}}"

  if [[ ! -f "${DEFAULT_CONFIG_PATH}" || -n "${requested_probe_name}" || -n "${requested_server_url}" || -n "${requested_auth_token}" ]]; then
    if [[ -f "${DEFAULT_CONFIG_PATH}" ]]; then
      cp -f "${DEFAULT_CONFIG_PATH}" "${DEFAULT_CONFIG_PATH}.bak"
    fi
    write_config "${effective_probe_name}" "${effective_server_url}" "${effective_auth_token}"
  fi

  if is_placeholder_config "${effective_server_url}" "${effective_auth_token}"; then
    return 1
  fi
  return 0
}

manage_service() {
  local should_start="$1"

  systemctl daemon-reload
  if [[ "${should_start}" == "1" ]]; then
    systemctl enable "${DEFAULT_SERVICE_NAME}" >/dev/null 2>&1 || true
    if systemctl is-active --quiet "${DEFAULT_SERVICE_NAME}"; then
      systemctl restart "${DEFAULT_SERVICE_NAME}"
    else
      systemctl start "${DEFAULT_SERVICE_NAME}"
    fi
  fi
}

main() {
  need_root

  local version=""
  local repo_override=""
  local server_url="${ATLAS_SERVER_URL:-}"
  local auth_token="${ATLAS_AUTH_TOKEN:-}"
  local probe_name="${ATLAS_PROBE_NAME:-}"
  local no_start="0"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --version)
        version="$2"; shift 2 ;;
      --repo)
        repo_override="$2"; shift 2 ;;
      --server-url)
        server_url="$2"; shift 2 ;;
      --auth-token)
        auth_token="$2"; shift 2 ;;
      --probe-name)
        probe_name="$2"; shift 2 ;;
      --no-start)
        no_start="1"; shift ;;
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

  echo "Writing config..."
  local config_ready="0"
  if apply_config "${probe_name}" "${server_url}" "${auth_token}"; then
    config_ready="1"
  fi

  echo "Installing systemd unit..."
  install_systemd_unit

  if [[ "${no_start}" == "1" ]]; then
    echo "Skipping service start because --no-start was provided."
  elif [[ "${config_ready}" == "1" ]]; then
    echo "Enabling and starting service..."
    manage_service "1"
    echo "Done. Service status:"
    systemctl --no-pager --full status "${DEFAULT_SERVICE_NAME}" || true
  else
    echo "Controller URL / auth token are not configured; service was not started."
    echo "Set them with one command, for example:"
    echo "  sudo bash probe/scripts/install.sh --server-url wss://atlas.example.com/ws --auth-token YOUR_SHARED_SECRET --probe-name $(hostname -s)"
    echo "Or edit ${DEFAULT_CONFIG_PATH}, then run:"
    echo "  sudo systemctl enable --now ${DEFAULT_SERVICE_NAME}"
  fi
}

main "$@"
