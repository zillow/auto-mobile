#!/usr/bin/env bash
#
# AutoMobile Worktree Setup Script
#
# Sets up a worktree for local development with:
# - Build from source
# - Unique bun-linked executable per worktree (auto-mobile-{issue})
# - Claude Code settings configured for this worktree
# - Optional hot-reload dev server
#
# Usage:
#   ./scripts/setup-worktree.sh          # Full setup
#   ./scripts/setup-worktree.sh --dev    # Setup + start dev server
#   ./scripts/setup-worktree.sh --clean  # Remove worktree-specific artifacts
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Extract issue number from branch name
get_issue_number() {
    local branch
    branch=$(git -C "${PROJECT_ROOT}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

    # Extract first number (1-999) from branch name
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

# Calculate port from issue number
get_port() {
    local issue
    issue=$(get_issue_number)

    if [[ -n "${issue}" ]]; then
        echo $((9000 + issue))
    else
        echo "9000"
    fi
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Install dependencies if needed
install_deps() {
    log_info "Checking dependencies..."

    if [[ ! -d "${PROJECT_ROOT}/node_modules" ]]; then
        log_info "Installing dependencies with bun..."
        (cd "${PROJECT_ROOT}" && bun install)
        log_success "Dependencies installed"
    else
        log_success "Dependencies already installed"
    fi
}

# Build the project
build_project() {
    log_info "Building project..."
    (cd "${PROJECT_ROOT}" && bun run build)
    log_success "Build complete: ${PROJECT_ROOT}/dist/src/index.js"
}

# Create unique symlink for this worktree
# Returns: the bin name (e.g., auto-mobile-186)
create_worktree_link() {
    local worktree_id
    worktree_id=$(get_worktree_id)
    local bin_name="auto-mobile-${worktree_id}"
    local bin_path="${HOME}/.bun/bin/${bin_name}"
    local target="${PROJECT_ROOT}/dist/src/index.js"

    # Ensure ~/.bun/bin exists
    mkdir -p "${HOME}/.bun/bin"

    # Remove existing symlink if it exists
    if [[ -L "${bin_path}" ]]; then
        rm "${bin_path}"
    fi

    # Create symlink
    ln -sf "${target}" "${bin_path}"

    # Output bin_name to stdout (for capture), logs to stderr
    log_success "Created executable: ${bin_path}" >&2
    log_info "  -> ${target}" >&2

    echo "${bin_name}"
}

# Setup Claude Code MCP config for this worktree
setup_claude_settings() {
    local bin_name="$1"
    local port
    port=$(get_port)
    local mcp_file="${PROJECT_ROOT}/.mcp.json"

    # Detect ANDROID_HOME
    local android_home="${ANDROID_HOME:-}"
    if [[ -z "${android_home}" ]]; then
        # Try common locations
        if [[ -d "${HOME}/Library/Android/sdk" ]]; then
            android_home="${HOME}/Library/Android/sdk"
        elif [[ -d "${HOME}/Android/Sdk" ]]; then
            android_home="${HOME}/Android/Sdk"
        fi
    fi

    # Create .mcp.json (project-level MCP config)
    cat > "${mcp_file}" << EOF
{
  "mcpServers": {
    "auto-mobile": {
      "type": "stdio",
      "command": "${HOME}/.bun/bin/${bin_name}",
      "args": ["--debug-perf", "--debug"],
      "env": {
        "ANDROID_HOME": "${android_home}"
      }
    }
  }
}
EOF

    log_success "Created MCP config: ${mcp_file}"
    log_info "  MCP server: ${bin_name} (stdio)"
    log_info "  Streamable port: ${port} (run 'bun run dev' for hot reload)"

    # Add .mcp.json to .gitignore if not already there
    local gitignore="${PROJECT_ROOT}/.gitignore"
    if ! grep -q "^\.mcp\.json$" "${gitignore}" 2>/dev/null; then
        echo ".mcp.json" >> "${gitignore}"
        log_info "Added .mcp.json to .gitignore"
    fi
}

# Clean up worktree-specific artifacts
clean_worktree() {
    local worktree_id
    worktree_id=$(get_worktree_id)
    local bin_name="auto-mobile-${worktree_id}"
    local bin_path="${HOME}/.bun/bin/${bin_name}"
    local mcp_file="${PROJECT_ROOT}/.mcp.json"

    log_info "Cleaning worktree artifacts..."

    # Remove symlink
    if [[ -L "${bin_path}" ]]; then
        rm "${bin_path}"
        log_success "Removed: ${bin_path}"
    fi

    # Remove MCP config
    if [[ -f "${mcp_file}" ]]; then
        rm "${mcp_file}"
        log_success "Removed: ${mcp_file}"
    fi

    # Optionally clean dist
    if [[ -d "${PROJECT_ROOT}/dist" ]]; then
        rm -rf "${PROJECT_ROOT}/dist"
        log_success "Removed: ${PROJECT_ROOT}/dist"
    fi

    log_success "Worktree cleaned"
}

# Start dev server
start_dev_server() {
    local port
    port=$(get_port)

    log_info "Starting dev server on port ${port}..."
    log_info "Press Ctrl+C to stop"
    echo ""

    (cd "${PROJECT_ROOT}" && exec bun run dev)
}

# Print status/info
print_status() {
    local worktree_id
    worktree_id=$(get_worktree_id)
    local bin_name="auto-mobile-${worktree_id}"
    local port
    port=$(get_port)
    local branch
    branch=$(git -C "${PROJECT_ROOT}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}AutoMobile Worktree Setup Complete${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "Branch:      ${BLUE}${branch}${NC}"
    echo -e "Worktree ID: ${BLUE}${worktree_id}${NC}"
    echo -e "Port:        ${BLUE}${port}${NC}"
    echo -e "Executable:  ${BLUE}${bin_name}${NC}"
    echo ""
    echo -e "${YELLOW}Quick Commands:${NC}"
    echo -e "  ${GREEN}bun run dev${NC}        Start hot-reload server (port ${port})"
    echo -e "  ${GREEN}${bin_name}${NC}  Run MCP server directly"
    echo ""
    echo -e "${YELLOW}Claude Code:${NC}"
    echo -e "  MCP config: ${BLUE}.mcp.json${NC}"
    echo -e "  Restart Claude Code to pick up the new MCP server."
    echo ""
}

# Main
main() {
    local start_dev=false
    local clean=false

    # Parse arguments
    for arg in "$@"; do
        case "${arg}" in
            --dev)
                start_dev=true
                ;;
            --clean)
                clean=true
                ;;
            --help|-h)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --dev    Setup and start hot-reload dev server"
                echo "  --clean  Remove worktree-specific artifacts"
                echo "  --help   Show this help message"
                exit 0
                ;;
            *)
                log_error "Unknown option: ${arg}"
                exit 1
                ;;
        esac
    done

    cd "${PROJECT_ROOT}"

    if [[ "${clean}" == true ]]; then
        clean_worktree
        exit 0
    fi

    echo ""
    log_info "Setting up AutoMobile worktree..."
    echo ""

    # Run setup steps
    install_deps
    build_project
    local bin_name
    bin_name=$(create_worktree_link)
    setup_claude_settings "${bin_name}"

    print_status

    if [[ "${start_dev}" == true ]]; then
        start_dev_server
    fi
}

main "$@"
