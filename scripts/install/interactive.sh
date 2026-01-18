#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
if [[ ! -f "${PROJECT_ROOT}/package.json" ]]; then
    PROJECT_ROOT="$(pwd)"
fi

IS_REPO=false
if [[ -f "${PROJECT_ROOT}/package.json" && -d "${PROJECT_ROOT}/android" ]]; then
    IS_REPO=true
fi

# ============================================================================
# New CLI Options and Global State
# ============================================================================
DRY_RUN=false
DRY_RUN_LOG=()
NON_INTERACTIVE=false
PRESET=""
CONFIGURE_MCP_CLIENTS=false

# Gum bundling configuration
GUM_VERSION="0.15.2"
GUM_INSTALL_DIR="${HOME}/.automobile/bin"
GUM_BINARY="${GUM_INSTALL_DIR}/gum"
GUM_VERSION_FILE="${GUM_INSTALL_DIR}/.gum-version"

# Config backup directory
BACKUP_DIR="${HOME}/.automobile/backups"
BACKUP_TIMESTAMP=""

# MCP client detection (parallel arrays for bash 3.x compatibility)
# Format: "client_name|config_path|format|scope"
MCP_CLIENT_LIST=()
SELECTED_MCP_CLIENTS=()
IOS_RUNTIME_NAMES=()

# ============================================================================
# Original Global State
# ============================================================================
INSTALL_BUN=false
BUN_INSTALLED=false
ANDROID_SDK_DETECTED=false
INSTALL_IDE_PLUGIN=false
IDE_PLUGIN_METHOD=""
IDE_PLUGIN_ZIP_URL=""
IDE_PLUGIN_DIR=""
INSTALL_AUTOMOBILE_CLI=false
START_DAEMON=false
DAEMON_STARTED=false
AUTO_MOBILE_CMD=()

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# ============================================================================
# CLI Argument Parsing
# ============================================================================
show_help() {
    cat << 'EOF'
AutoMobile Interactive Installer

Usage: ./interactive.sh [OPTIONS]

Options:
  --dry-run           Show what would happen without making changes
  --preset NAME       Use preset configuration (minimal, development)
  --non-interactive   Skip interactive prompts, use defaults
  -h, --help          Show this help message

Presets:
  minimal      - CLI + MCP client configuration only
  development  - Full setup with debug flags and IDE plugin (if available)

Examples:
  ./interactive.sh --dry-run
  ./interactive.sh --preset development
  ./interactive.sh --preset development --non-interactive

EOF
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --preset)
                if [[ -z "${2:-}" ]]; then
                    plain_error "Missing value for --preset"
                    exit 1
                fi
                PRESET="$2"
                shift 2
                ;;
            --non-interactive|-y)
                NON_INTERACTIVE=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                plain_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done

    # Validate preset if provided
    if [[ -n "${PRESET}" ]]; then
        case "${PRESET}" in
            minimal|development)
                ;;
            *)
                plain_error "Unknown preset: ${PRESET}. Valid options: minimal, development"
                exit 1
                ;;
        esac
    fi
}

# ============================================================================
# Dry-Run Wrapper Functions
# ============================================================================
# Execute a command or log it in dry-run mode
execute() {
    local description="$1"
    shift

    if [[ "${DRY_RUN}" == "true" ]]; then
        DRY_RUN_LOG+=("[DRY-RUN] ${description}")
        if command_exists gum; then
            gum log --level info "[DRY-RUN] Would: ${description}"
        else
            printf '[DRY-RUN] Would: %s\n' "${description}"
        fi
        return 0
    fi

    "$@"
}

# Execute with spinner or log in dry-run mode
execute_spinner() {
    local title="$1"
    shift

    if [[ "${DRY_RUN}" == "true" ]]; then
        DRY_RUN_LOG+=("[DRY-RUN] ${title}")
        if command_exists gum; then
            gum log --level info "[DRY-RUN] Would: ${title}"
        else
            printf '[DRY-RUN] Would: %s\n' "${title}"
        fi
        return 0
    fi

    run_spinner "${title}" "$@"
}

# Write file or show content in dry-run mode
write_file() {
    local path="$1"
    local content="$2"
    local description="${3:-Write to ${path}}"

    if [[ "${DRY_RUN}" == "true" ]]; then
        DRY_RUN_LOG+=("[DRY-RUN] ${description}")
        if command_exists gum; then
            gum log --level info "[DRY-RUN] Would write to: ${path}"
            gum style --border rounded --padding "0 1" --margin "0 2" "${content}"
        else
            printf '[DRY-RUN] Would write to: %s\n' "${path}"
            printf '%s\n' "${content}"
        fi
        return 0
    fi

    # Create parent directory if needed
    local parent_dir
    parent_dir=$(dirname "${path}")
    if [[ ! -d "${parent_dir}" ]]; then
        mkdir -p "${parent_dir}"
    fi

    printf '%s\n' "${content}" > "${path}"
}

# Print dry-run summary at the end
print_dry_run_summary() {
    if [[ "${DRY_RUN}" != "true" ]]; then
        return 0
    fi

    if [[ ${#DRY_RUN_LOG[@]} -eq 0 ]]; then
        log_info "Dry-run complete. No actions would be taken."
        return 0
    fi

    echo ""
    gum style --bold --foreground 214 "Dry-Run Summary"
    gum style --faint "The following actions would be performed:"
    echo ""

    local i=1
    for action in "${DRY_RUN_LOG[@]}"; do
        # Strip [DRY-RUN] prefix for cleaner output
        local clean_action="${action#\[DRY-RUN\] }"
        printf '  %d. %s\n' "${i}" "${clean_action}"
        ((i++))
    done

    echo ""
    gum style --foreground 214 "Run without --dry-run to execute these actions."
}

plain_info() {
    printf '[INFO] %s\n' "$1"
}

plain_warn() {
    printf '[WARN] %s\n' "$1"
}

plain_error() {
    printf '[ERROR] %s\n' "$1" >&2
}

prompt_confirm_plain() {
    local prompt="$1"
    local reply=""
    read -r -p "${prompt} [y/N] " reply
    case "${reply}" in
        y|Y|yes|YES)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

detect_os() {
    case "$(uname -s)" in
        Darwin*)
            echo "macos"
            ;;
        Linux*)
            echo "linux"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

detect_arch() {
    case "$(uname -m)" in
        x86_64|amd64)
            echo "x86_64"
            ;;
        arm64|aarch64)
            echo "arm64"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

download_file() {
    local url="$1"
    local destination="$2"

    if command_exists curl; then
        curl -fsSL "${url}" -o "${destination}"
    elif command_exists wget; then
        wget -qO "${destination}" "${url}"
    else
        return 1
    fi
}

fetch_gum_version() {
    local version=""

    if command_exists curl; then
        version=$(curl -s "https://api.github.com/repos/charmbracelet/gum/releases/latest" \
            | sed -nE 's/.*"tag_name": "v?([^"]+)".*/\1/p' \
            | head -n 1)
    elif command_exists wget; then
        version=$(wget -qO- "https://api.github.com/repos/charmbracelet/gum/releases/latest" \
            | sed -nE 's/.*"tag_name": "v?([^"]+)".*/\1/p' \
            | head -n 1)
    fi

    if [[ -z "${version}" ]]; then
        version="0.17.0"
    fi

    echo "${version}"
}

# Check if bundled gum is installed and current version
is_bundled_gum_current() {
    if [[ ! -x "${GUM_BINARY}" ]]; then
        return 1
    fi

    if [[ ! -f "${GUM_VERSION_FILE}" ]]; then
        return 1
    fi

    local installed_version
    installed_version=$(cat "${GUM_VERSION_FILE}" 2>/dev/null || echo "")

    [[ "${installed_version}" == "${GUM_VERSION}" ]]
}

# Install gum to ~/.automobile/bin (bundled approach)
install_bundled_gum() {
    local os="$1"
    local arch="$2"
    local os_label=""
    local arch_label=""

    case "${os}" in
        macos)
            os_label="Darwin"
            ;;
        linux)
            os_label="Linux"
            ;;
        *)
            plain_error "Unsupported OS for gum install: ${os}"
            return 1
            ;;
    esac

    case "${arch}" in
        x86_64)
            arch_label="x86_64"
            ;;
        arm64)
            arch_label="arm64"
            ;;
        *)
            plain_error "Unsupported architecture for gum install: ${arch}"
            return 1
            ;;
    esac

    if ! command_exists curl && ! command_exists wget; then
        plain_error "Missing curl or wget; install one to download gum."
        return 1
    fi

    local download_url="https://github.com/charmbracelet/gum/releases/download/v${GUM_VERSION}/gum_${GUM_VERSION}_${os_label}_${arch_label}.tar.gz"

    plain_info "Downloading gum ${GUM_VERSION} to ${GUM_INSTALL_DIR}..."

    local temp_dir
    temp_dir=$(mktemp -d)
    local archive_path="${temp_dir}/gum.tar.gz"

    if ! download_file "${download_url}" "${archive_path}"; then
        plain_error "Failed to download gum from ${download_url}"
        rm -rf "${temp_dir}"
        return 1
    fi

    tar -xzf "${archive_path}" -C "${temp_dir}"

    mkdir -p "${GUM_INSTALL_DIR}"
    mv "${temp_dir}/gum" "${GUM_BINARY}"
    chmod +x "${GUM_BINARY}"
    echo "${GUM_VERSION}" > "${GUM_VERSION_FILE}"
    rm -rf "${temp_dir}"

    if [[ ":${PATH}:" != *":${GUM_INSTALL_DIR}:"* ]]; then
        export PATH="${GUM_INSTALL_DIR}:${PATH}"
    fi

    plain_info "gum ${GUM_VERSION} installed to ${GUM_INSTALL_DIR}"
}

# Legacy function for backward compatibility - now redirects to bundled install
install_gum_manual() {
    local os="$1"
    local arch="$2"
    install_bundled_gum "${os}" "${arch}"
}

install_gum() {
    local os
    os=$(detect_os)
    local arch
    arch=$(detect_arch)

    if [[ "${os}" == "unknown" || "${arch}" == "unknown" ]]; then
        plain_error "Unsupported platform: ${os}/${arch}"
        return 1
    fi

    if command_exists brew; then
        plain_info "Installing gum with Homebrew..."
        brew install gum
        return 0
    fi

    if [[ "${os}" == "linux" ]]; then
        if install_gum_linux; then
            return 0
        fi
    fi

    install_gum_manual "${os}" "${arch}"
}

ensure_gum() {
    # 1. Check bundled gum first (preferred)
    if is_bundled_gum_current; then
        export PATH="${GUM_INSTALL_DIR}:${PATH}"
        return 0
    fi

    # 2. Check system gum
    if command_exists gum; then
        return 0
    fi

    # 3. Check ~/.local/bin (previous install location)
    if [[ -x "${HOME}/.local/bin/gum" ]]; then
        export PATH="${HOME}/.local/bin:${PATH}"
        return 0
    fi

    # 4. Need to install - prompt user
    plain_warn "gum is required for the interactive installer."

    local os
    os=$(detect_os)
    local arch
    arch=$(detect_arch)

    if [[ "${NON_INTERACTIVE}" == "true" ]]; then
        # In non-interactive mode, just install bundled gum
        plain_info "Installing bundled gum ${GUM_VERSION}..."
        if ! install_bundled_gum "${os}" "${arch}"; then
            plain_error "gum installation failed."
            exit 1
        fi
    else
        if ! prompt_confirm_plain "Install gum ${GUM_VERSION} to ${GUM_INSTALL_DIR}?"; then
            plain_error "gum is required to continue."
            exit 1
        fi

        # Try bundled install first
        if ! install_bundled_gum "${os}" "${arch}"; then
            # Fall back to system package manager
            plain_warn "Bundled install failed, trying system package manager..."
            if ! install_gum; then
                plain_error "gum installation failed."
                exit 1
            fi
        fi
    fi

    # Verify gum is now available
    if ! command_exists gum; then
        plain_error "gum is still not available on PATH."
        exit 1
    fi
}

log_info() {
    gum log --level info "$1"
}

log_warn() {
    gum log --level warn "$1"
}

log_error() {
    gum log --level error "$1"
}

install_gum_linux() {
    local -a sudo_cmd=()

    if [[ "${EUID}" -ne 0 ]]; then
        if command_exists sudo; then
            sudo_cmd=(sudo)
        else
            plain_warn "sudo not available; falling back to manual gum install."
            return 1
        fi
    fi

    if command_exists apt-get; then
        plain_info "Installing gum with apt-get..."
        if ! "${sudo_cmd[@]}" apt-get update; then
            plain_warn "apt-get update failed; falling back to manual gum install."
            return 1
        fi
        if "${sudo_cmd[@]}" apt-get install -y gum; then
            return 0
        fi
        plain_warn "apt-get install failed; falling back to manual gum install."
    elif command_exists dnf; then
        plain_info "Installing gum with dnf..."
        if "${sudo_cmd[@]}" dnf install -y gum; then
            return 0
        fi
        plain_warn "dnf install failed; falling back to manual gum install."
    elif command_exists yum; then
        plain_info "Installing gum with yum..."
        if "${sudo_cmd[@]}" yum install -y gum; then
            return 0
        fi
        plain_warn "yum install failed; falling back to manual gum install."
    elif command_exists pacman; then
        plain_info "Installing gum with pacman..."
        if "${sudo_cmd[@]}" pacman -S --noconfirm gum; then
            return 0
        fi
        plain_warn "pacman install failed; falling back to manual gum install."
    elif command_exists zypper; then
        plain_info "Installing gum with zypper..."
        if "${sudo_cmd[@]}" zypper --non-interactive install gum; then
            return 0
        fi
        plain_warn "zypper install failed; falling back to manual gum install."
    elif command_exists apk; then
        plain_info "Installing gum with apk..."
        if "${sudo_cmd[@]}" apk add --no-cache gum; then
            return 0
        fi
        plain_warn "apk install failed; falling back to manual gum install."
    fi

    return 1
}

run_spinner() {
    local title="$1"
    shift
    gum spin --spinner dot --title "${title}" -- "$@"
}

spin_check() {
    local label="$1"
    local check_cmd="$2"

    if run_spinner "${label}" bash -c "${check_cmd}"; then
        log_info "${label}: ok"
        return 0
    fi

    log_warn "${label}: missing"
    return 1
}

run_with_progress() {
    local title="$1"
    shift

    set +e
    {
        "$@" &
        cmd_pid=$!
        progress=0
        while kill -0 "${cmd_pid}" 2>/dev/null; do
            if (( progress < 95 )); then
                progress=$((progress + 3))
                echo "${progress}"
            fi
            sleep 0.2
        done
        wait "${cmd_pid}"
        cmd_status=$?
        echo 100
        exit "${cmd_status}"
    } | gum progress --title "${title}"

    local status=${PIPESTATUS[0]}
    set -e
    return "${status}"
}

run_download_with_progress() {
    local title="$1"
    shift

    run_spinner "Preparing ${title}" sleep 0.3
    run_with_progress "${title}" "$@"
}

# Simple animation for narrow terminals or fallback
play_car_animation_simple() {
    local car="🚗"
    local parked="🚘"
    # Car drives right to left (matches emoji direction)
    local simple_frames=("      ${car}" "     ${car} " "    ${car}  " "   ${car}   " "  ${car}    " " ${car}     " "${car}      ")
    local delay=0.08

    if [[ ! -t 1 ]]; then
        echo "${parked} AutoMobile"
        return 0
    fi

    tput civis 2>/dev/null || true

    for frame in "${simple_frames[@]}"; do
        printf "\r  %s" "${frame}"
        sleep "${delay}"
    done

    printf "\r  %s AutoMobile          \n" "${parked}"
    tput cnorm 2>/dev/null || true
}

# Full car animation with dust trail
play_car_animation() {
    local car="🚗"
    local parked="🚘"
    local dust="💨"
    local trail_chars=("·" "." " " " ")
    local frame_count=50
    local delay=0.025
    local term_cols=80
    local car_width=2  # Emoji display width

    # Check terminal capabilities
    if ! command_exists tput || [[ ! -t 1 ]]; then
        echo "  ${parked} AutoMobile"
        return 0
    fi

    term_cols=$(tput cols 2>/dev/null || echo 80)

    # Calculate animation parameters
    local text="AutoMobile "
    local text_len=${#text}
    local start_pos=$((term_cols - car_width - 4))
    local end_pos=$((text_len + 2))

    if (( start_pos < 30 )); then
        # Terminal too narrow, use simple animation
        play_car_animation_simple
        return 0
    fi

    # Hide cursor
    tput civis 2>/dev/null || true

    # Animation loop - car moves right to left (matches emoji direction)
    for ((frame = 0; frame <= frame_count; frame++)); do
        # Calculate position (right to left)
        local pos=$((start_pos - (start_pos - end_pos) * frame / frame_count))

        # Build dust trail (appears to the right of car, fading)
        local trail=""
        local trail_len=6
        for ((d = 1; d <= trail_len; d++)); do
            local trail_pos=$((pos + car_width + d * 2))
            if (( trail_pos < term_cols - 2 )); then
                local char_idx=$(( (d - 1) % ${#trail_chars[@]} ))
                if (( d == 1 )); then
                    trail="${dust}${trail_chars[char_idx]}"
                else
                    trail="${trail}${trail_chars[char_idx]}"
                fi
            fi
        done

        # Clear line and draw
        printf "\r\033[2K"

        # Print leading spaces, then car, then trail
        if (( pos > 0 )); then
            printf "%*s" "${pos}" ""
        fi
        printf "%s" "${car}"
        if [[ -n "${trail}" ]]; then
            printf "%s" "${trail}"
        fi

        sleep "${delay}"
    done

    # Final frame with "AutoMobile" text and parked car
    printf "\r\033[2K"
    printf "  %s %s\n" "${text}" "${parked}"

    # Show cursor
    tput cnorm 2>/dev/null || true
}

# Main animation dispatcher
play_logo_animation() {
    local term_cols=80

    if command_exists tput && [[ -t 1 ]]; then
        term_cols=$(tput cols 2>/dev/null || echo 80)
    fi

    if (( term_cols >= 50 )); then
        play_car_animation
    else
        play_car_animation_simple
    fi
}

# ============================================================================
# MCP Client Detection and Configuration
# ============================================================================

# Add a client to the detection list
# Format: "client_name|config_path|format|scope"
add_mcp_client() {
    local name="$1"
    local path="$2"
    local format="$3"
    local scope="$4"
    MCP_CLIENT_LIST+=("${name}|${path}|${format}|${scope}")
}

# Detect all installed MCP clients
detect_mcp_clients() {
    local os
    os=$(detect_os)

    MCP_CLIENT_LIST=()

    # Claude Code - uses ~/.claude.json for global, .mcp.json for project
    if [[ -d "${HOME}/.claude" ]]; then
        add_mcp_client "Claude Code (Global)" "${HOME}/.claude.json" "json" "global"
    fi
    # Always offer project-local option if in a directory
    if [[ -d "${PROJECT_ROOT}" ]]; then
        add_mcp_client "Claude Code (Project)" "${PROJECT_ROOT}/.mcp.json" "json" "local"
    fi

    # Claude Desktop - platform-specific
    local claude_desktop_config=""
    if [[ "${os}" == "macos" ]]; then
        claude_desktop_config="${HOME}/Library/Application Support/Claude/claude_desktop_config.json"
        if [[ -d "${HOME}/Library/Application Support/Claude" ]] || [[ -f "${claude_desktop_config}" ]]; then
            add_mcp_client "Claude Desktop" "${claude_desktop_config}" "json" "global"
        fi
    elif [[ "${os}" == "linux" ]]; then
        claude_desktop_config="${HOME}/.config/Claude/claude_desktop_config.json"
        if [[ -d "${HOME}/.config/Claude" ]] || [[ -f "${claude_desktop_config}" ]]; then
            add_mcp_client "Claude Desktop" "${claude_desktop_config}" "json" "global"
        fi
    fi

    # Cursor - ~/.cursor/mcp.json for global, .cursor/mcp.json for project
    if [[ -d "${HOME}/.cursor" ]]; then
        add_mcp_client "Cursor (Global)" "${HOME}/.cursor/mcp.json" "json" "global"
    fi
    if [[ -d "${PROJECT_ROOT}" ]]; then
        add_mcp_client "Cursor (Project)" "${PROJECT_ROOT}/.cursor/mcp.json" "json" "local"
    fi

    # Windsurf (Codeium) - ~/.codeium/windsurf/mcp_config.json
    if [[ -d "${HOME}/.codeium/windsurf" ]] || [[ -d "${HOME}/.codeium" ]]; then
        add_mcp_client "Windsurf" "${HOME}/.codeium/windsurf/mcp_config.json" "json" "global"
    fi

    # VS Code - check for VS Code installation
    local vscode_installed=false
    if command_exists code; then
        vscode_installed=true
    elif [[ "${os}" == "macos" && -d "/Applications/Visual Studio Code.app" ]]; then
        vscode_installed=true
    elif [[ "${os}" == "linux" && -d "${HOME}/.vscode" ]]; then
        vscode_installed=true
    fi

    if [[ "${vscode_installed}" == "true" ]]; then
        if [[ -d "${PROJECT_ROOT}" ]]; then
            add_mcp_client "VS Code (Project)" "${PROJECT_ROOT}/.vscode/mcp.json" "json" "local"
        fi
    fi

    # Codex (OpenAI) - ~/.codex/config.toml (TOML format!)
    if [[ -d "${HOME}/.codex" ]]; then
        add_mcp_client "Codex" "${HOME}/.codex/config.toml" "toml" "global"
    fi

    # Firebender - ~/.firebender/firebender.json for global, firebender.json for project
    if [[ -d "${HOME}/.firebender" ]]; then
        add_mcp_client "Firebender (Global)" "${HOME}/.firebender/firebender.json" "json" "global"
    fi
    if [[ -d "${PROJECT_ROOT}" ]]; then
        add_mcp_client "Firebender (Project)" "${PROJECT_ROOT}/firebender.json" "json" "local"
    fi

    # Goose - ~/.config/goose/config.yaml (YAML format!)
    if [[ -d "${HOME}/.config/goose" ]]; then
        add_mcp_client "Goose" "${HOME}/.config/goose/config.yaml" "yaml" "global"
    fi
}

# Get list of detected client names for display
get_detected_client_names() {
    for entry in "${MCP_CLIENT_LIST[@]}"; do
        echo "${entry}" | cut -d'|' -f1
    done | sort
}

# Find client entry by name
find_client_entry() {
    local name="$1"
    for entry in "${MCP_CLIENT_LIST[@]}"; do
        local entry_name
        entry_name=$(echo "${entry}" | cut -d'|' -f1)
        if [[ "${entry_name}" == "${name}" ]]; then
            echo "${entry}"
            return 0
        fi
    done
    return 1
}

# Get config path for a client
get_client_config_path() {
    local client="$1"
    local entry
    entry=$(find_client_entry "${client}")
    if [[ -n "${entry}" ]]; then
        echo "${entry}" | cut -d'|' -f2
    fi
}

# Get config format for a client (json or yaml)
get_client_config_format() {
    local client="$1"
    local entry
    entry=$(find_client_entry "${client}")
    if [[ -n "${entry}" ]]; then
        echo "${entry}" | cut -d'|' -f3
    fi
}

# Get config scope for a client (global or local)
get_client_config_scope() {
    local client="$1"
    local entry
    entry=$(find_client_entry "${client}")
    if [[ -n "${entry}" ]]; then
        echo "${entry}" | cut -d'|' -f4
    fi
}

# Interactive MCP client selection
select_mcp_clients() {
    detect_mcp_clients

    local available_clients
    available_clients=$(get_detected_client_names)

    if [[ -z "${available_clients}" ]]; then
        log_warn "No MCP clients detected. Manual configuration may be required."
        return 1
    fi

    gum style --bold "Detected MCP Clients:"
    echo ""

    # Show what's detected with their config paths
    while IFS= read -r client; do
        local path
        path=$(get_client_config_path "${client}")
        local scope
        scope=$(get_client_config_scope "${client}")
        local exists_marker=""
        if [[ -f "${path}" ]]; then
            exists_marker=" (config exists)"
        fi
        gum style --faint "  ${client}: ${path}${exists_marker}"
    done <<< "${available_clients}"

    echo ""
    gum style --italic --faint "Use arrow keys to navigate, space to select/deselect, enter to confirm"
    echo ""

    # Multi-select with gum choose
    local selected
    selected=$(echo "${available_clients}" | gum choose --no-limit --header "Select clients to configure:")

    if [[ -z "${selected}" ]]; then
        log_info "No clients selected. Skipping MCP configuration."
        return 1
    fi

    # Store selected clients
    SELECTED_MCP_CLIENTS=()
    while IFS= read -r client; do
        if [[ -n "${client}" ]]; then
            SELECTED_MCP_CLIENTS+=("${client}")
        fi
    done <<< "${selected}"

    if [[ ${#SELECTED_MCP_CLIENTS[@]} -eq 0 ]]; then
        log_info "No clients selected. Skipping MCP configuration."
        return 1
    fi

    return 0
}

# ============================================================================
# JSON/YAML Configuration Management
# ============================================================================

# Validate JSON file
validate_json() {
    local file="$1"

    if [[ ! -f "${file}" ]]; then
        return 1
    fi

    if command_exists python3; then
        python3 -c "import json; json.load(open('${file}'))" 2>/dev/null
        return $?
    elif command_exists jq; then
        jq empty "${file}" 2>/dev/null
        return $?
    fi

    return 1
}

# Read existing mcpServers from a JSON config or return empty object
get_existing_mcp_servers() {
    local config_file="$1"

    if [[ ! -f "${config_file}" ]]; then
        echo "{}"
        return 0
    fi

    if ! validate_json "${config_file}"; then
        echo "{}"
        return 1
    fi

    if command_exists python3; then
        python3 -c '
import json, sys
try:
    with open(sys.argv[1]) as f:
        data = json.load(f)
    print(json.dumps(data.get("mcpServers", {})))
except Exception:
    print("{}")
' "${config_file}"
    elif command_exists jq; then
        jq -r '.mcpServers // {}' "${config_file}" 2>/dev/null || echo "{}"
    else
        echo "{}"
    fi
}

# Create backup of config file
backup_config() {
    local config_file="$1"

    if [[ ! -f "${config_file}" ]]; then
        return 0
    fi

    if [[ -z "${BACKUP_TIMESTAMP}" ]]; then
        BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    fi

    execute "Create backup directory" mkdir -p "${BACKUP_DIR}"

    local backup_name
    backup_name=$(basename "${config_file}")
    local backup_path="${BACKUP_DIR}/${backup_name}.${BACKUP_TIMESTAMP}"

    if [[ "${DRY_RUN}" == "true" ]]; then
        DRY_RUN_LOG+=("[DRY-RUN] Backup ${config_file} to ${backup_path}")
        log_info "[DRY-RUN] Would backup ${config_file} to ${backup_path}"
    else
        cp "${config_file}" "${backup_path}"
        log_info "Backed up to ${backup_path}"
    fi
}

# Merge auto-mobile config into existing JSON config
merge_mcp_config() {
    local config_file="$1"
    local auto_mobile_config="$2"  # JSON string for auto-mobile server

    # Handle case where file doesn't exist
    if [[ ! -f "${config_file}" ]]; then
        echo "{\"mcpServers\":{\"auto-mobile\":${auto_mobile_config}}}"
        return 0
    fi

    # Handle invalid JSON
    if ! validate_json "${config_file}"; then
        log_warn "Invalid JSON in ${config_file}, will create fresh config"
        echo "{\"mcpServers\":{\"auto-mobile\":${auto_mobile_config}}}"
        return 0
    fi

    if command_exists python3; then
        python3 -c '
import json, sys

config_file = sys.argv[1]
new_auto_mobile = json.loads(sys.argv[2])

try:
    with open(config_file) as f:
        existing = json.load(f)
except Exception:
    existing = {}

# Ensure mcpServers exists
if "mcpServers" not in existing:
    existing["mcpServers"] = {}

# Check if auto-mobile already exists
if "auto-mobile" in existing["mcpServers"]:
    print("WARNING:auto-mobile already configured, will be updated", file=sys.stderr)

# Merge (overwrites existing auto-mobile)
existing["mcpServers"]["auto-mobile"] = new_auto_mobile

print(json.dumps(existing, indent=2))
' "${config_file}" "${auto_mobile_config}"
    elif command_exists jq; then
        jq --argjson new "${auto_mobile_config}" '.mcpServers["auto-mobile"] = $new' "${config_file}"
    else
        log_error "Neither python3 nor jq available for JSON manipulation"
        return 1
    fi
}

# Merge auto-mobile config into existing TOML config (for Codex)
merge_toml_config() {
    local config_file="$1"
    local auto_mobile_toml="$2"  # TOML string for auto-mobile server

    # Handle case where file doesn't exist
    if [[ ! -f "${config_file}" ]]; then
        echo "${auto_mobile_toml}"
        return 0
    fi

    if command_exists python3; then
        python3 -c '
import sys

config_file = sys.argv[1]
new_toml = sys.argv[2]

try:
    with open(config_file) as f:
        existing = f.read()
except Exception:
    existing = ""

# Check if auto-mobile already configured
if "[mcp_servers.auto-mobile]" in existing:
    print("WARNING:auto-mobile already configured in TOML, will be updated", file=sys.stderr)
    # Remove existing auto-mobile section (lines from [mcp_servers.auto-mobile] until next section or EOF)
    lines = existing.split("\n")
    result = []
    skip = False
    for line in lines:
        stripped = line.strip()
        # Start skipping when we hit the exact auto-mobile section header
        if stripped == "[mcp_servers.auto-mobile]":
            skip = True
            continue
        # Continue skipping auto-mobile subsections (e.g. [mcp_servers.auto-mobile.env])
        if skip and stripped.startswith("[mcp_servers.auto-mobile."):
            continue
        # Stop skipping when we hit any other section header
        # This correctly preserves [mcp_servers.auto-mobile-dev] etc.
        if skip and stripped.startswith("["):
            skip = False
        if not skip:
            result.append(line)
    existing = "\n".join(result).strip()

# Append new config
if existing:
    print(existing + "\n\n" + new_toml)
else:
    print(new_toml)
' "${config_file}" "${auto_mobile_toml}"
    else
        log_error "python3 required for TOML manipulation"
        return 1
    fi
}

# Show diff between old and new config
show_config_diff() {
    local old_content="$1"
    local new_content="$2"
    local config_path="$3"

    if [[ -z "${old_content}" ]] || [[ "${old_content}" == "{}" ]]; then
        gum style --bold "New configuration for ${config_path}:"
        echo "${new_content}" | gum format --type code
        return 0
    fi

    if command_exists diff; then
        local temp_old temp_new
        temp_old=$(mktemp)
        temp_new=$(mktemp)

        echo "${old_content}" > "${temp_old}"
        echo "${new_content}" > "${temp_new}"

        local diff_output
        diff_output=$(diff -u "${temp_old}" "${temp_new}" 2>/dev/null || true)

        rm -f "${temp_old}" "${temp_new}"

        if [[ -n "${diff_output}" ]]; then
            gum style --bold "Configuration changes for ${config_path}:"
            echo "${diff_output}" | head -50 | gum format --type code
        else
            gum style --faint "No changes needed for ${config_path}"
        fi
    else
        gum style --bold "New configuration:"
        echo "${new_content}" | gum format --type code
    fi
}

# Generate auto-mobile MCP server config based on preset
generate_auto_mobile_config() {
    local preset="${1:-minimal}"
    local android_home="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"

    case "${preset}" in
        minimal)
            cat << 'EOF'
{"command":"npx","args":["-y","@kaeawc/auto-mobile@latest"]}
EOF
            ;;
        development)
            if [[ -n "${android_home}" ]]; then
                cat << EOF
{"command":"npx","args":["-y","@kaeawc/auto-mobile@latest","--debug","--debug-perf"],"env":{"ANDROID_HOME":"${android_home}"}}
EOF
            else
                cat << 'EOF'
{"command":"npx","args":["-y","@kaeawc/auto-mobile@latest","--debug","--debug-perf"]}
EOF
            fi
            ;;
        ci)
            cat << 'EOF'
{"command":"npx","args":["-y","@kaeawc/auto-mobile@latest","--transport","sse","--port","9000"]}
EOF
            ;;
        *)
            # Default to minimal
            cat << 'EOF'
{"command":"npx","args":["-y","@kaeawc/auto-mobile@latest"]}
EOF
            ;;
    esac
}

# Generate auto-mobile MCP server config in TOML format (for Codex)
generate_auto_mobile_config_toml() {
    local preset="${1:-minimal}"
    local android_home="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"

    case "${preset}" in
        minimal)
            cat << 'EOF'
[mcp_servers.auto-mobile]
command = "npx"
args = ["-y", "@kaeawc/auto-mobile@latest"]
EOF
            ;;
        development)
            if [[ -n "${android_home}" ]]; then
                cat << EOF
[mcp_servers.auto-mobile]
command = "npx"
args = ["-y", "@kaeawc/auto-mobile@latest", "--debug", "--debug-perf"]

[mcp_servers.auto-mobile.env]
ANDROID_HOME = "${android_home}"
EOF
            else
                cat << 'EOF'
[mcp_servers.auto-mobile]
command = "npx"
args = ["-y", "@kaeawc/auto-mobile@latest", "--debug", "--debug-perf"]
EOF
            fi
            ;;
        ci)
            cat << 'EOF'
[mcp_servers.auto-mobile]
command = "npx"
args = ["-y", "@kaeawc/auto-mobile@latest", "--transport", "sse", "--port", "9000"]
EOF
            ;;
        *)
            # Default to minimal
            cat << 'EOF'
[mcp_servers.auto-mobile]
command = "npx"
args = ["-y", "@kaeawc/auto-mobile@latest"]
EOF
            ;;
    esac
}

# Update a single MCP client's configuration
update_mcp_client_config() {
    local client_name="$1"
    local config_path="$2"
    local auto_mobile_config="$3"
    local format="${4:-json}"

    log_info "Configuring ${client_name}..."

    # Read existing config
    local existing_content=""
    if [[ -f "${config_path}" ]]; then
        existing_content=$(cat "${config_path}" 2>/dev/null || echo "")
    fi

    # Generate merged config based on format
    local new_content
    if [[ "${format}" == "toml" ]]; then
        if ! new_content=$(merge_toml_config "${config_path}" "${auto_mobile_config}"); then
            log_error "Failed to generate TOML config for ${client_name}"
            return 1
        fi
    else
        if ! new_content=$(merge_mcp_config "${config_path}" "${auto_mobile_config}"); then
            log_error "Failed to generate config for ${client_name}"
            return 1
        fi
    fi

    # Show diff
    show_config_diff "${existing_content}" "${new_content}" "${config_path}"
    echo ""

    # In non-interactive mode, just apply
    if [[ "${NON_INTERACTIVE}" == "true" ]]; then
        backup_config "${config_path}"
        write_file "${config_path}" "${new_content}" "Configure ${client_name}"
        log_info "${client_name} configured successfully"
        return 0
    fi

    # Confirm with user
    if [[ -n "${existing_content}" ]]; then
        if ! gum confirm "Apply changes to ${config_path}?"; then
            log_info "Skipping ${client_name} configuration"
            return 0
        fi
    else
        if ! gum confirm "Create ${config_path}?"; then
            log_info "Skipping ${client_name} configuration"
            return 0
        fi
    fi

    # Backup and write
    backup_config "${config_path}"
    write_file "${config_path}" "${new_content}" "Configure ${client_name}"

    log_info "${client_name} configured successfully"
}

# Configure all selected MCP clients
configure_selected_mcp_clients() {
    if [[ ${#SELECTED_MCP_CLIENTS[@]} -eq 0 ]]; then
        log_info "No MCP clients selected for configuration"
        return 0
    fi

    # Determine which preset config to use
    local config_preset="${PRESET:-minimal}"
    if [[ -z "${PRESET}" ]] && [[ "${NON_INTERACTIVE}" != "true" ]]; then
        # Ask user which preset to use for MCP config
        local preset_choice
        preset_choice=$(gum choose \
            "Minimal (basic setup)" \
            "Development (debug flags enabled)" \
            "CI (SSE transport, port 9000)" \
            --header "Select configuration preset for MCP servers:")

        case "${preset_choice}" in
            "Minimal"*)
                config_preset="minimal"
                ;;
            "Development"*)
                config_preset="development"
                ;;
            "CI"*)
                config_preset="ci"
                ;;
        esac
    fi

    local auto_mobile_config_json
    auto_mobile_config_json=$(generate_auto_mobile_config "${config_preset}")
    local auto_mobile_config_toml
    auto_mobile_config_toml=$(generate_auto_mobile_config_toml "${config_preset}")

    gum style --bold "Using ${config_preset} preset configuration"
    echo ""

    for client in "${SELECTED_MCP_CLIENTS[@]}"; do
        local config_path
        config_path=$(get_client_config_path "${client}")
        local format
        format=$(get_client_config_format "${client}")

        if [[ "${format}" == "yaml" ]]; then
            log_warn "YAML configuration for ${client} is not yet supported. Skipping."
            log_info "Manual configuration required for: ${config_path}"
            continue
        fi

        if [[ "${format}" == "toml" ]]; then
            update_mcp_client_config "${client}" "${config_path}" "${auto_mobile_config_toml}" "toml"
        else
            update_mcp_client_config "${client}" "${config_path}" "${auto_mobile_config_json}" "json"
        fi
        echo ""
    done
}

resolve_ide_plugin_url() {
    local url=""

    if command_exists curl; then
        url=$(curl -fsSL "https://api.github.com/repos/kaeawc/auto-mobile/releases/latest" 2>/dev/null \
            | sed -nE 's/.*"browser_download_url": "([^"]*auto-mobile-ide-plugin[^"]*\.zip)".*/\1/p' \
            | head -n 1 || true)
    elif command_exists wget; then
        url=$(wget -qO- "https://api.github.com/repos/kaeawc/auto-mobile/releases/latest" 2>/dev/null \
            | sed -nE 's/.*"browser_download_url": "([^"]*auto-mobile-ide-plugin[^"]*\.zip)".*/\1/p' \
            | head -n 1 || true)
    fi

    echo "${url}"
}

detect_ide_plugins_dir() {
    if [[ -n "${ANDROID_STUDIO_PLUGINS_DIR:-}" ]]; then
        echo "${ANDROID_STUDIO_PLUGINS_DIR}"
        return 0
    fi
    if [[ -n "${IDEA_PLUGINS_DIR:-}" ]]; then
        echo "${IDEA_PLUGINS_DIR}"
        return 0
    fi

    local os
    os=$(detect_os)

    if [[ "${os}" == "macos" ]]; then
        local jetbrains_dir="${HOME}/Library/Application Support/JetBrains"
        local google_dir="${HOME}/Library/Application Support/Google"
        local candidate=""

        if [[ -d "${jetbrains_dir}" ]]; then
            candidate=$(find "${jetbrains_dir}" -maxdepth 1 -type d \( -name "IntelliJIdea*" -o -name "AndroidStudio*" \) 2>/dev/null | sort -r | head -n 1 || true)
            if [[ -n "${candidate}" ]]; then
                echo "${candidate}/plugins"
                return 0
            fi
        fi

        if [[ -d "${google_dir}" ]]; then
            candidate=$(find "${google_dir}" -maxdepth 1 -type d -name "AndroidStudio*" 2>/dev/null | sort -r | head -n 1 || true)
            if [[ -n "${candidate}" ]]; then
                echo "${candidate}/plugins"
                return 0
            fi
        fi
    fi

    if [[ "${os}" == "linux" ]]; then
        local jetbrains_dir="${HOME}/.local/share/JetBrains"
        local google_dir="${HOME}/.local/share/Google"
        local candidate=""

        if [[ -d "${jetbrains_dir}" ]]; then
            candidate=$(find "${jetbrains_dir}" -maxdepth 1 -type d \( -name "IntelliJIdea*" -o -name "AndroidStudio*" \) 2>/dev/null | sort -r | head -n 1 || true)
            if [[ -n "${candidate}" ]]; then
                echo "${candidate}/plugins"
                return 0
            fi
        fi

        if [[ -d "${google_dir}" ]]; then
            candidate=$(find "${google_dir}" -maxdepth 1 -type d -name "AndroidStudio*" 2>/dev/null | sort -r | head -n 1 || true)
            if [[ -n "${candidate}" ]]; then
                echo "${candidate}/plugins"
                return 0
            fi
        fi
    fi

    return 1
}

resolve_auto_mobile_command() {
    if command_exists auto-mobile; then
        AUTO_MOBILE_CMD=("auto-mobile")
        return 0
    fi

    if command_exists bunx; then
        AUTO_MOBILE_CMD=("bunx" "-y" "@kaeawc/auto-mobile@latest")
        return 0
    fi

    if command_exists npx; then
        AUTO_MOBILE_CMD=("npx" "-y" "@kaeawc/auto-mobile@latest")
        return 0
    fi

    return 1
}

ensure_auto_mobile_command() {
    if resolve_auto_mobile_command; then
        return 0
    fi

    log_error "AutoMobile CLI not available. Install it or ensure bunx/npx is on PATH."
    return 1
}

run_auto_mobile_cli() {
    if ! ensure_auto_mobile_command; then
        return 1
    fi

    "${AUTO_MOBILE_CMD[@]}" --cli "$@"
}

extract_device_ids() {
    local raw="$1"

    if command_exists python3; then
        python3 -c 'import json,sys
raw=sys.stdin.read()
try:
    data=json.loads(raw)
except json.JSONDecodeError:
    sys.exit(1)
def unwrap(payload):
    if isinstance(payload, dict):
        content=payload.get("content")
        if isinstance(content, list) and content:
            item=content[0]
            if isinstance(item, dict) and item.get("type")=="text":
                text=item.get("text","")
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    return {}
    return payload
data=unwrap(data)
devices=data.get("devices", []) if isinstance(data, dict) else []
for device in devices:
    if isinstance(device, dict):
        device_id=device.get("deviceId")
        if device_id:
            print(device_id)' <<<"${raw}"
        return $?
    fi

    if command_exists jq; then
        echo "${raw}" | jq -r '.content[0].text | fromjson | .devices[]? | .deviceId' 2>/dev/null
        return 0
    fi

    return 1
}

extract_device_images() {
    local raw="$1"

    if command_exists python3; then
        python3 -c 'import json,sys
raw=sys.stdin.read()
try:
    data=json.loads(raw)
except json.JSONDecodeError:
    sys.exit(1)
def unwrap(payload):
    if isinstance(payload, dict):
        content=payload.get("content")
        if isinstance(content, list) and content:
            item=content[0]
            if isinstance(item, dict) and item.get("type")=="text":
                text=item.get("text","")
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    return {}
    return payload
data=unwrap(data)
images=data.get("images", []) if isinstance(data, dict) else []
for image in images:
    if isinstance(image, dict):
        name=image.get("name") or image.get("deviceId")
        if name:
            print(name)
    elif isinstance(image, str):
        print(image)' <<<"${raw}"
        return $?
    fi

    if command_exists jq; then
        echo "${raw}" | jq -r '.content[0].text | fromjson | .images[]? | if type == "object" then (.name // .deviceId // empty) else . end' 2>/dev/null
        return 0
    fi

    return 1
}

ensure_mcp_daemon() {
    if [[ "${DAEMON_STARTED}" == "true" ]]; then
        return 0
    fi

    if ! start_mcp_daemon; then
        return 1
    fi

    DAEMON_STARTED=true
}

install_auto_mobile_cli() {
    if command_exists auto-mobile; then
        log_info "AutoMobile CLI already installed."
        return 0
    fi

    if command_exists bun; then
        if run_with_progress "Installing AutoMobile CLI (bun)" \
            bun add -g @kaeawc/auto-mobile@latest; then
            return 0
        fi
        if run_with_progress "Installing AutoMobile CLI (bun install)" \
            bun install -g @kaeawc/auto-mobile@latest; then
            return 0
        fi
        log_error "AutoMobile CLI installation failed with Bun."
        return 1
    fi

    if command_exists npm; then
        if ! run_with_progress "Installing AutoMobile CLI (npm)" \
            npm install -g @kaeawc/auto-mobile@latest; then
            log_error "AutoMobile CLI installation failed."
            return 1
        fi
        return 0
    fi

    log_error "Bun or npm is required to install AutoMobile CLI."
    return 1
}

install_ide_plugin() {
    if [[ -z "${IDE_PLUGIN_DIR}" ]]; then
        log_error "IDE plugin directory not set. Skipping IDE plugin install."
        return 1
    fi

    if [[ ! -d "${IDE_PLUGIN_DIR}" ]]; then
        log_warn "IDE plugins directory not found: ${IDE_PLUGIN_DIR}. Creating it."
        mkdir -p "${IDE_PLUGIN_DIR}"
    fi

    if ! command_exists unzip; then
        log_error "unzip is required to install the IDE plugin."
        return 1
    fi

    local plugin_zip=""
    local temp_dir=""
    local build_log_path=""

    if [[ "${IDE_PLUGIN_METHOD}" == "source" ]]; then
        if [[ "${IS_REPO}" != "true" ]]; then
            log_error "Plugin build from source requires a local repository checkout."
            return 1
        fi

        build_log_path=$(mktemp)
        if ! run_with_progress "Building IDE plugin" \
            bash -c "cd \"${PROJECT_ROOT}/android/ide-plugin\" && ./gradlew buildPlugin >\"${build_log_path}\" 2>&1"; then
            log_error "IDE plugin build failed. Logs: ${build_log_path}"
            return 1
        fi

        plugin_zip=$(find "${PROJECT_ROOT}/android/ide-plugin/build/distributions" -maxdepth 1 -name '*.zip' -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -n 1 || true)
        if [[ -z "${plugin_zip}" ]]; then
            log_error "No IDE plugin zip found after build."
            return 1
        fi
    else
        if [[ -z "${IDE_PLUGIN_ZIP_URL}" ]]; then
            log_error "IDE plugin download URL not provided."
            return 1
        fi

        temp_dir=$(mktemp -d)
        plugin_zip="${temp_dir}/auto-mobile-ide-plugin.zip"

        if command_exists curl; then
            if ! run_download_with_progress "Downloading IDE plugin" \
                curl -fsSL "${IDE_PLUGIN_ZIP_URL}" -o "${plugin_zip}"; then
                log_error "Failed to download IDE plugin."
                rm -rf "${temp_dir}"
                return 1
            fi
        elif command_exists wget; then
            if ! run_download_with_progress "Downloading IDE plugin" \
                wget -qO "${plugin_zip}" "${IDE_PLUGIN_ZIP_URL}"; then
                log_error "Failed to download IDE plugin."
                rm -rf "${temp_dir}"
                return 1
            fi
        else
            log_error "curl or wget is required to download the IDE plugin."
            rm -rf "${temp_dir}"
            return 1
        fi
    fi

    local plugin_name="auto-mobile-ide-plugin"
    rm -rf "${IDE_PLUGIN_DIR:?}/${plugin_name:?}"
    if ! run_spinner "Installing IDE plugin" unzip -q "${plugin_zip}" -d "${IDE_PLUGIN_DIR}"; then
        log_error "Failed to unzip IDE plugin."
        return 1
    fi

    if [[ -n "${temp_dir}" ]]; then
        rm -rf "${temp_dir}"
    fi
    if [[ -n "${build_log_path}" ]]; then
        rm -f "${build_log_path}"
    fi

    log_info "Installed IDE plugin to ${IDE_PLUGIN_DIR}/${plugin_name}"
    log_info "Restart your IDE to load the AutoMobile plugin."
}

start_mcp_daemon() {
    if ! resolve_auto_mobile_command; then
        log_error "AutoMobile CLI not available. Install it or ensure bunx/npx is on PATH."
        return 1
    fi

    if ! run_spinner "Starting MCP daemon" "${AUTO_MOBILE_CMD[@]}" --daemon start; then
        log_error "Failed to start MCP daemon."
        return 1
    fi

    if ! run_spinner "Checking MCP daemon health" "${AUTO_MOBILE_CMD[@]}" --daemon health; then
        log_error "Daemon health check failed."
        return 1
    fi

    log_info "MCP daemon is running and healthy."
}

handle_bun_setup() {
    if [[ "${BUN_INSTALLED}" == "true" ]]; then
        return 0
    fi

    if [[ "${INSTALL_BUN}" == "true" ]]; then
        install_bun
        if command_exists bun; then
            BUN_INSTALLED=true
        fi
        return 0
    fi

    log_warn "Skipping Bun installation. Some workflows may not work without it."
    return 1
}

check_android_sdk() {
    if [[ "${ANDROID_SDK_DETECTED}" == "true" ]]; then
        return 0
    fi
    log_warn "Android SDK not detected. Install Android Studio or SDK manually for device support."
    log_warn "See https://developer.android.com/studio for installation instructions."
    return 1
}

ios_log_heading() {
    gum style --bold "iOS Setup"
    echo ""
}

ios_check_xcode() {
    if [[ "$(detect_os)" != "macos" ]]; then
        log_warn "iOS setup requires macOS."
        return 1
    fi

    if spin_check "Checking Xcode" "command -v xcodebuild >/dev/null 2>&1"; then
        local xcode_version
        xcode_version=$(xcodebuild -version 2>/dev/null | head -1 || true)
        if [[ -n "${xcode_version}" ]]; then
            log_info "Xcode detected: ${xcode_version}"
        else
            log_info "Xcode detected."
        fi
        return 0
    fi

    log_warn "Xcode not detected. Install Xcode from the App Store."
    return 1
}

ios_install_command_line_tools() {
    if [[ "$(detect_os)" != "macos" ]]; then
        return 1
    fi

    if [[ "${NON_INTERACTIVE}" == "true" ]]; then
        log_warn "Command Line Tools missing. Run: xcode-select --install"
        return 1
    fi

    if gum confirm "Command Line Tools missing. Install now?"; then
        if execute "Install Command Line Tools" xcode-select --install; then
            log_info "Command Line Tools installer started."
            log_info "Complete the installer prompt, then re-run this setup."
            return 0
        fi
        log_warn "Command Line Tools install failed. Run: xcode-select --install"
        return 1
    fi

    log_warn "Skipping Command Line Tools install. Run: xcode-select --install"
    return 1
}

ios_check_command_line_tools() {
    if [[ "$(detect_os)" != "macos" ]]; then
        return 1
    fi

    if spin_check "Checking Command Line Tools" "xcode-select -p >/dev/null 2>&1"; then
        local developer_dir
        developer_dir=$(xcode-select -p 2>/dev/null || true)
        if [[ -n "${developer_dir}" ]]; then
            log_info "Command Line Tools path: ${developer_dir}"
        fi
        return 0
    fi

    return 1
}

ios_get_installed_runtimes() {
    local runtime_output=""
    local runtimes=""

    if runtime_output=$(xcrun simctl list runtimes -j 2>/dev/null); then
        if command_exists python3; then
            runtimes=$(python3 -c '
import json, sys
data=json.loads(sys.stdin.read())
runtimes=[]
for runtime in data.get("runtimes", []):
    name=runtime.get("name", "")
    if name.startswith("iOS") and runtime.get("isAvailable", True):
        runtimes.append(name)
print("\n".join(runtimes))
' <<<"${runtime_output}")
        else
            runtime_output=""
        fi
    fi

    if [[ -z "${runtime_output}" ]] && runtime_output=$(xcrun simctl list runtimes 2>/dev/null); then
        runtimes=$(printf '%s\n' "${runtime_output}" | grep -E "^iOS" | sed 's/ - .*//' | sed 's/[[:space:]]*$//')
    fi

    if [[ -z "${runtimes}" ]]; then
        return 1
    fi

    IOS_RUNTIME_NAMES=()
    while IFS= read -r runtime; do
        if [[ -n "${runtime}" ]]; then
            IOS_RUNTIME_NAMES+=("${runtime}")
        fi
    done <<< "${runtimes}"

    return 0
}

ios_show_available_runtimes() {
    if [[ "$(detect_os)" != "macos" ]]; then
        return 1
    fi

    if command_exists xcodebuild; then
        if xcodebuild -downloadPlatform iOS -list 2>/dev/null; then
            return 0
        fi
    fi

    log_warn "Unable to list downloadable runtimes from xcodebuild."
    log_info "Open Xcode > Settings > Platforms to view available runtimes."
    return 1
}

ios_download_runtime() {
    local runtime_version="${1:-}"
    if [[ -n "${runtime_version}" ]]; then
        execute_spinner "Downloading iOS runtime ${runtime_version}" \
            xcodebuild -downloadPlatform iOS -buildVersion "${runtime_version}"
    else
        execute_spinner "Downloading latest iOS runtime" \
            xcodebuild -downloadPlatform iOS
    fi
}

ios_prompt_download_runtimes() {
    if [[ "${NON_INTERACTIVE}" == "true" ]]; then
        log_warn "No iOS runtimes installed. Run: xcodebuild -downloadPlatform iOS"
        log_info "Or install via Xcode > Settings > Platforms."
        return 1
    fi

    gum style --faint "Missing iOS simulator runtimes."
    echo ""

    local choice
    choice=$(gum choose \
        "Yes, install latest iOS runtime" \
        "Choose runtime version" \
        "Show available runtimes" \
        "No, skip")

    case "${choice}" in
        "Yes, install latest iOS runtime")
            ios_download_runtime
            ;;
        "Choose runtime version")
            if ios_show_available_runtimes; then
                local version
                version=$(gum input --prompt "Runtime build version (e.g. 21E213): " --value "")
                if [[ -n "${version}" ]]; then
                    ios_download_runtime "${version}"
                else
                    log_warn "No version provided. Skipping runtime install."
                fi
            else
                local version
                version=$(gum input --prompt "Runtime build version (optional): " --value "")
                if [[ -n "${version}" ]]; then
                    ios_download_runtime "${version}"
                else
                    ios_download_runtime
                fi
            fi
            ;;
        "Show available runtimes")
            ios_show_available_runtimes
            ios_prompt_download_runtimes
            ;;
        *)
            log_warn "Skipping runtime installation."
            ;;
    esac
}

ios_check_simulator_runtimes() {
    if [[ "$(detect_os)" != "macos" ]]; then
        return 1
    fi

    if ! command_exists xcrun; then
        log_warn "xcrun not available. Install Xcode Command Line Tools."
        return 1
    fi

    if ! ios_get_installed_runtimes; then
        log_warn "No iOS simulator runtimes available."
        ios_prompt_download_runtimes
        return 1
    fi

    local runtime_list
    runtime_list=$(IFS=", "; printf '%s' "${IOS_RUNTIME_NAMES[*]}")
    log_info "iOS runtimes available: ${runtime_list}"
    return 0
}

ios_check_xctestservice_build() {
    if [[ "$(detect_os)" != "macos" ]]; then
        return 1
    fi

    if [[ "${IS_REPO}" != "true" ]]; then
        log_info "XCTestService build handled by AutoMobile on first use."
        return 0
    fi

    local xctest_dir="${PROJECT_ROOT}/ios/XCTestService"
    if [[ ! -d "${xctest_dir}" ]]; then
        log_warn "XCTestService project not found in repo."
        log_info "AutoMobile will install/build XCTestService when needed."
        return 1
    fi

    if run_spinner "Validating XCTestService project" bash -c "cd \"${xctest_dir}\" && xcodebuild -list -json >/dev/null 2>&1"; then
        log_info "XCTestService project detected. AutoMobile will build on demand."
        return 0
    fi

    log_warn "Unable to query XCTestService project. AutoMobile will build on demand."
    return 1
}

run_ios_setup() {
    if [[ "$(detect_os)" != "macos" ]]; then
        log_warn "iOS setup skipped (macOS required)."
        return 0
    fi

    ios_log_heading

    if ! ios_check_xcode; then
        log_warn "Skipping iOS setup because Xcode is missing."
        return 0
    fi

    if ! ios_check_command_line_tools; then
        ios_install_command_line_tools
    fi

    ios_check_simulator_runtimes
    ios_check_xctestservice_build
    return 0
}

collect_choices() {
    if [[ "${BUN_INSTALLED}" == "false" ]]; then
        if gum confirm "Bun is required for AutoMobile. Install Bun now?"; then
            INSTALL_BUN=true
        fi
    fi

    # Check if IDE plugin is available in latest release
    if [[ "${platform_choice}" == "Android" || "${platform_choice}" == "Both" ]]; then
        local ide_plugin_url
        ide_plugin_url=$(resolve_ide_plugin_url || true)
        if [[ -n "${ide_plugin_url}" ]]; then
            if gum confirm "Install AutoMobile IntelliJ/Android Studio plugin?"; then
                INSTALL_IDE_PLUGIN=true
                IDE_PLUGIN_METHOD="release"
                IDE_PLUGIN_ZIP_URL="${ide_plugin_url}"

                IDE_PLUGIN_DIR=$(detect_ide_plugins_dir || true)
                if [[ -z "${IDE_PLUGIN_DIR}" ]]; then
                    IDE_PLUGIN_DIR=$(gum input --prompt "IDE plugins directory: " --value "")
                fi
            fi
        fi
    fi

    if gum confirm "Install AutoMobile CLI (auto-mobile command) globally?"; then
        INSTALL_AUTOMOBILE_CLI=true
    fi

    if gum confirm "Start MCP daemon and verify health?"; then
        START_DAEMON=true
    fi
}

resolve_android_sdk_root() {
    if [[ -n "${ANDROID_HOME:-}" ]]; then
        echo "${ANDROID_HOME}"
        return 0
    fi
    if [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then
        echo "${ANDROID_SDK_ROOT}"
        return 0
    fi
    if [[ -n "${ANDROID_SDK_HOME:-}" ]]; then
        echo "${ANDROID_SDK_HOME}"
        return 0
    fi

    if [[ "$(detect_os)" == "macos" ]]; then
        echo "${HOME}/Library/Android/sdk"
    else
        echo "${HOME}/Android/Sdk"
    fi
}

install_bun() {
    local temp_dir
    temp_dir=$(mktemp -d)
    local installer_path="${temp_dir}/bun-install.sh"
    local log_path="${temp_dir}/bun-install.log"

    if command_exists curl; then
        if ! run_spinner "Downloading Bun installer" \
            curl -fsSL "https://bun.sh/install" -o "${installer_path}"; then
            log_error "Failed to download Bun installer."
            rm -rf "${temp_dir}"
            return 1
        fi
    elif command_exists wget; then
        if ! run_spinner "Downloading Bun installer" \
            wget -qO "${installer_path}" "https://bun.sh/install"; then
            log_error "Failed to download Bun installer."
            rm -rf "${temp_dir}"
            return 1
        fi
    else
        log_error "curl or wget is required to download Bun."
        rm -rf "${temp_dir}"
        return 1
    fi

    chmod +x "${installer_path}"

    if ! run_with_progress "Installing Bun" bash -c "bash \"${installer_path}\" >\"${log_path}\" 2>&1"; then
        log_error "Bun installation failed. Logs: ${log_path}"
        return 1
    fi

    export PATH="${HOME}/.bun/bin:${PATH}"

    if command_exists bun; then
        log_info "Bun installed: $(bun --version)"
    else
        log_warn "Bun installed but not on PATH. Restart your shell or add ${HOME}/.bun/bin to PATH."
    fi

    rm -rf "${temp_dir}"
}

# ============================================================================
# Preset System
# ============================================================================

# Apply a preset configuration
apply_preset() {
    local preset_name="$1"

    case "${preset_name}" in
        minimal)
            INSTALL_BUN=false
            INSTALL_IDE_PLUGIN=false
            INSTALL_AUTOMOBILE_CLI=true
            START_DAEMON=false
            CONFIGURE_MCP_CLIENTS=true
            ;;
        development)
            INSTALL_BUN=true
            # IDE plugin only installed if available in release
            local ide_url
            ide_url=$(resolve_ide_plugin_url || true)
            if [[ -n "${ide_url}" ]]; then
                INSTALL_IDE_PLUGIN=true
                IDE_PLUGIN_METHOD="release"
                IDE_PLUGIN_ZIP_URL="${ide_url}"
                IDE_PLUGIN_DIR=$(detect_ide_plugins_dir || true)
            else
                INSTALL_IDE_PLUGIN=false
            fi
            INSTALL_AUTOMOBILE_CLI=true
            START_DAEMON=true
            CONFIGURE_MCP_CLIENTS=true
            ;;
        *)
            log_error "Unknown preset: ${preset_name}"
            return 1
            ;;
    esac

    log_info "Applied ${preset_name} preset"
}

# Interactive preset selection
select_preset() {
    local choice
    choice=$(gum choose \
        "Minimal (CLI + MCP config only)" \
        "Development (Full setup with debug flags)" \
        "Custom (Choose components individually)" \
        --header "Select installation preset:")

    case "${choice}" in
        "Minimal"*)
            apply_preset "minimal"
            return 0
            ;;
        "Development"*)
            apply_preset "development"
            return 0
            ;;
        "Custom"*)
            # Fall through to interactive selection
            CONFIGURE_MCP_CLIENTS=true
            return 1
            ;;
    esac

    return 1
}

main() {
    # Parse command line arguments first (before gum is available)
    parse_args "$@"

    ensure_gum

    gum style --bold "AutoMobile Interactive Installer"
    play_logo_animation

    # Show dry-run indicator
    if [[ "${DRY_RUN}" == "true" ]]; then
        echo ""
        gum style --foreground 214 --bold "DRY-RUN MODE: No changes will be made"
        echo ""
    fi

    local os
    os=$(detect_os)
    if [[ "${os}" == "unknown" ]]; then
        log_error "This installer supports macOS and Linux only."
        exit 1
    fi

    log_info "Starting setup from ${PROJECT_ROOT}"

    # Handle preset mode
    if [[ -n "${PRESET}" ]]; then
        apply_preset "${PRESET}"
    elif [[ "${NON_INTERACTIVE}" == "true" ]]; then
        # Default to minimal in non-interactive mode without preset
        apply_preset "minimal"
    else
        # Interactive mode - offer preset selection
        if ! select_preset; then
            # User chose "Custom" - continue to interactive selection
            :
        fi
    fi

    # Only do interactive platform/component selection if not using a preset
    if [[ -z "${PRESET}" ]] && [[ "${NON_INTERACTIVE}" != "true" ]] && [[ "${CONFIGURE_MCP_CLIENTS}" != "true" || "${INSTALL_BUN}" != "true" ]]; then
        if [[ "${os}" != "macos" ]]; then
            log_warn "iOS setup is only available on macOS. Android setup is available."
            platform_choice=$(gum choose "Android" "Skip platform setup")
        else
            platform_choice=$(gum choose "Android" "iOS" "Both" "Skip platform setup")
        fi

        if spin_check "Checking Bun" "command -v bun >/dev/null 2>&1"; then
            BUN_INSTALLED=true
        else
            BUN_INSTALLED=false
        fi

        if [[ "${platform_choice}" == "Android" || "${platform_choice}" == "Both" ]]; then
            local adb_check="command -v adb >/dev/null 2>&1 || [[ -x \"${ANDROID_HOME:-}/platform-tools/adb\" ]] || [[ -x \"${ANDROID_SDK_ROOT:-}/platform-tools/adb\" ]] || [[ -x \"${HOME}/Library/Android/sdk/platform-tools/adb\" ]] || [[ -x \"${HOME}/Android/Sdk/platform-tools/adb\" ]]"
            if spin_check "Checking Android SDK (adb)" "${adb_check}"; then
                ANDROID_SDK_DETECTED=true
            else
                ANDROID_SDK_DETECTED=false
            fi
        fi

        collect_choices
    else
        # Check current state for preset mode
        if spin_check "Checking Bun" "command -v bun >/dev/null 2>&1"; then
            BUN_INSTALLED=true
        else
            BUN_INSTALLED=false
        fi

        local adb_check="command -v adb >/dev/null 2>&1 || [[ -x \"${ANDROID_HOME:-}/platform-tools/adb\" ]] || [[ -x \"${ANDROID_SDK_ROOT:-}/platform-tools/adb\" ]] || [[ -x \"${HOME}/Library/Android/sdk/platform-tools/adb\" ]] || [[ -x \"${HOME}/Android/Sdk/platform-tools/adb\" ]]"
        if spin_check "Checking Android SDK (adb)" "${adb_check}"; then
            ANDROID_SDK_DETECTED=true
        else
            ANDROID_SDK_DETECTED=false
        fi

        # Set platform_choice based on IDE plugin installation
        if [[ "${INSTALL_IDE_PLUGIN}" == "true" ]]; then
            platform_choice="Android"
        else
            platform_choice="Skip platform setup"
        fi
    fi

    # MCP Client Configuration (new feature!)
    if [[ "${CONFIGURE_MCP_CLIENTS}" == "true" ]]; then
        echo ""
        gum style --bold "MCP Client Configuration"
        echo ""

        if [[ "${NON_INTERACTIVE}" == "true" ]]; then
            # In non-interactive mode, auto-detect and configure Claude Code
            detect_mcp_clients
            local claude_code_entry
            claude_code_entry=$(find_client_entry "Claude Code (Global)" 2>/dev/null || echo "")
            if [[ -n "${claude_code_entry}" ]]; then
                SELECTED_MCP_CLIENTS=("Claude Code (Global)")
                configure_selected_mcp_clients
            else
                log_info "No MCP clients auto-detected in non-interactive mode"
            fi
        else
            if select_mcp_clients; then
                configure_selected_mcp_clients
            fi
        fi
    fi

    # Bun setup
    handle_bun_setup

    # Platform-specific setup
    case "${platform_choice}" in
        Android)
            check_android_sdk
            if [[ "${INSTALL_IDE_PLUGIN}" == "true" ]]; then
                install_ide_plugin
            fi
            ;;
        iOS)
            run_ios_setup
            ;;
        Both)
            check_android_sdk
            if [[ "${INSTALL_IDE_PLUGIN}" == "true" ]]; then
                install_ide_plugin
            fi
            run_ios_setup
            ;;
        *)
            log_info "Skipping platform-specific setup."
            ;;
    esac

    # CLI installation
    if [[ "${INSTALL_AUTOMOBILE_CLI}" == "true" ]]; then
        install_auto_mobile_cli
    fi

    # Daemon startup
    if [[ "${START_DAEMON}" == "true" ]]; then
        start_mcp_daemon
    fi

    # Print dry-run summary if applicable
    print_dry_run_summary

    if [[ "${DRY_RUN}" != "true" ]]; then
        log_info "Setup complete. Review docs/install/overview.md for MCP configuration examples."
    fi
}

main "$@"
