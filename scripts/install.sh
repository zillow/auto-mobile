#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Handle Ctrl-C (SIGINT) - exit immediately
trap 'echo ""; echo "Installation cancelled."; exit 130' INT

# Handle piped execution (curl | bash) where BASH_SOURCE is empty
if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
else
    SCRIPT_DIR=""
    PROJECT_ROOT="$(pwd)"
fi
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
RECORD_MODE=false
PRESET=""
CONFIGURE_MCP_CLIENTS=false

# Gum bundling configuration
GUM_VERSION="0.17.0"
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
PRESET_CLIENT_FILTER=""  # When set, auto-select clients matching this prefix
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
INSTALL_CLAUDE_MARKETPLACE=false
START_DAEMON=false
DAEMON_STARTED=false
AUTO_MOBILE_CMD=()

# Early detection state
CLI_ALREADY_INSTALLED=false
DAEMON_ALREADY_RUNNING=false
CLAUDE_CLI_INSTALLED=false
CLAUDE_MARKETPLACE_INSTALLED=false
IOS_SETUP_OK=false
ANDROID_SETUP_OK=false

# Track if any changes were made
CHANGES_MADE=false

# Track if ANDROID_HOME was already set in environment
ANDROID_HOME_FROM_ENV=false
if [[ -n "${ANDROID_HOME:-}" ]]; then
    ANDROID_HOME_FROM_ENV=true
fi

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if auto-mobile CLI is installed
is_cli_installed() {
    command_exists auto-mobile
}

# Check if MCP daemon is running (fast check - just verify socket exists)
is_daemon_running() {
    local socket_path
    socket_path="/tmp/auto-mobile-daemon-$(id -u).sock"
    [[ -S "${socket_path}" ]]
}

# Check if Claude CLI is installed
is_claude_cli_installed() {
    command_exists claude
}

# Check if auto-mobile marketplace plugin is already installed
is_claude_marketplace_installed() {
    if ! command_exists claude; then
        return 1
    fi
    # Check if auto-mobile marketplace is in the list
    claude plugin marketplace list 2>/dev/null | grep -q "auto-mobile" 2>/dev/null
}

# Perform early detection of installed components (fast checks only, before gum)
detect_existing_setup() {
    if is_cli_installed; then
        CLI_ALREADY_INSTALLED=true
    fi

    if is_daemon_running; then
        DAEMON_ALREADY_RUNNING=true
    fi

    if is_claude_cli_installed; then
        CLAUDE_CLI_INSTALLED=true
        # Note: marketplace check is deferred to after gum is available (slow network call)
    fi
}

# ============================================================================
# CLI Argument Parsing
# ============================================================================
show_help() {
    cat << 'EOF'
AutoMobile Installer

Usage: ./scripts/install.sh [OPTIONS]

Options:
  --dry-run           Show what would happen without making changes
  --record-mode       Auto-select defaults and run (for demo recording)
  --preset NAME       Use preset configuration (minimal, development)
  --non-interactive   Skip interactive prompts, use defaults
  -h, --help          Show this help message

Presets:
  minimal      - CLI + MCP client configuration only
  development  - Full setup with debug flags and IDE plugin (if available)

Examples:
  ./scripts/install.sh --dry-run
  ./scripts/install.sh --record-mode
  ./scripts/install.sh --preset development
  ./scripts/install.sh --preset development --non-interactive

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
            --record-mode)
                RECORD_MODE=true
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

# Write file with diff preview and user approval
write_file() {
    local path="$1"
    local content="$2"
    local description="${3:-Write to ${path}}"

    # Get existing content if file exists
    local existing_content=""
    if [[ -f "${path}" ]]; then
        existing_content=$(cat "${path}" 2>/dev/null || echo "")
    fi

    # Check if content is actually different
    if [[ "${existing_content}" == "${content}" ]]; then
        log_info "No changes needed for ${path}"
        return 0
    fi

    # Show the diff
    if [[ -f "${path}" ]]; then
        show_colored_diff "${existing_content}" "${content}" "${path}"
    else
        show_new_file "${content}" "${path}"
    fi

    if [[ "${DRY_RUN}" == "true" ]]; then
        DRY_RUN_LOG+=("[DRY-RUN] ${description}")
        log_info "[DRY-RUN] Would write to: ${path}"
        return 0
    fi

    # Ask for approval (skip in non-interactive mode)
    if [[ "${NON_INTERACTIVE}" != "true" ]]; then
        if ! gum confirm "Apply these changes to ${path}?"; then
            log_info "Skipped changes to ${path}"
            return 0
        fi
    fi

    # Create parent directory if needed
    local parent_dir
    parent_dir=$(dirname "${path}")
    if [[ ! -d "${parent_dir}" ]]; then
        mkdir -p "${parent_dir}"
    fi

    printf '%s\n' "${content}" > "${path}"
    log_info "Updated ${path}"
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

# Terminal colors for diffs
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RESET='\033[0m'
BOLD='\033[1m'

# Show a colored diff between old and new content
show_colored_diff() {
    local old_content="$1"
    local new_content="$2"
    local file_path="$3"

    local temp_old temp_new
    temp_old=$(mktemp)
    temp_new=$(mktemp)

    printf '%s\n' "${old_content}" > "${temp_old}"
    printf '%s\n' "${new_content}" > "${temp_new}"

    echo ""
    printf '%b--- %s (current)%b\n' "${BOLD}" "${file_path}" "${RESET}"
    printf '%b+++ %s (proposed)%b\n' "${BOLD}" "${file_path}" "${RESET}"

    # Generate unified diff (diff returns 1 when files differ, which is expected)
    local diff_output
    diff_output=$(diff -u "${temp_old}" "${temp_new}" 2>/dev/null || true)

    # Skip the first 2 lines (header) and colorize
    echo "${diff_output}" | tail -n +3 | while IFS= read -r line; do
        case "${line}" in
            -*)
                printf '%b%s%b\n' "${RED}" "${line}" "${RESET}"
                ;;
            +*)
                printf '%b%s%b\n' "${GREEN}" "${line}" "${RESET}"
                ;;
            @*)
                printf '%b%s%b\n' "${CYAN}" "${line}" "${RESET}"
                ;;
            *)
                printf '%s\n' "${line}"
                ;;
        esac
    done

    rm -f "${temp_old}" "${temp_new}"
    echo ""
}

# Show new file content (all green)
show_new_file() {
    local content="$1"
    local file_path="$2"

    echo ""
    printf '%b+++ %s (new file)%b\n' "${BOLD}" "${file_path}" "${RESET}"
    echo ""
    while IFS= read -r line; do
        printf '%b+%s%b\n' "${GREEN}" "${line}" "${RESET}"
    done <<< "${content}"
    echo ""
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

# Offer to set ANDROID_HOME in a shell profile
# Called when SDK is detected but ANDROID_HOME is not set in environment
offer_android_home_shell_setup() {
    local detected_path="$1"

    # Common shell profile files
    local profile_files=(
        "${HOME}/.zshrc"
        "${HOME}/.zprofile"
        "${HOME}/.bash_profile"
        "${HOME}/.bashrc"
        "${HOME}/.profile"
    )

    # First, check if ANDROID_HOME is already configured in any profile file
    local configured_in=""
    for profile in "${profile_files[@]}"; do
        if [[ -f "${profile}" ]] && grep -q "ANDROID_HOME" "${profile}" 2>/dev/null; then
            configured_in="${profile}"
            break
        fi
    done

    # If already configured in a profile, offer to source it
    if [[ -n "${configured_in}" ]]; then
        local short_name="${configured_in#"${HOME}"/}"
        log_info "ANDROID_HOME is configured in ~/${short_name} but not loaded in current shell"

        if [[ "${NON_INTERACTIVE}" == "true" ]]; then
            log_info "Run: source ~/${short_name}"
            return 0
        fi

        # Extract ANDROID_HOME value from the file (don't source - may have shell-specific syntax)
        local extracted_value
        extracted_value=$(grep -E '^\s*(export\s+)?ANDROID_HOME=' "${configured_in}" 2>/dev/null | head -1 | sed -E 's/.*ANDROID_HOME=["'\'']?([^"'\'']+)["'\'']?.*/\1/')

        # Expand $HOME if present in the value
        extracted_value="${extracted_value/\$HOME/${HOME}}"
        extracted_value="${extracted_value/\~/${HOME}}"

        if [[ -n "${extracted_value}" ]]; then
            log_info "Found: ANDROID_HOME=${extracted_value}"

            if gum confirm "Set ANDROID_HOME for this session?"; then
                export ANDROID_HOME="${extracted_value}"
                log_info "ANDROID_HOME set for current session"
                # Update our tracking variable since it's now set
                ANDROID_HOME_FROM_ENV=true
            else
                log_info "Skipped setting ANDROID_HOME"
                log_info "Run 'source ~/${short_name}' in your shell to load it"
            fi
        else
            log_warn "Could not extract ANDROID_HOME value from ~/${short_name}"
            log_info "Run 'source ~/${short_name}' manually in your shell"
        fi
        return 0
    fi

    # ANDROID_HOME not configured anywhere - offer to add it
    # Skip in non-interactive mode
    if [[ "${NON_INTERACTIVE}" == "true" ]]; then
        log_warn "ANDROID_HOME is not set in your environment"
        log_info "Add this to your shell profile: export ANDROID_HOME=\"${detected_path}\""
        return 0
    fi

    log_warn "ANDROID_HOME is not configured in any shell profile"
    log_info "The Android SDK was found at: ${detected_path}"
    echo ""

    # Build options list - existing files first, then creatable files
    local existing_files=()
    local creatable_files=()

    for profile in "${profile_files[@]}"; do
        local short_name="${profile#"${HOME}"/}"
        # shellcheck disable=SC2088 # Tilde is intentional for display purposes
        if [[ -f "${profile}" ]]; then
            existing_files+=("~/${short_name}")
        else
            creatable_files+=("~/${short_name} (create)")
        fi
    done

    # Build final options array (handle empty arrays safely with set -u)
    local options=()
    if [[ ${#existing_files[@]} -gt 0 ]]; then
        options+=("${existing_files[@]}")
    fi
    if [[ ${#creatable_files[@]} -gt 0 ]]; then
        options+=("${creatable_files[@]}")
    fi
    options+=("Skip (I'll set it manually)")

    local choice
    choice=$(printf '%s\n' "${options[@]}" | gum choose --header "Add ANDROID_HOME to shell profile?")

    if [[ -z "${choice}" || "${choice}" == "Skip (I'll set it manually)" ]]; then
        log_info "Skipped ANDROID_HOME shell setup"
        log_info "You can add this manually: export ANDROID_HOME=\"${detected_path}\""
        return 0
    fi

    # Extract the file path from the choice
    local selected_file="${choice% (create)}"  # Remove "(create)" suffix if present
    selected_file="${selected_file/#\~/${HOME}}"  # Expand ~ to HOME

    # Prepare the export line
    local export_line="export ANDROID_HOME=\"${detected_path}\""
    # shellcheck disable=SC2016 # Single quotes intentional - we want literal $ANDROID_HOME in file
    local path_line='export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"'

    # Check if already present
    if [[ -f "${selected_file}" ]] && grep -q "ANDROID_HOME" "${selected_file}" 2>/dev/null; then
        log_info "ANDROID_HOME is already configured in ${choice% (create)}"
        return 0
    fi

    # Prepare the content to append
    local append_content
    append_content=$(cat << EOF

# Android SDK (added by auto-mobile installer)
${export_line}
${path_line}
EOF
)

    # Show what will be added
    local current_content=""
    if [[ -f "${selected_file}" ]]; then
        current_content=$(cat "${selected_file}" 2>/dev/null || true)
    fi
    local new_content="${current_content}${append_content}"

    if [[ -f "${selected_file}" ]]; then
        show_colored_diff "${current_content}" "${new_content}" "${selected_file}"
    else
        show_new_file "${new_content}" "${selected_file}"
    fi

    if [[ "${DRY_RUN}" == "true" ]]; then
        DRY_RUN_LOG+=("[DRY-RUN] Add ANDROID_HOME to ${selected_file}")
        log_info "[DRY-RUN] Would add ANDROID_HOME to: ${selected_file}"
        return 0
    fi

    if ! gum confirm "Apply these changes to ${selected_file}?"; then
        log_info "Skipped ANDROID_HOME shell setup"
        return 0
    fi

    # Append to file (create if doesn't exist)
    printf '%s\n' "${append_content}" >> "${selected_file}"
    log_info "Added ANDROID_HOME to ${selected_file}"
    log_info "Run 'source ${selected_file}' or open a new terminal to apply"
    CHANGES_MADE=true
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

# Run command with spinner, show output on failure
run_with_error_output() {
    local title="$1"
    shift

    local output
    local status=0
    output=$("$@" 2>&1) || status=$?

    if [[ ${status} -ne 0 ]]; then
        log_error "${title} failed"
        if [[ -n "${output}" ]]; then
            echo "${output}"
        fi
        return ${status}
    fi

    log_info "${title}: ok"
    return 0
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
    # gum doesn't have a progress command, use spinner instead
    run_spinner "${title}" "$@"
}

run_download_with_progress() {
    local title="$1"
    shift

    run_spinner "Preparing ${title}" sleep 0.3
    run_with_progress "${title}" "$@"
}

# Display the AutoMobile logo with animation
# Uses only unicode symbols known to work with agg (DejaVu Sans fallback)
play_logo_animation() {
    local RED=$'\033[31m'
    local GRAY=$'\033[90m'
    local BOLD=$'\033[1m'
    local RESET=$'\033[0m'

    # Truck ASCII art (5 lines, ~17 chars wide)
    local line1="    ${RED}┌───┐${RESET}       "
    local line2="   ${RED}╱    │${RESET}       "
    local line3="${RED}┌─╱     └══════╦${RESET}"
    local line4="${RED}│  ┌──┐   ┌──┐ ║${RESET}"
    local line5="${RED}└──┘${GRAY}()${RED}└───┘${GRAY}()${RED}└─╝${RESET}"

    local car_height=5
    local car_width=17
    local frame_count=12
    local delay=0.045

    # Check terminal capabilities
    if ! command_exists tput || [[ ! -t 1 ]]; then
        echo ""
        echo -e "${line1}"
        echo -e "${line2}"
        echo -e "${line3}"
        echo -e "${line4}  ${BOLD}AutoMobile${RESET}"
        echo -e "${line5}"
        echo ""
        return 0
    fi

    local term_cols
    term_cols=$(tput cols 2>/dev/null || echo 80)

    # Need space for animation
    if (( term_cols < 40 )); then
        echo ""
        echo -e "${line1}"
        echo -e "${line2}"
        echo -e "${line3}"
        echo -e "${line4}  ${BOLD}AutoMobile${RESET}"
        echo -e "${line5}"
        echo ""
        return 0
    fi

    local start_pos=$((term_cols - car_width - 2))
    local end_pos=3

    # Hide cursor
    tput civis 2>/dev/null || true

    # Print empty lines for car
    echo ""
    local i
    for ((i = 0; i < car_height; i++)); do
        echo ""
    done

    # Animation loop
    for ((frame = 0; frame <= frame_count; frame++)); do
        local pos=$((start_pos - (start_pos - end_pos) * frame / frame_count))

        # Move cursor up
        printf "\033[%dA" "${car_height}"

        # Draw each line with position offset
        local lines=("$line1" "$line2" "$line3" "$line4" "$line5")
        for line in "${lines[@]}"; do
            printf "\033[2K"
            if (( pos > 0 )); then
                printf "%*s" "${pos}" ""
            fi
            echo -e "${line}"
        done

        sleep "${delay}"
    done

    # Final frame with title
    printf "\033[%dA" "${car_height}"
    printf "\033[2K%*s%s\n" "${end_pos}" "" "${line1}"
    printf "\033[2K%*s%s\n" "${end_pos}" "" "${line2}"
    printf "\033[2K%*s%s\n" "${end_pos}" "" "${line3}"
    printf "\033[2K%*s%s  ${BOLD}AutoMobile${RESET}\n" "${end_pos}" "" "${line4}"
    printf "\033[2K%*s%s\n" "${end_pos}" "" "${line5}"
    echo ""

    # Show cursor
    tput cnorm 2>/dev/null || true
}

# ============================================================================
# AI Agent Installation Detection
# ============================================================================

# Check if Claude Code CLI is installed
is_claude_code_installed() {
    command_exists claude
}

# Check if Claude Desktop is installed
is_claude_desktop_installed() {
    local os
    os=$(detect_os)
    if [[ "${os}" == "macos" ]]; then
        [[ -d "${HOME}/Library/Application Support/Claude" ]] || [[ -d "/Applications/Claude.app" ]]
    elif [[ "${os}" == "linux" ]]; then
        [[ -d "${HOME}/.config/Claude" ]]
    else
        return 1
    fi
}

# Check if Cursor is installed
is_cursor_installed() {
    [[ -d "${HOME}/.cursor" ]] || command_exists cursor
}

# Check if Windsurf is installed
is_windsurf_installed() {
    [[ -d "${HOME}/.codeium/windsurf" ]] || [[ -d "${HOME}/.codeium" ]] || command_exists windsurf
}

# Check if VS Code is installed
is_vscode_installed() {
    local os
    os=$(detect_os)
    if command_exists code; then
        return 0
    elif [[ "${os}" == "macos" && -d "/Applications/Visual Studio Code.app" ]]; then
        return 0
    elif [[ "${os}" == "linux" && -d "${HOME}/.vscode" ]]; then
        return 0
    fi
    return 1
}

# Check if Codex (OpenAI) is installed
is_codex_installed() {
    [[ -d "${HOME}/.codex" ]] || command_exists codex
}

# Check if Firebender IntelliJ plugin is installed
is_firebender_installed() {
    # Check for Firebender config directory
    if [[ -d "${HOME}/.firebender" ]]; then
        return 0
    fi

    # Check for Firebender plugin in IntelliJ-based IDEs
    local plugin_dirs=(
        "${HOME}/Library/Application Support/Google/AndroidStudio"*"/plugins"
        "${HOME}/Library/Application Support/JetBrains/IntelliJIdea"*"/plugins"
        "${HOME}/Library/Application Support/JetBrains/IdeaIC"*"/plugins"
        "${HOME}/.local/share/Google/AndroidStudio"*"/plugins"
        "${HOME}/.local/share/JetBrains/IntelliJIdea"*"/plugins"
        "${HOME}/.local/share/JetBrains/IdeaIC"*"/plugins"
    )

    # Use ripgrep to search for firebender in plugin directories
    for pattern in "${plugin_dirs[@]}"; do
        # shellcheck disable=SC2086 # Glob expansion is intentional
        for dir in ${pattern}; do
            if [[ -d "${dir}" ]]; then
                if rg -q -i "firebender" "${dir}" 2>/dev/null; then
                    return 0
                fi
                # Also check directory names using glob pattern
                # shellcheck disable=SC2231 # Glob in loop is intentional
                for plugin in "${dir}"/*[Ff]irebender* "${dir}"/*[Ff]ire[Bb]ender*; do
                    if [[ -e "${plugin}" ]]; then
                        return 0
                    fi
                done
            fi
        done
    done

    return 1
}

# Check if Goose is installed
is_goose_installed() {
    [[ -d "${HOME}/.config/goose" ]] || command_exists goose
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

# Check if a client config file already has auto-mobile configured
client_has_auto_mobile() {
    local client="$1"
    local config_path
    config_path=$(get_client_config_path "${client}")
    local format
    format=$(get_client_config_format "${client}")

    if [[ ! -f "${config_path}" ]]; then
        return 1
    fi

    if [[ "${format}" == "toml" ]]; then
        grep -q '\[mcp_servers.auto-mobile\]' "${config_path}" 2>/dev/null
    elif [[ "${format}" == "yaml" ]]; then
        grep -q 'auto-mobile:' "${config_path}" 2>/dev/null
    else
        # JSON - check for "auto-mobile" key in mcpServers
        grep -q '"auto-mobile"' "${config_path}" 2>/dev/null
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

    # Check which clients already have auto-mobile configured
    local clients_with_auto_mobile=()
    local clients_without_auto_mobile=()

    while IFS= read -r client; do
        if client_has_auto_mobile "${client}"; then
            clients_with_auto_mobile+=("${client}")
        else
            clients_without_auto_mobile+=("${client}")
        fi
    done <<< "${available_clients}"

    gum style --bold "Detected MCP Clients:"
    echo ""

    # Show what's detected with their config paths and auto-mobile status
    while IFS= read -r client; do
        local path
        path=$(get_client_config_path "${client}")
        local status_marker=""
        if [[ -f "${path}" ]]; then
            if client_has_auto_mobile "${client}"; then
                status_marker=" (auto-mobile configured)"
            else
                status_marker=" (config exists)"
            fi
        fi
        gum style --faint "  ${client}: ${path}${status_marker}"
    done <<< "${available_clients}"

    echo ""

    # If some clients already have auto-mobile, offer different options
    if [[ ${#clients_with_auto_mobile[@]} -gt 0 ]]; then
        local action_choice
        action_choice=$(gum choose \
            "Leave existing configurations" \
            "Update existing configurations to use @latest" \
            "Configure new clients only" \
            --header "Some clients already have auto-mobile configured:")

        case "${action_choice}" in
            "Leave existing configurations")
                log_info "Keeping existing configurations unchanged."
                return 1
                ;;
            "Update existing configurations to use @latest")
                # Select all clients that have auto-mobile for update
                SELECTED_MCP_CLIENTS=("${clients_with_auto_mobile[@]}")
                log_info "Will update ${#SELECTED_MCP_CLIENTS[@]} existing configuration(s)"
                return 0
                ;;
            "Configure new clients only")
                if [[ ${#clients_without_auto_mobile[@]} -eq 0 ]]; then
                    log_info "All detected clients already have auto-mobile configured."
                    return 1
                fi
                # Fall through to select from unconfigured clients
                available_clients=$(printf '%s\n' "${clients_without_auto_mobile[@]}")
                ;;
            *)
                log_info "No action selected. Skipping MCP configuration."
                return 1
                ;;
        esac
    fi

    echo ""
    gum style --italic --foreground 243 "Press SPACE to select/deselect, ENTER to confirm, ESC to skip"
    echo ""

    # Multi-select with gum choose
    # Use filter for better UX - it allows typing to filter and space to select
    local selected
    selected=$(printf '%s\n' "${available_clients}" | gum filter --no-limit --placeholder "Type to filter, SPACE to select..." --header "Select clients to configure:")

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

    log_info "Selected ${#SELECTED_MCP_CLIENTS[@]} client(s) for configuration"
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
    print("INFO:auto-mobile already configured, will be updated", file=sys.stderr)

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
    print("INFO:auto-mobile already configured in TOML, will be updated", file=sys.stderr)
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

# Show diff between old and new config (uses colored diff)
show_config_diff() {
    local old_content="$1"
    local new_content="$2"
    local config_path="$3"

    if [[ -z "${old_content}" ]] || [[ "${old_content}" == "{}" ]]; then
        show_new_file "${new_content}" "${config_path}"
        return 0
    fi

    # Check if content is the same
    if [[ "${old_content}" == "${new_content}" ]]; then
        log_info "No changes needed for ${config_path}"
        return 0
    fi

    show_colored_diff "${old_content}" "${new_content}" "${config_path}"
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
            # Only add ANDROID_HOME to env if it wasn't already set in the environment
            if [[ -n "${android_home}" && "${ANDROID_HOME_FROM_ENV}" != "true" ]]; then
                cat << EOF
{"command":"npx","args":["-y","@kaeawc/auto-mobile@latest","--debug","--debug-perf"],"env":{"ANDROID_HOME":"${android_home}"}}
EOF
            else
                cat << 'EOF'
{"command":"npx","args":["-y","@kaeawc/auto-mobile@latest","--debug","--debug-perf"]}
EOF
            fi
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
            # Only add ANDROID_HOME to env if it wasn't already set in the environment
            if [[ -n "${android_home}" && "${ANDROID_HOME_FROM_ENV}" != "true" ]]; then
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

# Check if yq is installed
is_yq_installed() {
    command_exists yq
}

# Install yq for YAML processing
install_yq() {
    local os
    os=$(detect_os)

    if [[ "${NON_INTERACTIVE}" != "true" ]]; then
        if ! gum confirm "yq is required for YAML configuration. Install yq now?"; then
            log_info "Skipped yq installation"
            return 1
        fi
    fi

    if [[ "${os}" == "macos" ]] && command_exists brew; then
        if ! run_spinner "Installing yq via Homebrew" brew install yq; then
            log_error "Failed to install yq"
            return 1
        fi
    elif command_exists go; then
        if ! run_spinner "Installing yq via go install" go install github.com/mikefarah/yq/v4@latest; then
            log_error "Failed to install yq"
            return 1
        fi
    else
        # Try direct binary download
        local arch
        arch=$(detect_arch)
        local yq_binary="yq_${os}_${arch}"
        local yq_url="https://github.com/mikefarah/yq/releases/latest/download/${yq_binary}"

        local install_dir="${HOME}/.local/bin"
        mkdir -p "${install_dir}"

        if command_exists curl; then
            if ! run_spinner "Downloading yq" curl -fsSL "${yq_url}" -o "${install_dir}/yq"; then
                log_error "Failed to download yq"
                return 1
            fi
        elif command_exists wget; then
            if ! run_spinner "Downloading yq" wget -qO "${install_dir}/yq" "${yq_url}"; then
                log_error "Failed to download yq"
                return 1
            fi
        else
            log_error "curl or wget required to download yq"
            return 1
        fi

        chmod +x "${install_dir}/yq"
        export PATH="${install_dir}:${PATH}"
    fi

    if command_exists yq; then
        log_info "yq installed: $(yq --version 2>&1 | head -1)"
        return 0
    else
        log_error "yq installation failed"
        return 1
    fi
}

# Ensure yq is available, installing if needed
ensure_yq() {
    if is_yq_installed; then
        return 0
    fi
    install_yq
}

# Generate auto-mobile MCP server config in YAML format (for Goose)
generate_auto_mobile_config_yaml() {
    local preset="${1:-minimal}"
    local android_home="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"

    case "${preset}" in
        minimal)
            cat << 'EOF'
extensions:
  auto-mobile:
    name: auto-mobile
    type: stdio
    enabled: true
    cmd: npx
    args:
      - "-y"
      - "@kaeawc/auto-mobile@latest"
EOF
            ;;
        development)
            # Only add ANDROID_HOME to env if it wasn't already set in the environment
            if [[ -n "${android_home}" && "${ANDROID_HOME_FROM_ENV}" != "true" ]]; then
                cat << EOF
extensions:
  auto-mobile:
    name: auto-mobile
    type: stdio
    enabled: true
    cmd: npx
    args:
      - "-y"
      - "@kaeawc/auto-mobile@latest"
      - "--debug"
      - "--debug-perf"
    env:
      ANDROID_HOME: "${android_home}"
EOF
            else
                cat << 'EOF'
extensions:
  auto-mobile:
    name: auto-mobile
    type: stdio
    enabled: true
    cmd: npx
    args:
      - "-y"
      - "@kaeawc/auto-mobile@latest"
      - "--debug"
      - "--debug-perf"
EOF
            fi
            ;;
        *)
            # Default to minimal
            cat << 'EOF'
extensions:
  auto-mobile:
    name: auto-mobile
    type: stdio
    enabled: true
    cmd: npx
    args:
      - "-y"
      - "@kaeawc/auto-mobile@latest"
EOF
            ;;
    esac
}

# Merge auto-mobile config into existing YAML config (for Goose)
merge_mcp_config_yaml() {
    local config_file="$1"
    local auto_mobile_yaml="$2"

    # Handle case where file doesn't exist
    if [[ ! -f "${config_file}" ]]; then
        echo "${auto_mobile_yaml}"
        return 0
    fi

    # Use yq to merge the configs
    if ! command_exists yq; then
        log_error "yq required for YAML configuration"
        return 1
    fi

    # Check if auto-mobile already exists in the config
    if yq -e '.extensions.auto-mobile' "${config_file}" &>/dev/null; then
        log_info "auto-mobile already configured in YAML, will be updated"
    fi

    # Create a temp file with the new auto-mobile config
    local temp_new
    temp_new=$(mktemp)
    echo "${auto_mobile_yaml}" > "${temp_new}"

    # Merge: existing config + new auto-mobile extension
    # This overwrites .extensions.auto-mobile with the new config
    local merged
    merged=$(yq eval-all 'select(fileIndex == 0) * select(fileIndex == 1)' "${config_file}" "${temp_new}" 2>/dev/null)

    rm -f "${temp_new}"

    if [[ -z "${merged}" ]]; then
        log_error "Failed to merge YAML configs"
        return 1
    fi

    echo "${merged}"
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
    if [[ "${format}" == "yaml" ]]; then
        if ! new_content=$(merge_mcp_config_yaml "${config_path}" "${auto_mobile_config}"); then
            log_error "Failed to generate YAML config for ${client_name}"
            return 1
        fi
    elif [[ "${format}" == "toml" ]]; then
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

    # Check if there are any changes needed
    if [[ "${existing_content}" == "${new_content}" ]]; then
        log_info "No changes needed for ${client_name}"
        return 0
    fi

    # Show diff
    show_config_diff "${existing_content}" "${new_content}" "${config_path}"

    # Reset terminal after colored output
    printf '%s' "${RESET}"

    # In non-interactive mode, just apply
    if [[ "${NON_INTERACTIVE}" == "true" ]]; then
        backup_config "${config_path}"
        printf '%s\n' "${new_content}" > "${config_path}"
        log_info "${client_name} configured successfully"
        CHANGES_MADE=true
        return 0
    fi

    # Confirm with user
    local confirm_prompt
    if [[ -n "${existing_content}" ]]; then
        confirm_prompt="Apply changes to ${config_path}?"
    else
        confirm_prompt="Create ${config_path}?"
    fi

    if ! gum confirm "${confirm_prompt}"; then
        log_info "Skipping ${client_name} configuration"
        return 0
    fi

    # Backup and write (skip confirmation since we already confirmed above)
    backup_config "${config_path}"

    # Create parent directory if needed
    local parent_dir
    parent_dir=$(dirname "${config_path}")
    if [[ ! -d "${parent_dir}" ]]; then
        mkdir -p "${parent_dir}"
    fi

    printf '%s\n' "${new_content}" > "${config_path}"
    log_info "${client_name} configured successfully"
    CHANGES_MADE=true
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
            --header "Select configuration preset for MCP servers:")

        case "${preset_choice}" in
            "Minimal"*)
                config_preset="minimal"
                ;;
            "Development"*)
                config_preset="development"
                ;;
        esac
    fi

    local auto_mobile_config_json
    auto_mobile_config_json=$(generate_auto_mobile_config "${config_preset}")
    local auto_mobile_config_toml
    auto_mobile_config_toml=$(generate_auto_mobile_config_toml "${config_preset}")
    local auto_mobile_config_yaml
    auto_mobile_config_yaml=$(generate_auto_mobile_config_yaml "${config_preset}")

    gum style --bold "Using ${config_preset} preset configuration"
    echo ""

    for client in "${SELECTED_MCP_CLIENTS[@]}"; do
        local config_path
        config_path=$(get_client_config_path "${client}")
        local format
        format=$(get_client_config_format "${client}")

        if [[ "${format}" == "yaml" ]]; then
            # Ensure yq is available for YAML processing
            if ! ensure_yq; then
                log_warn "YAML configuration for ${client} requires yq. Skipping."
                log_info "Manual configuration required for: ${config_path}"
                continue
            fi
            update_mcp_client_config "${client}" "${config_path}" "${auto_mobile_config_yaml}" "yaml"
        elif [[ "${format}" == "toml" ]]; then
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

    if [[ "${DRY_RUN}" == "true" ]]; then
        if command_exists bun; then
            DRY_RUN_LOG+=("[DRY-RUN] Install AutoMobile CLI with Bun")
            log_info "[DRY-RUN] Would install AutoMobile CLI with: bun add -g @kaeawc/auto-mobile@latest"
        elif command_exists npm; then
            DRY_RUN_LOG+=("[DRY-RUN] Install AutoMobile CLI with npm")
            log_info "[DRY-RUN] Would install AutoMobile CLI with: npm install -g @kaeawc/auto-mobile@latest"
        else
            log_error "Bun or npm is required to install AutoMobile CLI."
            return 1
        fi
        return 0
    fi

    if command_exists bun; then
        local install_output
        local install_status=0
        install_output=$(bun add -g @kaeawc/auto-mobile@latest 2>&1) || install_status=$?

        if [[ ${install_status} -eq 0 ]]; then
            log_info "AutoMobile CLI installed with Bun"
            CHANGES_MADE=true
            return 0
        fi

        # Try alternative bun install command
        install_output=$(bun install -g @kaeawc/auto-mobile@latest 2>&1) || install_status=$?

        if [[ ${install_status} -eq 0 ]]; then
            log_info "AutoMobile CLI installed with Bun"
            CHANGES_MADE=true
            return 0
        fi

        log_error "AutoMobile CLI installation failed with Bun:"
        echo "${install_output}"
        return 1
    fi

    if command_exists npm; then
        local install_output
        local install_status=0
        install_output=$(npm install -g @kaeawc/auto-mobile@latest 2>&1) || install_status=$?

        if [[ ${install_status} -ne 0 ]]; then
            log_error "AutoMobile CLI installation failed with npm:"
            echo "${install_output}"
            return 1
        fi
        log_info "AutoMobile CLI installed with npm"
        CHANGES_MADE=true
        return 0
    fi

    log_error "Bun or npm is required to install AutoMobile CLI."
    return 1
}

install_claude_marketplace() {
    if [[ "${CLAUDE_MARKETPLACE_INSTALLED}" == "true" ]]; then
        return 0
    fi

    if [[ "${CLAUDE_CLI_INSTALLED}" != "true" ]]; then
        log_error "Claude CLI is required to install marketplace plugin"
        return 1
    fi

    if [[ "${DRY_RUN}" == "true" ]]; then
        DRY_RUN_LOG+=("[DRY-RUN] Install Claude Marketplace plugin")
        log_info "[DRY-RUN] Would run: claude plugin marketplace add kaeawc/auto-mobile"
        return 0
    fi

    log_info "Installing Claude Marketplace plugin..."
    local install_output
    local install_status=0
    install_output=$(claude plugin marketplace add kaeawc/auto-mobile 2>&1) || install_status=$?

    if [[ ${install_status} -ne 0 ]]; then
        log_error "Failed to install Claude Marketplace plugin:"
        echo "${install_output}"
        return 1
    fi

    log_info "Claude Marketplace plugin installed successfully"
    CLAUDE_MARKETPLACE_INSTALLED=true
    CHANGES_MADE=true
    return 0
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

    if [[ "${DRY_RUN}" == "true" ]]; then
        DRY_RUN_LOG+=("[DRY-RUN] Start MCP daemon")
        DRY_RUN_LOG+=("[DRY-RUN] Check daemon health")
        log_info "[DRY-RUN] Would start MCP daemon"
        log_info "[DRY-RUN] Would check daemon health"
        return 0
    fi

    local daemon_output
    local daemon_status=0
    daemon_output=$("${AUTO_MOBILE_CMD[@]}" --daemon start 2>&1) || daemon_status=$?

    if [[ ${daemon_status} -ne 0 ]]; then
        # Check for corrupted migrations error
        if echo "${daemon_output}" | grep -q "corrupted migrations"; then
            # Extract just the migration error message (from the "error:" line, not source code)
            local migration_error
            migration_error=$(echo "${daemon_output}" | grep "^error: corrupted migrations:" | sed 's/^error: //' | head -1)
            if [[ -z "${migration_error}" ]]; then
                # Fallback if format is different
                migration_error="corrupted migrations (version mismatch)"
            fi
            log_warn "Database has ${migration_error}"
            echo ""

            local should_reset=false
            if [[ "${NON_INTERACTIVE}" == "true" ]]; then
                # Default to reset in non-interactive mode
                should_reset=true
                log_info "Resetting database automatically..."
            else
                if gum confirm "Reset the AutoMobile database to fix this?" --default=true; then
                    should_reset=true
                fi
            fi

            if [[ "${should_reset}" == "true" ]]; then
                local db_dir="${HOME}/.auto-mobile"
                if [[ "${DRY_RUN}" == "true" ]]; then
                    DRY_RUN_LOG+=("[DRY-RUN] Remove database files in ${db_dir}")
                    log_info "[DRY-RUN] Would remove database files: ${db_dir}/*.db*"
                    log_info "[DRY-RUN] Would retry daemon start"
                else
                    # Remove all database files (main db, WAL, SHM)
                    rm -f "${db_dir}"/*.db* 2>/dev/null || true
                    log_info "Database files removed from ${db_dir}"

                    # Retry daemon start (reset status first)
                    daemon_status=0
                    daemon_output=$("${AUTO_MOBILE_CMD[@]}" --daemon start 2>&1) || daemon_status=$?
                    if [[ ${daemon_status} -ne 0 ]]; then
                        log_error "Failed to start MCP daemon after database reset:"
                        echo "${daemon_output}"
                        return 1
                    fi
                    log_info "MCP daemon started after database reset"
                fi
            else
                log_error "Cannot start daemon with corrupted database. Exiting."
                return 1
            fi
        else
            log_error "Failed to start MCP daemon:"
            echo "${daemon_output}"
            return 1
        fi
    fi

    local health_output
    local health_status=0
    health_output=$("${AUTO_MOBILE_CMD[@]}" --daemon health 2>&1) || health_status=$?

    if [[ ${health_status} -ne 0 ]]; then
        log_error "Daemon health check failed:"
        echo "${health_output}"
        return 1
    fi

    log_info "MCP daemon is running and healthy."
}

handle_bun_setup() {
    if [[ "${BUN_INSTALLED}" == "true" ]]; then
        return 0
    fi

    # If INSTALL_BUN was explicitly set (e.g., by development preset), skip Yes/No confirmation
    if [[ "${INSTALL_BUN}" == "true" ]]; then
        if install_bun "true"; then
            if command_exists bun; then
                BUN_INSTALLED=true
                CHANGES_MADE=true
            fi
        fi
        return 0
    fi

    # Otherwise, prompt the user (install_bun handles the Yes/No prompt)
    if [[ "${NON_INTERACTIVE}" != "true" ]]; then
        if install_bun; then
            if command_exists bun; then
                BUN_INSTALLED=true
                CHANGES_MADE=true
            fi
        fi
    fi

    return 0
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

    # Only ask about CLI install if not already installed
    if [[ "${CLI_ALREADY_INSTALLED}" != "true" ]]; then
        if gum confirm "Install AutoMobile CLI (auto-mobile command) globally?"; then
            INSTALL_AUTOMOBILE_CLI=true
        fi
    fi

    # Only ask about daemon if not already running
    if [[ "${DAEMON_ALREADY_RUNNING}" != "true" ]]; then
        if gum confirm "Start MCP daemon and verify health?"; then
            START_DAEMON=true
        fi
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

install_bun_curl() {
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
    rm -rf "${temp_dir}"
    return 0
}

install_bun_homebrew() {
    # Add the oven-sh/bun tap if not already added
    if ! brew tap 2>/dev/null | grep -q "oven-sh/bun"; then
        if ! run_spinner "Adding Homebrew tap oven-sh/bun" brew tap oven-sh/bun; then
            log_error "Failed to add Homebrew tap."
            return 1
        fi
    fi

    if ! run_spinner "Installing Bun via Homebrew" brew install oven-sh/bun/bun; then
        log_error "Bun installation via Homebrew failed."
        return 1
    fi

    return 0
}

install_bun_npm() {
    if ! run_spinner "Installing Bun via npm" npm install -g bun; then
        log_error "Bun installation via npm failed."
        return 1
    fi

    return 0
}

install_bun() {
    local skip_confirm="${1:-false}"  # If true, skip the Yes/No prompt (already confirmed)
    local os
    os=$(detect_os)
    local install_method="curl"

    # Build list of available installation methods
    local options=()
    options+=("Official installer (curl | bash)")
    if [[ "${os}" == "macos" ]] && command_exists brew; then
        options+=("Homebrew (brew install)")
    fi
    if command_exists npm; then
        options+=("npm (npm install -g)")
    fi

    # Ask user which method to use
    if [[ "${NON_INTERACTIVE}" != "true" ]]; then
        if [[ ${#options[@]} -gt 1 ]]; then
            # Multiple options - show choose menu with Skip option
            options+=("Skip")
            local choice
            choice=$(printf '%s\n' "${options[@]}" | gum choose --header "How would you like to install Bun?")

            if [[ -z "${choice}" || "${choice}" == "Skip" ]]; then
                log_info "Skipped Bun installation"
                return 1
            fi

            case "${choice}" in
                "Homebrew"*)
                    install_method="homebrew"
                    ;;
                "npm"*)
                    install_method="npm"
                    ;;
                *)
                    install_method="curl"
                    ;;
            esac
        else
            # Only one option - ask Yes/No confirmation unless already confirmed
            if [[ "${skip_confirm}" != "true" ]]; then
                if ! gum confirm "Install Bun via official installer (curl | bash)?"; then
                    log_info "Skipped Bun installation"
                    return 1
                fi
            fi
        fi
    fi

    local install_status=0
    case "${install_method}" in
        homebrew)
            install_bun_homebrew || install_status=$?
            ;;
        npm)
            install_bun_npm || install_status=$?
            ;;
        *)
            install_bun_curl || install_status=$?
            ;;
    esac

    if [[ "${install_status}" -ne 0 ]]; then
        return 1
    fi

    if command_exists bun; then
        log_info "Bun installed: $(bun --version)"
    else
        log_warn "Bun installed but not on PATH. Restart your shell or add bun to PATH."
    fi

    return 0
}

# ============================================================================
# Preset System
# ============================================================================

# Apply a preset configuration
apply_preset() {
    local preset_name="$1"

    case "${preset_name}" in
        minimal)
            # MCP client config only - no CLI, no daemon, no IDE plugin
            INSTALL_BUN=false
            INSTALL_IDE_PLUGIN=false
            INSTALL_AUTOMOBILE_CLI=false
            START_DAEMON=false
            CONFIGURE_MCP_CLIENTS=true
            ;;
        marketplace)
            # Claude Marketplace plugin
            INSTALL_BUN=false
            INSTALL_IDE_PLUGIN=false
            INSTALL_AUTOMOBILE_CLI=false
            START_DAEMON=false
            CONFIGURE_MCP_CLIENTS=false
            INSTALL_CLAUDE_MARKETPLACE=true
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
            # Skip CLI install if already installed
            if [[ "${CLI_ALREADY_INSTALLED}" == "true" ]]; then
                INSTALL_AUTOMOBILE_CLI=false
            else
                INSTALL_AUTOMOBILE_CLI=true
            fi
            # Skip daemon start if already running
            if [[ "${DAEMON_ALREADY_RUNNING}" == "true" ]]; then
                START_DAEMON=false
            else
                START_DAEMON=true
            fi
            CONFIGURE_MCP_CLIENTS=true
            ;;
        *)
            log_error "Unknown preset: ${preset_name}"
            return 1
            ;;
    esac
}

# Check if a client base name has auto-mobile configured
# Matches "Cursor" to "Cursor (Global)" etc.
client_base_has_config() {
    local base_name="$1"
    detect_mcp_clients
    for entry in "${MCP_CLIENT_LIST[@]}"; do
        local entry_name
        entry_name=$(echo "${entry}" | cut -d'|' -f1)
        if [[ "${entry_name}" == "${base_name}"* ]]; then
            if client_has_auto_mobile "${entry_name}"; then
                return 0
            fi
        fi
    done
    return 1
}

# Interactive preset selection
select_preset() {
    local choice
    local options=()
    local has_existing_config=false

    # Check if any AI agent already has auto-mobile configured
    if [[ "${CLAUDE_MARKETPLACE_INSTALLED}" == "true" ]]; then
        has_existing_config=true
    fi
    if [[ "${has_existing_config}" != "true" ]]; then
        for agent in "Claude Code (Global)" "Claude Desktop" "Cursor" "Windsurf" "VS Code" "Codex" "Firebender" "Goose"; do
            if client_base_has_config "${agent}"; then
                has_existing_config=true
                break
            fi
        done
    fi

    # Keep current setup option first (only if there are existing configs)
    if [[ "${has_existing_config}" == "true" ]]; then
        options+=("Keep current AI agent setup")
    fi

    # Claude marketplace option if Claude CLI is installed
    if [[ "${CLAUDE_CLI_INSTALLED}" == "true" ]]; then
        if [[ "${CLAUDE_MARKETPLACE_INSTALLED}" == "true" ]]; then
            options+=("Claude Marketplace (configured)")
        else
            options+=("Claude Marketplace")
        fi
    fi

    # AI Agent MCP client options - only show installed agents with config status
    if is_claude_code_installed; then
        if client_base_has_config "Claude Code (Global)"; then
            options+=("Claude Code (configured)")
        else
            options+=("Claude Code")
        fi
    fi
    if is_claude_desktop_installed; then
        if client_base_has_config "Claude Desktop"; then
            options+=("Claude Desktop (configured)")
        else
            options+=("Claude Desktop")
        fi
    fi
    if is_cursor_installed; then
        if client_base_has_config "Cursor"; then
            options+=("Cursor (configured)")
        else
            options+=("Cursor")
        fi
    fi
    if is_windsurf_installed; then
        if client_base_has_config "Windsurf"; then
            options+=("Windsurf (configured)")
        else
            options+=("Windsurf")
        fi
    fi
    if is_vscode_installed; then
        if client_base_has_config "VS Code"; then
            options+=("VS Code (configured)")
        else
            options+=("VS Code")
        fi
    fi
    if is_codex_installed; then
        if client_base_has_config "Codex"; then
            options+=("Codex (configured)")
        else
            options+=("Codex")
        fi
    fi
    if is_firebender_installed; then
        if client_base_has_config "Firebender"; then
            options+=("Firebender (configured)")
        else
            options+=("Firebender")
        fi
    fi
    if is_goose_installed; then
        if client_base_has_config "Goose"; then
            options+=("Goose (configured)")
        else
            options+=("Goose")
        fi
    fi

    # Development option (red color via ANSI)
    options+=($'\033[31mDevelopment\033[0m')

    # In dry-run or record mode, auto-select Claude Marketplace for demo recording
    if [[ "${DRY_RUN}" == "true" || "${RECORD_MODE}" == "true" ]]; then
        gum style --bold "Select installation preset:"
        sleep 0.3
        echo ""
        gum style --foreground 212 "> Claude Marketplace"
        sleep 0.2
        choice="Claude Marketplace"
    else
        choice=$(printf '%s\n' "${options[@]}" | gum filter --header "Select installation preset:" --placeholder "Type to filter...") || true
    fi

    # Handle Ctrl+C or empty selection - exit script
    if [[ -z "${choice}" ]]; then
        echo ""
        echo "Installation cancelled."
        exit 130
    fi

    case "${choice}" in
        "Keep current AI agent setup")
            log_info "Keeping current AI agent setup"
            log_info "No changes necessary"
            exit 0
            ;;
        "Claude Marketplace"*)
            PRESET="marketplace"
            apply_preset "marketplace"
            return 0
            ;;
        "Claude Code"*|"Claude Desktop"*|"Cursor"*|"Windsurf"*|"VS Code"*|"Codex"*|"Firebender"*|"Goose"*)
            # Configure specific AI agent
            PRESET="minimal"
            apply_preset "minimal"
            # Extract base client name - strip " (configured)" suffix if present
            PRESET_CLIENT_FILTER="${choice% (configured)}"
            return 0
            ;;
        *"Development"*)
            PRESET="development"
            apply_preset "development"
            return 0
            ;;
    esac

    return 1
}

main() {
    # Parse command line arguments first (before gum is available)
    parse_args "$@"

    # Early detection of existing setup (before gum)
    detect_existing_setup

    ensure_gum

    gum style --bold "AutoMobile Interactive Installer"
    play_logo_animation

    # Show mode indicators
    if [[ "${DRY_RUN}" == "true" ]]; then
        echo ""
        gum style --foreground 214 --bold "DRY-RUN MODE: No changes will be made"
        echo ""
    elif [[ "${RECORD_MODE}" == "true" ]]; then
        echo ""
        gum style --foreground 212 --bold "RECORD MODE: Auto-selecting defaults"
        echo ""
    fi

    local os
    os=$(detect_os)
    if [[ "${os}" == "unknown" ]]; then
        log_error "This installer supports macOS and Linux only."
        exit 1
    fi

    log_info "Starting setup from ${PROJECT_ROOT}"

    # =========================================================================
    # Detect current setup BEFORE asking any questions
    # =========================================================================
    echo ""
    gum style --bold "Current Setup"

    # Check Bun
    if spin_check "Checking Bun" "command -v bun >/dev/null 2>&1"; then
        BUN_INSTALLED=true
    else
        BUN_INSTALLED=false
    fi

    # Check nvm and Node.js
    # Source nvm if available but not yet loaded
    if [[ -z "${NVM_DIR:-}" ]] && [[ -d "${HOME}/.nvm" ]]; then
        export NVM_DIR="${HOME}/.nvm"
        # shellcheck source=/dev/null
        [[ -s "${NVM_DIR}/nvm.sh" ]] && source "${NVM_DIR}/nvm.sh"
    fi

    if spin_check "Checking Node.js (nvm)" "command -v node >/dev/null 2>&1"; then
        local node_version
        node_version=$(node --version 2>/dev/null || echo "unknown")
        if [[ -n "${NVM_DIR:-}" ]]; then
            log_info "Node.js: ${node_version} (via nvm)"
        else
            log_info "Node.js: ${node_version}"
        fi
    fi

    # Check Android SDK
    local adb_check="command -v adb >/dev/null 2>&1 || [[ -x \"${ANDROID_HOME:-}/platform-tools/adb\" ]] || [[ -x \"${ANDROID_SDK_ROOT:-}/platform-tools/adb\" ]] || [[ -x \"${HOME}/Library/Android/sdk/platform-tools/adb\" ]] || [[ -x \"${HOME}/Android/Sdk/platform-tools/adb\" ]]"
    if spin_check "Checking Android SDK (adb)" "${adb_check}"; then
        ANDROID_SDK_DETECTED=true
        ANDROID_SETUP_OK=true

        # Detect ANDROID_HOME
        local detected_android_home=""
        if [[ -n "${ANDROID_HOME:-}" ]]; then
            detected_android_home="${ANDROID_HOME}"
        elif [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then
            detected_android_home="${ANDROID_SDK_ROOT}"
        elif [[ -d "${HOME}/Library/Android/sdk" ]]; then
            detected_android_home="${HOME}/Library/Android/sdk"
        elif [[ -d "${HOME}/Android/Sdk" ]]; then
            detected_android_home="${HOME}/Android/Sdk"
        fi

        if [[ -n "${detected_android_home}" ]]; then
            log_info "Android SDK path: ${detected_android_home}"

            # Offer to set ANDROID_HOME in shell profile if not already set
            if [[ "${ANDROID_HOME_FROM_ENV}" != "true" ]]; then
                offer_android_home_shell_setup "${detected_android_home}"
            fi

            # List available AVDs with API levels
            local emulator_path="${detected_android_home}/emulator/emulator"
            if [[ -x "${emulator_path}" ]]; then
                local avd_list
                avd_list=$("${emulator_path}" -list-avds 2>/dev/null | head -10 || true)
                if [[ -n "${avd_list}" ]]; then
                    # Get API levels for each AVD
                    local avd_info=""
                    while IFS= read -r avd_name; do
                        if [[ -n "${avd_name}" ]]; then
                            local avd_ini="${HOME}/.android/avd/${avd_name}.avd/config.ini"
                            local api_level=""
                            if [[ -f "${avd_ini}" ]]; then
                                api_level=$(grep -o 'image.sysdir.1=.*android-[0-9]*' "${avd_ini}" 2>/dev/null | grep -o 'android-[0-9]*' | head -1 || true)
                                api_level="${api_level#android-}"
                            fi
                            if [[ -n "${api_level}" ]]; then
                                avd_info="${avd_info}${avd_name} (API ${api_level}),"
                            else
                                avd_info="${avd_info}${avd_name},"
                            fi
                        fi
                    done <<< "${avd_list}"
                    avd_info="${avd_info%,}"  # Remove trailing comma
                    if [[ -n "${avd_info}" ]]; then
                        log_info "Android AVDs available: ${avd_info}"
                    fi
                fi
            fi
        fi
    else
        ANDROID_SDK_DETECTED=false
    fi

    # Check iOS setup (macOS only)
    if [[ "${os}" == "macos" ]]; then
        # Check Xcode
        if spin_check "Checking Xcode" "command -v xcodebuild >/dev/null 2>&1"; then
            local xcode_version
            xcode_version=$(xcodebuild -version 2>/dev/null | head -1 || true)
            if [[ -n "${xcode_version}" ]]; then
                log_info "Xcode detected: ${xcode_version}"
            fi

            # Check Command Line Tools
            if spin_check "Checking Command Line Tools" "xcode-select -p >/dev/null 2>&1"; then
                local clt_path
                clt_path=$(xcode-select -p 2>/dev/null || true)
                log_info "Command Line Tools path: ${clt_path}"

                # Check iOS runtimes
                local runtimes
                runtimes=$(xcrun simctl list runtimes 2>/dev/null | grep -o 'iOS [0-9.]*' | tr '\n' ',' | sed 's/,$//' || true)
                if [[ -n "${runtimes}" ]]; then
                    log_info "iOS runtimes available: ${runtimes}"
                fi

                IOS_SETUP_OK=true
            fi
        fi
    fi

    # Check AutoMobile CLI
    if [[ "${CLI_ALREADY_INSTALLED}" == "true" ]]; then
        log_info "Checking AutoMobile CLI: installed"
    else
        log_info "Checking AutoMobile CLI: not installed"
    fi

    # Check MCP daemon
    if [[ "${DAEMON_ALREADY_RUNNING}" == "true" ]]; then
        log_info "Checking MCP daemon: running"
    else
        log_info "Checking MCP daemon: not running"
    fi

    # Check Claude CLI and marketplace
    if [[ "${CLAUDE_CLI_INSTALLED}" == "true" ]]; then
        # Check marketplace plugin (deferred from early detection because it's a slow network call)
        if spin_check "Checking Claude marketplace plugin" "claude plugin marketplace list 2>/dev/null | grep -q 'auto-mobile' 2>/dev/null"; then
            CLAUDE_MARKETPLACE_INSTALLED=true
            log_info "Claude CLI: installed (marketplace plugin installed)"
        else
            log_info "Claude CLI: installed"
        fi
    else
        log_info "Checking Claude CLI: not installed"
    fi

    echo ""

    # =========================================================================
    # Handle preset mode
    # =========================================================================
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

    # Only do interactive platform/component selection if using Custom preset
    local platform_choice="Skip platform setup"
    if [[ -z "${PRESET}" ]] && [[ "${NON_INTERACTIVE}" != "true" ]] && [[ "${CONFIGURE_MCP_CLIENTS}" != "true" || "${INSTALL_BUN}" != "true" ]]; then
        # Determine if we need to ask about platform setup
        local need_platform_choice=false
        local platform_options=()

        if [[ "${os}" == "macos" ]]; then
            # macOS can have both Android and iOS
            if [[ "${ANDROID_SETUP_OK}" == "true" && "${IOS_SETUP_OK}" == "true" ]]; then
                # Both platforms fully setup - skip the question
                log_info "Both Android and iOS environments detected and ready"
                platform_choice="Both"
            else
                need_platform_choice=true
                # Build options based on what's missing
                if [[ "${ANDROID_SETUP_OK}" != "true" ]]; then
                    platform_options+=("Android")
                fi
                if [[ "${IOS_SETUP_OK}" != "true" ]]; then
                    platform_options+=("iOS")
                fi
                if [[ "${ANDROID_SETUP_OK}" != "true" && "${IOS_SETUP_OK}" != "true" ]]; then
                    platform_options+=("Both")
                fi

                # Add skip option with current status
                local skip_label="Skip"
                if [[ "${ANDROID_SETUP_OK}" == "true" ]]; then
                    skip_label="Skip (Android ready)"
                elif [[ "${IOS_SETUP_OK}" == "true" ]]; then
                    skip_label="Skip (iOS ready)"
                else
                    skip_label="Skip (no platform setup)"
                fi
                platform_options+=("${skip_label}")
            fi
        else
            # Non-macOS - only Android is available
            if [[ "${ANDROID_SETUP_OK}" == "true" ]]; then
                log_info "Android environment detected and ready"
                platform_choice="Android"
            else
                need_platform_choice=true
                platform_options+=("Android")
                platform_options+=("Skip (no platform setup)")
            fi
        fi

        if [[ "${need_platform_choice}" == "true" ]]; then
            platform_choice=$(printf '%s\n' "${platform_options[@]}" | gum choose --header "Platform setup:")
            # Normalize skip choices
            if [[ "${platform_choice}" == Skip* ]]; then
                platform_choice="Skip platform setup"
            fi
        fi

        collect_choices
    else
        # Set platform_choice based on IDE plugin installation (for preset mode)
        if [[ "${INSTALL_IDE_PLUGIN}" == "true" ]]; then
            platform_choice="Android"
        fi
    fi

    # MCP Client Configuration (new feature!)
    if [[ "${CONFIGURE_MCP_CLIENTS}" == "true" ]]; then
        echo ""
        gum style --bold "MCP Client Configuration"
        echo ""

        if [[ -n "${PRESET_CLIENT_FILTER}" ]]; then
            # User selected a specific AI agent - auto-configure matching clients
            detect_mcp_clients
            local matching_clients=()
            for entry in "${MCP_CLIENT_LIST[@]}"; do
                local entry_name
                entry_name=$(echo "${entry}" | cut -d'|' -f1)
                # Match clients that start with the filter (e.g., "Cursor" matches "Cursor (Global)")
                if [[ "${entry_name}" == "${PRESET_CLIENT_FILTER}"* ]]; then
                    matching_clients+=("${entry_name}")
                fi
            done

            if [[ ${#matching_clients[@]} -gt 0 ]]; then
                SELECTED_MCP_CLIENTS=("${matching_clients[@]}")
                log_info "Configuring ${PRESET_CLIENT_FILTER}..."
                configure_selected_mcp_clients
            else
                log_warn "No ${PRESET_CLIENT_FILTER} installation detected."
                log_info "Install ${PRESET_CLIENT_FILTER} first, then run this installer again."
            fi
        elif [[ "${NON_INTERACTIVE}" == "true" ]]; then
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
            # Only run setup if not already detected as ready
            if [[ "${ANDROID_SETUP_OK}" != "true" ]]; then
                check_android_sdk
            fi
            if [[ "${INSTALL_IDE_PLUGIN}" == "true" ]]; then
                install_ide_plugin
            fi
            ;;
        iOS)
            # Only run setup if not already detected as ready
            if [[ "${IOS_SETUP_OK}" != "true" ]]; then
                run_ios_setup
            fi
            ;;
        Both)
            # Only run setup for platforms not already detected as ready
            if [[ "${ANDROID_SETUP_OK}" != "true" ]]; then
                check_android_sdk
            fi
            if [[ "${INSTALL_IDE_PLUGIN}" == "true" ]]; then
                install_ide_plugin
            fi
            if [[ "${IOS_SETUP_OK}" != "true" ]]; then
                run_ios_setup
            fi
            ;;
    esac

    # CLI installation
    if [[ "${INSTALL_AUTOMOBILE_CLI}" == "true" ]]; then
        install_auto_mobile_cli
    fi

    # Claude Marketplace plugin installation
    if [[ "${INSTALL_CLAUDE_MARKETPLACE}" == "true" ]]; then
        install_claude_marketplace
    fi

    # Daemon startup
    if [[ "${START_DAEMON}" == "true" ]]; then
        start_mcp_daemon
    fi

    # Print dry-run summary if applicable
    print_dry_run_summary

    echo ""
    if [[ "${DRY_RUN}" != "true" ]]; then
        if [[ "${CHANGES_MADE}" == "true" ]]; then
            log_info "Setup complete. Get started: https://kaeawc.github.io/auto-mobile/using/ux-exploration/"
        else
            log_info "No changes necessary"
        fi
    fi
}

main "$@"
