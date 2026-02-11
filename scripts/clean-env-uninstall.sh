#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Handle Ctrl-C (SIGINT) - exit immediately
trap 'echo ""; echo "Clean environment uninstall cancelled."; exit 130' INT

# Handle piped execution
if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
    SCRIPT_DIR="$(pwd)"
fi

# ============================================================================
# Global State
# ============================================================================
ALL=false
DRY_RUN=false
FORCE=false
CHANGES_MADE=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
DIM='\033[2m'
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

log_dry() {
    echo -e "${DIM}[DRY-RUN]${RESET} $*"
}

# ============================================================================
# CLI Argument Parsing
# ============================================================================
show_help() {
    cat << 'EOF'
AutoMobile Clean Environment Uninstaller

Removes AutoMobile AND all environment dependencies so you can verify the
install script bootstraps a machine from scratch.

Usage: ./scripts/clean-env-uninstall.sh [OPTIONS]

Options:
  --all               Remove all categories (skip interactive prompts)
  --dry-run           Show what would be removed without making changes
  --force             Skip confirmation prompts
  -h, --help          Show this help message

Categories:
  1. AutoMobile components   (delegates to scripts/uninstall.sh --all)
  2. Bun                     (~/.bun/, Homebrew tap, npm global)
  3. Node.js / nvm           (~/.nvm/, Homebrew node)
  4. Homebrew packages        (ripgrep, shellcheck, jq, ffmpeg, xmlstarlet,
                               swiftformat, swiftlint, xcodegen, yq, gum,
                               hadolint, vips)
  5. Java 21                 (Homebrew zulu-jdk or detected JDK)
  6. Manual tool installs    (lychee, ktfmt, hadolint, swiftformat, swiftlint
                               in ~/.local/bin; xcpretty gem)

Examples:
  ./scripts/clean-env-uninstall.sh                    # Interactive mode
  ./scripts/clean-env-uninstall.sh --dry-run          # Preview what would be removed
  ./scripts/clean-env-uninstall.sh --all --dry-run    # Preview all categories
  ./scripts/clean-env-uninstall.sh --all --force      # Remove everything, no prompts

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
# Confirmation helper
# ============================================================================
confirm_category() {
    local category_name="$1"
    local details="$2"

    if [[ "${ALL}" == "true" && "${FORCE}" == "true" ]]; then
        return 0
    fi

    if [[ "${DRY_RUN}" == "true" ]]; then
        return 0
    fi

    if [[ "${ALL}" == "true" ]]; then
        return 0
    fi

    echo ""
    echo -e "${BOLD}${category_name}${RESET}"
    if [[ -n "${details}" ]]; then
        echo -e "${DIM}${details}${RESET}"
    fi

    if [[ "${FORCE}" == "true" ]]; then
        return 0
    fi

    read -p "Remove? [y/N] " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]]
}

# ============================================================================
# Execute or dry-run a command
# ============================================================================
run_cmd() {
    if [[ "${DRY_RUN}" == "true" ]]; then
        log_dry "Would run: $*"
        return 0
    fi
    "$@"
    CHANGES_MADE=true
}

# ============================================================================
# Category 1: AutoMobile components (delegate to uninstall.sh)
# ============================================================================
remove_automobile() {
    local details="Delegates to scripts/uninstall.sh --all"

    if ! confirm_category "1. AutoMobile components" "${details}"; then
        log_info "Skipping AutoMobile components"
        return 0
    fi

    local uninstall_script="${SCRIPT_DIR}/uninstall.sh"
    if [[ ! -x "${uninstall_script}" ]]; then
        log_warn "scripts/uninstall.sh not found or not executable, skipping"
        return 0
    fi

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_dry "Would run: ${uninstall_script} --all --force --dry-run"
        "${uninstall_script}" --all --force --dry-run 2>/dev/null || true
    else
        log_info "Running AutoMobile uninstaller..."
        "${uninstall_script}" --all --force || true
        CHANGES_MADE=true
    fi
}

# ============================================================================
# Category 2: Bun
# ============================================================================
remove_bun() {
    local found=()

    if [[ -d "${HOME}/.bun" ]]; then
        # shellcheck disable=SC2088 # Tilde is intentional for display purposes
        found+=("~/.bun/ directory")
    fi
    if command_exists brew && brew list oven-sh/bun/bun >/dev/null 2>&1; then
        found+=("Homebrew: oven-sh/bun/bun")
    fi
    if command_exists npm && npm list -g @anthropic-ai/bun 2>/dev/null | grep -q bun; then
        found+=("npm global bun package")
    fi

    if [[ ${#found[@]} -eq 0 ]]; then
        log_info "Bun: not found"
        return 0
    fi

    local details
    details=$(printf '  - %s\n' "${found[@]}")

    if ! confirm_category "2. Bun" "${details}"; then
        log_info "Skipping Bun"
        return 0
    fi

    # Remove Homebrew bun and tap
    if command_exists brew; then
        if brew list oven-sh/bun/bun >/dev/null 2>&1; then
            run_cmd brew uninstall oven-sh/bun/bun || true
        fi
        if brew tap 2>/dev/null | grep -q "oven-sh/bun"; then
            run_cmd brew untap oven-sh/bun || true
        fi
    fi

    # Remove npm global bun if present
    if command_exists npm && npm list -g bun >/dev/null 2>&1; then
        run_cmd npm uninstall -g bun || true
    fi

    # Remove ~/.bun directory
    if [[ -d "${HOME}/.bun" ]]; then
        run_cmd rm -rf "${HOME}/.bun"
    fi

    log_info "Bun removed"
}

# ============================================================================
# Category 3: Node.js / nvm
# ============================================================================
remove_node_nvm() {
    local found=()

    if [[ -d "${HOME}/.nvm" ]]; then
        # shellcheck disable=SC2088 # Tilde is intentional for display purposes
        found+=("~/.nvm/ directory")
    fi
    if command_exists brew && brew list node >/dev/null 2>&1; then
        found+=("Homebrew: node")
    fi

    if [[ ${#found[@]} -eq 0 ]]; then
        log_info "Node.js / nvm: not found"
        return 0
    fi

    local details
    details=$(printf '  - %s\n' "${found[@]}")

    if ! confirm_category "3. Node.js / nvm" "${details}"; then
        log_info "Skipping Node.js / nvm"
        return 0
    fi

    # Remove Homebrew node
    if command_exists brew && brew list node >/dev/null 2>&1; then
        run_cmd brew uninstall --ignore-dependencies node || true
    fi

    # Remove nvm directory
    if [[ -d "${HOME}/.nvm" ]]; then
        run_cmd rm -rf "${HOME}/.nvm"
    fi

    log_info "Node.js / nvm removed"
}

# ============================================================================
# Category 4: Homebrew packages
# ============================================================================
remove_homebrew_packages() {
    if ! command_exists brew; then
        log_info "Homebrew packages: brew not found, skipping"
        return 0
    fi

    local packages=(
        ripgrep
        shellcheck
        jq
        ffmpeg
        xmlstarlet
        swiftformat
        swiftlint
        xcodegen
        yq
        gum
        hadolint
        vips
    )

    local installed=()
    for pkg in "${packages[@]}"; do
        if brew list "${pkg}" >/dev/null 2>&1; then
            installed+=("${pkg}")
        fi
    done

    if [[ ${#installed[@]} -eq 0 ]]; then
        log_info "Homebrew packages: none of the target packages installed"
        return 0
    fi

    local details
    details=$(printf '  - %s\n' "${installed[@]}")

    if ! confirm_category "4. Homebrew packages" "${details}"; then
        log_info "Skipping Homebrew packages"
        return 0
    fi

    for pkg in "${installed[@]}"; do
        run_cmd brew uninstall --ignore-dependencies "${pkg}" || true
    done

    log_info "Homebrew packages removed"
}

# ============================================================================
# Category 5: Java 21
# ============================================================================
remove_java() {
    local found=()

    # Check for Homebrew zulu-jdk
    if command_exists brew; then
        # Zulu JDK cask names
        for cask in zulu-jdk21 zulu-jdk zulu21 zulu; do
            if brew list --cask "${cask}" >/dev/null 2>&1; then
                found+=("Homebrew cask: ${cask}")
            fi
        done
    fi

    # Check for JDK 21 in standard macOS location
    local jvm_dir="/Library/Java/JavaVirtualMachines"
    if [[ -d "${jvm_dir}" ]]; then
        while IFS= read -r -d '' jdk; do
            local jdk_name
            jdk_name=$(basename "${jdk}")
            if [[ "${jdk_name}" == *"21"* || "${jdk_name}" == *"zulu"* ]]; then
                found+=("${jvm_dir}/${jdk_name}")
            fi
        done < <(find "${jvm_dir}" -maxdepth 1 -type d \( -name '*21*' -o -name '*zulu*' \) -print0 2>/dev/null)
    fi

    if [[ ${#found[@]} -eq 0 ]]; then
        log_info "Java 21: not found"
        return 0
    fi

    local details
    details=$(printf '  - %s\n' "${found[@]}")

    if ! confirm_category "5. Java 21" "${details}"; then
        log_info "Skipping Java 21"
        return 0
    fi

    # Remove Homebrew casks
    if command_exists brew; then
        for cask in zulu-jdk21 zulu-jdk zulu21 zulu; do
            if brew list --cask "${cask}" >/dev/null 2>&1; then
                run_cmd brew uninstall --cask "${cask}" || true
            fi
        done
    fi

    # Remove JDK directories (requires sudo)
    if [[ -d "${jvm_dir}" ]]; then
        while IFS= read -r -d '' jdk; do
            local jdk_name
            jdk_name=$(basename "${jdk}")
            if [[ "${jdk_name}" == *"21"* || "${jdk_name}" == *"zulu"* ]]; then
                if [[ "${DRY_RUN}" == "true" ]]; then
                    log_dry "Would run: sudo rm -rf ${jdk}"
                else
                    log_info "Removing ${jdk_name} (requires sudo)..."
                    sudo rm -rf "${jdk}"
                    CHANGES_MADE=true
                fi
            fi
        done < <(find "${jvm_dir}" -maxdepth 1 -type d \( -name '*21*' -o -name '*zulu*' \) -print0 2>/dev/null)
    fi

    log_info "Java 21 removed"
}

# ============================================================================
# Category 6: Manual tool installs
# ============================================================================
remove_manual_tools() {
    local found=()
    local local_bin="${HOME}/.local/bin"

    # Check ~/.local/bin for manually installed tools
    local manual_binaries=(lychee ktfmt hadolint swiftformat swiftlint)
    for tool in "${manual_binaries[@]}"; do
        if [[ -f "${local_bin}/${tool}" ]]; then
            # shellcheck disable=SC2088
            found+=("~/.local/bin/${tool}")
        fi
    done

    # Check for ktfmt JAR files
    for jar in "${local_bin}"/ktfmt-*.jar; do
        if [[ -f "${jar}" ]]; then
            local jar_name
            jar_name=$(basename "${jar}")
            # shellcheck disable=SC2088
            found+=("~/.local/bin/${jar_name}")
        fi
    done

    # Check for xcpretty gem
    if command_exists xcpretty; then
        found+=("xcpretty (Ruby gem)")
    fi

    if [[ ${#found[@]} -eq 0 ]]; then
        log_info "Manual tool installs: nothing found"
        return 0
    fi

    local details
    details=$(printf '  - %s\n' "${found[@]}")

    if ! confirm_category "6. Manual tool installs" "${details}"; then
        log_info "Skipping manual tool installs"
        return 0
    fi

    # Remove binaries from ~/.local/bin
    for tool in "${manual_binaries[@]}"; do
        if [[ -f "${local_bin}/${tool}" ]]; then
            run_cmd rm -f "${local_bin}/${tool}"
        fi
    done

    # Remove ktfmt JARs
    for jar in "${local_bin}"/ktfmt-*.jar; do
        if [[ -f "${jar}" ]]; then
            run_cmd rm -f "${jar}"
        fi
    done

    # Remove xcpretty gem
    if command_exists xcpretty; then
        run_cmd gem uninstall xcpretty --all --executables || true
    fi

    log_info "Manual tool installs removed"
}

# ============================================================================
# Main
# ============================================================================
main() {
    parse_args "$@"

    echo ""
    echo -e "${BOLD}AutoMobile Clean Environment Uninstaller${RESET}"
    echo -e "${DIM}Removes AutoMobile and all environment dependencies${RESET}"
    echo ""

    if [[ "${DRY_RUN}" == "true" ]]; then
        echo -e "${YELLOW}${BOLD}DRY-RUN MODE: No changes will be made${RESET}"
        echo ""
    fi

    echo -e "${YELLOW}WARNING: This script removes development tools and SDKs from your system.${RESET}"
    echo -e "${YELLOW}It is intended for verifying the install script on a clean environment.${RESET}"
    echo ""

    if [[ "${ALL}" != "true" && "${DRY_RUN}" != "true" && "${FORCE}" != "true" ]]; then
        read -p "Continue? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Cancelled."
            exit 0
        fi
    fi

    remove_automobile
    remove_bun
    remove_node_nvm
    remove_homebrew_packages
    remove_java
    remove_manual_tools

    # Summary
    echo ""
    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "Dry-run complete. No changes were made."
    elif [[ "${CHANGES_MADE}" == "true" ]]; then
        log_info "Clean environment uninstall complete."
        echo ""
        log_info "Open a new terminal for PATH changes to take effect."
    else
        log_info "No changes were necessary."
    fi
}

main "$@"
