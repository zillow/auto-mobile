#!/usr/bin/env bash
#
# AutoMobile Worktree Teardown Script
#
# Removes worktree-specific artifacts:
# - Unique executable symlink (~/.bun/bin/auto-mobile-{issue})
# - MCP config (.mcp.json)
# - Build artifacts (dist/)
#
# Usage:
#   ./scripts/teardown-worktree.sh           # Remove all artifacts
#   ./scripts/teardown-worktree.sh --keep-dist  # Keep dist/ directory
#

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Extract issue number from branch name
get_issue_number() {
    local branch
    branch=$(git -C "${PROJECT_ROOT}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

    local issue
    issue=$(echo "${branch}" | grep -oE '[0-9]+' | head -1 || echo "")

    if [[ -n "${issue}" && "${issue}" -gt 0 && "${issue}" -lt 1000 ]]; then
        echo "${issue}"
    else
        echo ""
    fi
}

# Get unique identifier for this worktree
get_worktree_id() {
    local issue
    issue=$(get_issue_number)

    if [[ -n "${issue}" ]]; then
        echo "${issue}"
    else
        # Fallback: use short hash of project path
        echo "${PROJECT_ROOT}" | md5sum | cut -c1-6
    fi
}

main() {
    local keep_dist=false

    # Parse arguments
    for arg in "$@"; do
        case "${arg}" in
            --keep-dist)
                keep_dist=true
                ;;
            --help|-h)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --keep-dist  Keep the dist/ directory"
                echo "  --help       Show this help message"
                exit 0
                ;;
            *)
                echo "Unknown option: ${arg}"
                exit 1
                ;;
        esac
    done

    local worktree_id
    worktree_id=$(get_worktree_id)
    local bin_name="auto-mobile-${worktree_id}"
    local bin_path="${HOME}/.bun/bin/${bin_name}"
    local mcp_file="${PROJECT_ROOT}/.mcp.json"

    echo ""
    log_info "Tearing down AutoMobile worktree (ID: ${worktree_id})..."
    echo ""

    local removed_count=0

    # Remove symlink
    if [[ -L "${bin_path}" ]]; then
        rm "${bin_path}"
        log_success "Removed executable: ${bin_path}"
        ((removed_count++))
    else
        log_warn "Executable not found: ${bin_path}"
    fi

    # Remove MCP config
    if [[ -f "${mcp_file}" ]]; then
        rm "${mcp_file}"
        log_success "Removed MCP config: ${mcp_file}"
        ((removed_count++))
    else
        log_warn "MCP config not found: ${mcp_file}"
    fi

    # Remove dist directory (unless --keep-dist)
    if [[ "${keep_dist}" == false ]]; then
        if [[ -d "${PROJECT_ROOT}/dist" ]]; then
            rm -rf "${PROJECT_ROOT}/dist"
            log_success "Removed build artifacts: ${PROJECT_ROOT}/dist"
            ((removed_count++))
        else
            log_warn "Build artifacts not found: ${PROJECT_ROOT}/dist"
        fi
    else
        log_info "Keeping dist/ directory (--keep-dist)"
    fi

    echo ""
    if [[ ${removed_count} -gt 0 ]]; then
        log_success "Teardown complete. Removed ${removed_count} artifact(s)."
    else
        log_warn "Nothing to tear down."
    fi
    echo ""
}

main "$@"
