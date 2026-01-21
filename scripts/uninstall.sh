#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Handle Ctrl-C (SIGINT) - exit immediately
trap 'echo ""; echo "Uninstall cancelled."; exit 130' INT

# Handle piped execution (SCRIPT_DIR used for potential future expansion)
# shellcheck disable=SC2034
if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
    SCRIPT_DIR="$(pwd)"
fi

# Detect project root (for project-level configs)
PROJECT_ROOT="$(pwd)"

# ============================================================================
# Global State
# ============================================================================
ALL=false
DRY_RUN=false
FORCE=false
RECORD_MODE=false
CHANGES_MADE=false

# Components to uninstall (set by interactive selection or --all)
UNINSTALL_MCP_CONFIGS=false
UNINSTALL_MARKETPLACE=false
UNINSTALL_CLI=false
UNINSTALL_DAEMON=false
UNINSTALL_DATA=false

# Detected components
MCP_CONFIGS_FOUND=()
MARKETPLACE_INSTALLED=false
MARKETPLACE_NAME=""
CLI_INSTALLED=false
DAEMON_RUNNING=false
DATA_DIR_EXISTS=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
RESET='\033[0m'

# ============================================================================
# Utility Functions
# ============================================================================
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

log_info() {
    echo -e "${GREEN}INFO${RESET} $*"
}

log_warn() {
    echo -e "${YELLOW}WARN${RESET} $*"
}

log_error() {
    echo -e "${RED}ERROR${RESET} $*"
}

detect_os() {
    case "$(uname -s)" in
        Darwin*) echo "macos" ;;
        Linux*)  echo "linux" ;;
        MINGW*|MSYS*|CYGWIN*) echo "linux" ;;
        *)       echo "unknown" ;;
    esac
}

# ============================================================================
# CLI Argument Parsing
# ============================================================================
show_help() {
    cat << 'EOF'
AutoMobile Uninstaller

Usage: ./scripts/uninstall.sh [OPTIONS]

Options:
  --all               Remove all AutoMobile components (non-interactive)
  --dry-run           Show what would be removed without making changes
  --record-mode       Auto-select all and run (for demo recording)
  --force             Skip confirmation prompts
  -h, --help          Show this help message

Components that can be removed:
  - MCP configurations from AI agents (Claude Desktop, Cursor, VS Code, etc.)
  - Claude Marketplace plugin
  - AutoMobile CLI (auto-mobile command)
  - MCP daemon process
  - AutoMobile data directory (~/.automobile)

Examples:
  ./scripts/uninstall.sh              # Interactive mode
  ./scripts/uninstall.sh --all        # Remove everything
  ./scripts/uninstall.sh --all --dry-run  # Show what would be removed
  ./scripts/uninstall.sh --record-mode    # For demo recording

EOF
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --all|-a)
                ALL=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --record-mode)
                RECORD_MODE=true
                shift
                ;;
            --force|-f)
                FORCE=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# ============================================================================
# Gum Setup (reuse from interactive installer if available)
# ============================================================================
GUM_INSTALL_DIR="${HOME}/.automobile/bin"
GUM_BINARY="${GUM_INSTALL_DIR}/gum"

ensure_gum() {
    # Check if gum is available
    if command_exists gum; then
        return 0
    fi

    # Check bundled gum
    if [[ -x "${GUM_BINARY}" ]]; then
        export PATH="${GUM_INSTALL_DIR}:${PATH}"
        return 0
    fi

    # Fall back to basic prompts if gum not available
    return 1
}

# ============================================================================
# Detection Functions
# ============================================================================
detect_mcp_configs() {
    local os
    os=$(detect_os)
    MCP_CONFIGS_FOUND=()

    # Define all possible config locations
    local configs=()

    # Claude Code
    configs+=("Claude Code (Global)|${HOME}/.claude.json|json")

    # Claude Desktop
    if [[ "${os}" == "macos" ]]; then
        configs+=("Claude Desktop|${HOME}/Library/Application Support/Claude/claude_desktop_config.json|json")
    else
        configs+=("Claude Desktop|${HOME}/.config/Claude/claude_desktop_config.json|json")
    fi

    # Cursor
    configs+=("Cursor (Global)|${HOME}/.cursor/mcp.json|json")

    # Windsurf
    configs+=("Windsurf|${HOME}/.codeium/windsurf/mcp_config.json|json")

    # Codex
    configs+=("Codex|${HOME}/.codex/config.toml|toml")

    # Firebender
    configs+=("Firebender (Global)|${HOME}/.firebender/firebender.json|json")
    configs+=("Firebender (Project)|${PROJECT_ROOT}/firebender.json|json")

    # Goose
    configs+=("Goose|${HOME}/.config/goose/config.yaml|yaml")

    # Check each config for auto-mobile entries
    for entry in "${configs[@]}"; do
        local name path format
        name=$(echo "${entry}" | cut -d'|' -f1)
        path=$(echo "${entry}" | cut -d'|' -f2)
        format=$(echo "${entry}" | cut -d'|' -f3)

        if [[ -f "${path}" ]]; then
            if config_has_automobile "${path}" "${format}"; then
                MCP_CONFIGS_FOUND+=("${entry}")
            fi
        fi
    done
}

config_has_automobile() {
    local path="$1"
    local format="$2"

    # Look for actual MCP server entries, not project paths or comments
    case "${format}" in
        json)
            # Look for "auto-mobile" as a key followed by { (MCP server object)
            # This matches: "auto-mobile": { or "auto-mobile" : {
            # But not: "/path/to/auto-mobile/project": {
            grep -qE '"auto-mobile"\s*:\s*\{' "${path}" 2>/dev/null
            ;;
        toml)
            # Look for [mcp_servers.auto-mobile] section headers
            grep -qiE '^\[.*mcp.*auto-?mobile.*\]' "${path}" 2>/dev/null
            ;;
        yaml)
            # Look for auto-mobile: as a YAML key at root or under mcpServers
            grep -qE '^[[:space:]]*auto-mobile\s*:' "${path}" 2>/dev/null
            ;;
    esac
}

detect_marketplace() {
    if command_exists claude; then
        # Get list of marketplaces and find auto-mobile related ones
        local marketplace_output
        marketplace_output=$(claude plugin marketplace list 2>/dev/null || true)

        # Extract marketplace name (line starting with ❯ followed by the name)
        local name
        name=$(echo "${marketplace_output}" | grep -i 'auto-mobile' 2>/dev/null | grep '❯' 2>/dev/null | awk '{print $2}' | head -1 || true)

        if [[ -n "${name}" ]]; then
            MARKETPLACE_INSTALLED=true
            MARKETPLACE_NAME="${name}"
            return 0
        fi
    fi
    MARKETPLACE_INSTALLED=false
    MARKETPLACE_NAME=""
    return 0
}

detect_cli() {
    if command_exists auto-mobile; then
        CLI_INSTALLED=true
    else
        CLI_INSTALLED=false
    fi
    return 0
}

detect_daemon() {
    local socket_path
    socket_path="/tmp/auto-mobile-daemon-$(id -u).sock"
    if [[ -S "${socket_path}" ]]; then
        DAEMON_RUNNING=true
        return 0
    fi
    # Also check for running process
    if pgrep -f "auto-mobile.*daemon" >/dev/null 2>&1; then
        DAEMON_RUNNING=true
        return 0
    fi
    DAEMON_RUNNING=false
    return 0
}

detect_data_dir() {
    if [[ -d "${HOME}/.automobile" ]]; then
        DATA_DIR_EXISTS=true
    else
        DATA_DIR_EXISTS=false
    fi
    return 0
}

# ============================================================================
# Removal Functions
# ============================================================================
remove_from_json_config() {
    local path="$1"
    local tmp_file="${path}.tmp"

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would remove auto-mobile entries from ${path}"
        return 0
    fi

    # Use jq if available for clean JSON manipulation
    if command_exists jq; then
        # Remove any key matching auto-mobile or automobile (case insensitive)
        jq 'walk(if type == "object" then with_entries(select(.key | test("auto-mobile|automobile"; "i") | not)) else . end)' "${path}" > "${tmp_file}" 2>/dev/null
        if [[ $? -eq 0 && -s "${tmp_file}" ]]; then
            mv "${tmp_file}" "${path}"
            return 0
        fi
        rm -f "${tmp_file}"
    fi

    # Fallback: use sed to remove lines containing auto-mobile
    # This is less precise but works without jq
    local backup="${path}.bak"
    cp "${path}" "${backup}"

    # Remove lines containing auto-mobile (case insensitive)
    # and clean up any resulting empty objects or trailing commas
    sed -i.tmp -E '/"[^"]*[aA]uto-?[mM]obile[^"]*"/d' "${path}" 2>/dev/null || \
    sed -E '/"[^"]*[aA]uto-?[mM]obile[^"]*"/d' "${path}" > "${tmp_file}" && mv "${tmp_file}" "${path}"

    rm -f "${path}.tmp" 2>/dev/null || true
    return 0
}

remove_from_toml_config() {
    local path="$1"

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would remove auto-mobile entries from ${path}"
        return 0
    fi

    local backup="${path}.bak"
    cp "${path}" "${backup}"

    # Remove TOML sections containing auto-mobile
    # This removes from [section.auto-mobile] to the next section or end of file
    local tmp_file="${path}.tmp"
    awk '
        /^\[.*[aA]uto-?[mM]obile.*\]/ { skip=1; next }
        /^\[/ { skip=0 }
        !skip { print }
    ' "${path}" > "${tmp_file}"
    mv "${tmp_file}" "${path}"
    return 0
}

remove_from_yaml_config() {
    local path="$1"

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would remove auto-mobile entries from ${path}"
        return 0
    fi

    # Use yq if available
    if command_exists yq; then
        local tmp_file="${path}.tmp"
        # Remove keys matching auto-mobile pattern
        yq 'del(.. | select(key | test("auto-mobile|automobile"; "i")))' "${path}" > "${tmp_file}" 2>/dev/null
        if [[ $? -eq 0 && -s "${tmp_file}" ]]; then
            mv "${tmp_file}" "${path}"
            return 0
        fi
        rm -f "${tmp_file}"
    fi

    # Fallback: use awk to remove YAML blocks
    local backup="${path}.bak"
    cp "${path}" "${backup}"

    local tmp_file="${path}.tmp"
    awk '
        /^[[:space:]]*[aA]uto-?[mM]obile:/ { skip=1; indent=match($0, /[^[:space:]]/)-1; next }
        skip && /^[[:space:]]*[^[:space:]]/ {
            current_indent=match($0, /[^[:space:]]/)-1
            if (current_indent <= indent) { skip=0 }
        }
        !skip { print }
    ' "${path}" > "${tmp_file}"
    mv "${tmp_file}" "${path}"
    return 0
}

remove_mcp_configs() {
    if [[ ${#MCP_CONFIGS_FOUND[@]} -eq 0 ]]; then
        log_info "No MCP configurations found to remove"
        return 0
    fi

    for entry in "${MCP_CONFIGS_FOUND[@]}"; do
        local name path format
        name=$(echo "${entry}" | cut -d'|' -f1)
        path=$(echo "${entry}" | cut -d'|' -f2)
        format=$(echo "${entry}" | cut -d'|' -f3)

        log_info "Removing auto-mobile from ${name}..."

        case "${format}" in
            json)
                remove_from_json_config "${path}"
                ;;
            toml)
                remove_from_toml_config "${path}"
                ;;
            yaml)
                remove_from_yaml_config "${path}"
                ;;
        esac

        if [[ "${DRY_RUN}" != "true" ]]; then
            CHANGES_MADE=true
        fi
    done
}

remove_marketplace() {
    if [[ "${MARKETPLACE_INSTALLED}" != "true" ]]; then
        log_info "Claude Marketplace not configured"
        return 0
    fi

    if [[ -z "${MARKETPLACE_NAME}" ]]; then
        log_warn "Could not determine marketplace name"
        return 1
    fi

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would run: claude plugin marketplace remove ${MARKETPLACE_NAME}"
        return 0
    fi

    log_info "Removing Claude Marketplace: ${MARKETPLACE_NAME}..."
    if claude plugin marketplace remove "${MARKETPLACE_NAME}" 2>/dev/null; then
        log_info "Claude Marketplace removed"
        CHANGES_MADE=true
    else
        log_warn "Failed to remove Claude Marketplace"
    fi
}

remove_cli() {
    if [[ "${CLI_INSTALLED}" != "true" ]]; then
        log_info "AutoMobile CLI not installed"
        return 0
    fi

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would remove AutoMobile CLI"
        if command_exists bun; then
            log_info "[DRY-RUN]   - bun remove -g @kaeawc/auto-mobile"
        fi
        if command_exists npm; then
            log_info "[DRY-RUN]   - npm uninstall -g @kaeawc/auto-mobile"
        fi
        return 0
    fi

    log_info "Removing AutoMobile CLI..."

    # Try both bun and npm - the CLI might be installed via either or both
    if command_exists bun; then
        bun remove -g @kaeawc/auto-mobile 2>/dev/null || true
    fi

    if command_exists npm; then
        npm uninstall -g @kaeawc/auto-mobile 2>/dev/null || true
    fi

    # Verify removal by checking if command still exists
    # Need to clear bash's command cache first
    hash -r 2>/dev/null || true

    if ! command -v auto-mobile >/dev/null 2>&1; then
        log_info "AutoMobile CLI removed"
        CHANGES_MADE=true
    else
        log_warn "AutoMobile CLI may still be installed at: $(command -v auto-mobile)"
    fi
}

stop_daemon() {
    if [[ "${DAEMON_RUNNING}" != "true" ]]; then
        log_info "MCP daemon not running"
        return 0
    fi

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would stop MCP daemon"
        return 0
    fi

    log_info "Stopping MCP daemon..."

    # Try graceful shutdown first
    local socket_path
    socket_path="/tmp/auto-mobile-daemon-$(id -u).sock"
    if [[ -S "${socket_path}" ]]; then
        rm -f "${socket_path}"
    fi

    # Kill any running daemon processes
    pkill -f "auto-mobile.*daemon" 2>/dev/null || true

    log_info "MCP daemon stopped"
    CHANGES_MADE=true
}

remove_data_dir() {
    if [[ "${DATA_DIR_EXISTS}" != "true" ]]; then
        log_info "AutoMobile data directory not found"
        return 0
    fi

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would remove ${HOME}/.automobile"
        return 0
    fi

    log_info "Removing AutoMobile data directory..."
    rm -rf "${HOME}/.automobile"
    log_info "AutoMobile data directory removed"
    CHANGES_MADE=true
}

# ============================================================================
# Interactive Selection
# ============================================================================
select_components() {
    if ! ensure_gum; then
        log_error "gum is required for interactive mode. Use --all for non-interactive uninstall."
        exit 1
    fi

    local options=()

    if [[ ${#MCP_CONFIGS_FOUND[@]} -gt 0 ]]; then
        local config_list=""
        for entry in "${MCP_CONFIGS_FOUND[@]}"; do
            local name
            name=$(echo "${entry}" | cut -d'|' -f1)
            config_list="${config_list}${name}, "
        done
        config_list="${config_list%, }"
        options+=("MCP Configurations (${config_list})")
    fi

    if [[ "${MARKETPLACE_INSTALLED}" == "true" ]]; then
        options+=("Claude Marketplace Plugin")
    fi

    if [[ "${CLI_INSTALLED}" == "true" ]]; then
        options+=("AutoMobile CLI")
    fi

    if [[ "${DAEMON_RUNNING}" == "true" ]]; then
        options+=("MCP Daemon (running)")
    fi

    if [[ "${DATA_DIR_EXISTS}" == "true" ]]; then
        options+=("AutoMobile Data (~/.automobile)")
    fi

    # Add "Everything" option at the bottom if there are multiple components
    if [[ ${#options[@]} -gt 1 ]]; then
        options+=("Everything")
    fi

    if [[ ${#options[@]} -eq 0 ]]; then
        log_info "No AutoMobile components found to uninstall"
        exit 0
    fi

    echo ""
    gum style --bold "Select components to uninstall:"
    echo ""

    local selected
    selected=$(printf '%s\n' "${options[@]}" | gum filter --no-limit --placeholder "Type to filter, SPACE to select...") || true

    if [[ -z "${selected}" ]]; then
        log_info "No components selected"
        exit 0
    fi

    # Parse selection
    while IFS= read -r item; do
        case "${item}" in
            "MCP Configurations"*)
                UNINSTALL_MCP_CONFIGS=true
                ;;
            "Claude Marketplace Plugin")
                UNINSTALL_MARKETPLACE=true
                ;;
            "AutoMobile CLI")
                UNINSTALL_CLI=true
                ;;
            "MCP Daemon"*)
                UNINSTALL_DAEMON=true
                ;;
            "AutoMobile Data"*)
                UNINSTALL_DATA=true
                ;;
            "Everything")
                UNINSTALL_MCP_CONFIGS=true
                UNINSTALL_MARKETPLACE=true
                UNINSTALL_CLI=true
                UNINSTALL_DAEMON=true
                UNINSTALL_DATA=true
                ;;
        esac
    done <<< "${selected}"
}

# ============================================================================
# Confirmation
# ============================================================================
confirm_uninstall() {
    if [[ "${FORCE}" == "true" || "${RECORD_MODE}" == "true" ]]; then
        return 0
    fi

    if [[ "${DRY_RUN}" == "true" ]]; then
        return 0
    fi

    echo ""
    gum style --foreground 214 --bold "The following will be removed:"
    echo ""

    if [[ "${UNINSTALL_MCP_CONFIGS}" == "true" ]]; then
        for entry in "${MCP_CONFIGS_FOUND[@]}"; do
            local name path
            name=$(echo "${entry}" | cut -d'|' -f1)
            path=$(echo "${entry}" | cut -d'|' -f2)
            echo "  - ${name}: ${path}"
        done
    fi

    if [[ "${UNINSTALL_MARKETPLACE}" == "true" ]]; then
        echo "  - Claude Marketplace Plugin"
    fi

    if [[ "${UNINSTALL_CLI}" == "true" ]]; then
        echo "  - AutoMobile CLI"
    fi

    if [[ "${UNINSTALL_DAEMON}" == "true" ]]; then
        echo "  - MCP Daemon"
    fi

    if [[ "${UNINSTALL_DATA}" == "true" ]]; then
        echo "  - AutoMobile Data (~/.automobile)"
    fi

    echo ""

    if ! gum confirm "Proceed with uninstall?"; then
        log_info "Uninstall cancelled"
        exit 0
    fi
}

# ============================================================================
# Main
# ============================================================================
main() {
    parse_args "$@"

    echo ""
    if ensure_gum; then
        gum style --bold "AutoMobile Uninstaller"
    else
        echo -e "${BOLD}AutoMobile Uninstaller${RESET}"
    fi
    echo ""

    if [[ "${DRY_RUN}" == "true" ]]; then
        if ensure_gum; then
            gum style --foreground 214 --bold "DRY-RUN MODE: No changes will be made"
        else
            echo -e "${YELLOW}${BOLD}DRY-RUN MODE: No changes will be made${RESET}"
        fi
        echo ""
    elif [[ "${RECORD_MODE}" == "true" ]]; then
        if ensure_gum; then
            gum style --foreground 212 --bold "RECORD MODE: Auto-selecting all components"
        else
            echo -e "${YELLOW}${BOLD}RECORD MODE: Auto-selecting all components${RESET}"
        fi
        echo ""
    fi

    # Detect installed components
    log_info "Detecting installed components..."
    detect_mcp_configs
    detect_marketplace
    detect_cli
    detect_daemon
    detect_data_dir

    # Show what was found
    echo ""
    if [[ ${#MCP_CONFIGS_FOUND[@]} -gt 0 ]]; then
        log_info "Found ${#MCP_CONFIGS_FOUND[@]} MCP configuration(s) with auto-mobile"
    fi
    if [[ "${MARKETPLACE_INSTALLED}" == "true" ]]; then
        log_info "Found Claude Marketplace plugin"
    fi
    if [[ "${CLI_INSTALLED}" == "true" ]]; then
        log_info "Found AutoMobile CLI"
    fi
    if [[ "${DAEMON_RUNNING}" == "true" ]]; then
        log_info "Found running MCP daemon"
    fi
    if [[ "${DATA_DIR_EXISTS}" == "true" ]]; then
        log_info "Found AutoMobile data directory"
    fi

    # Check if anything was found
    local found_something=false
    if [[ ${#MCP_CONFIGS_FOUND[@]} -gt 0 ]] || \
       [[ "${MARKETPLACE_INSTALLED}" == "true" ]] || \
       [[ "${CLI_INSTALLED}" == "true" ]] || \
       [[ "${DAEMON_RUNNING}" == "true" ]] || \
       [[ "${DATA_DIR_EXISTS}" == "true" ]]; then
        found_something=true
    fi

    if [[ "${found_something}" != "true" ]]; then
        echo ""
        log_info "No AutoMobile components found to uninstall"
        exit 0
    fi

    # Select components
    if [[ "${ALL}" == "true" || "${RECORD_MODE}" == "true" ]]; then
        UNINSTALL_MCP_CONFIGS=true
        UNINSTALL_MARKETPLACE=true
        UNINSTALL_CLI=true
        UNINSTALL_DAEMON=true
        UNINSTALL_DATA=true
    else
        select_components
    fi

    # Confirm
    if ensure_gum; then
        confirm_uninstall
    elif [[ "${FORCE}" != "true" && "${RECORD_MODE}" != "true" && "${DRY_RUN}" != "true" ]]; then
        echo ""
        echo -e "${YELLOW}${BOLD}Warning: About to remove AutoMobile components${RESET}"
        echo "Use --force to skip this prompt or --dry-run to preview changes"
        read -p "Continue? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Uninstall cancelled"
            exit 0
        fi
    fi

    # Perform uninstall
    echo ""
    if [[ "${UNINSTALL_DAEMON}" == "true" ]]; then
        stop_daemon
    fi

    if [[ "${UNINSTALL_MCP_CONFIGS}" == "true" ]]; then
        remove_mcp_configs
    fi

    if [[ "${UNINSTALL_MARKETPLACE}" == "true" ]]; then
        remove_marketplace
    fi

    if [[ "${UNINSTALL_CLI}" == "true" ]]; then
        remove_cli
    fi

    if [[ "${UNINSTALL_DATA}" == "true" ]]; then
        remove_data_dir
    fi

    # Summary
    echo ""
    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "Dry-run complete. No changes were made."
    elif [[ "${CHANGES_MADE}" == "true" ]]; then
        log_info "Uninstall complete"
    else
        log_info "No changes were necessary"
    fi
}

main "$@"
