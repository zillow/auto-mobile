#!/usr/bin/env bash
#
# Dependency detection and installation for local development.
#
# Delegates heavy lifting to scripts/install.sh (--preset local-dev),
# then performs post-install validation and local-only steps (npm link).
#
# Required variables (must be set before sourcing):
#   PROJECT_ROOT - Path to project root
#
# Functions:
#   parse_required_versions()  - Extract required versions from package.json
#   version_gte()              - Semver comparison (returns 0 if $1 >= $2)
#   ensure_gum()               - Check gum availability (installed by install.sh)
#   ensure_git_lfs()           - Install git-lfs, configure hooks, pull unresolved objects
#   ensure_auto_mobile()       - Build and npm link auto-mobile CLI
#   ensure_dev_tools()         - Install brew packages, Java, manual tools if missing
#   ensure_dependencies()      - Run all dependency checks via install.sh

# Required versions (populated by parse_required_versions)
REQUIRED_BUN_VERSION=""
REQUIRED_NODE_MAJOR=""

# Parse required versions from package.json
parse_required_versions() {
  local package_json="${PROJECT_ROOT}/package.json"

  if [[ ! -f "${package_json}" ]]; then
    log_error "package.json not found at ${package_json}"
    return 1
  fi

  # Extract bun version from packageManager field (e.g., "bun@1.3.6")
  REQUIRED_BUN_VERSION=$(grep -o '"packageManager":[[:space:]]*"bun@[^"]*"' "${package_json}" | \
    sed 's/.*bun@\([^"]*\).*/\1/' || true)

  if [[ -z "${REQUIRED_BUN_VERSION}" ]]; then
    # Fallback to engines.bun field
    REQUIRED_BUN_VERSION=$(grep -o '"bun":[[:space:]]*"[^"]*"' "${package_json}" | \
      head -1 | sed 's/.*">=\{0,1\}\([0-9.]*\).*/\1/' || true)
  fi

  # Extract node major version from @types/node (e.g., "^24.9.2" -> 24)
  REQUIRED_NODE_MAJOR=$(grep -o '"@types/node":[[:space:]]*"[^"]*"' "${package_json}" | \
    sed 's/.*"\^\{0,1\}\([0-9]*\).*/\1/' || true)

  if [[ -z "${REQUIRED_BUN_VERSION}" ]]; then
    log_warn "Could not determine required bun version from package.json"
    REQUIRED_BUN_VERSION="1.3.6"  # fallback
  fi

  if [[ -z "${REQUIRED_NODE_MAJOR}" ]]; then
    log_warn "Could not determine required node version from package.json"
    REQUIRED_NODE_MAJOR="24"  # fallback
  fi

  log_info "Required versions: bun ${REQUIRED_BUN_VERSION}, node ${REQUIRED_NODE_MAJOR}.x"
}

# Compare semver versions: returns 0 if $1 >= $2
version_gte() {
  local v1="$1"
  local v2="$2"

  # Use sort -V for version comparison
  local sorted
  sorted=$(printf '%s\n%s\n' "$v1" "$v2" | sort -V | head -n1)
  [[ "$sorted" == "$v2" ]]
}

# Prompt user with gum (or fallback to read)
# In non-interactive mode (no TTY), returns based on default value
prompt_confirm() {
  local message="$1"
  local default="${2:-yes}"

  # Check if we have a TTY for interactive prompts
  if [[ ! -t 0 ]]; then
    # Non-interactive mode: use default value
    log_info "${message} (auto-accepting: ${default})"
    [[ "${default}" == "yes" ]]
    return
  fi

  if command -v gum >/dev/null 2>&1; then
    if [[ "${default}" == "yes" ]]; then
      gum confirm "${message}" && return 0 || return 1
    else
      gum confirm --default=false "${message}" && return 0 || return 1
    fi
  else
    # Fallback to read
    local response
    if [[ "${default}" == "yes" ]]; then
      printf "%s [Y/n] " "${message}"
      read -r response
      [[ -z "${response}" || "${response}" =~ ^[Yy] ]]
    else
      printf "%s [y/N] " "${message}"
      read -r response
      [[ "${response}" =~ ^[Yy] ]]
    fi
  fi
}

# Show spinner with gum (or fallback to simple message)
run_with_spinner() {
  local title="$1"
  shift

  if command -v gum >/dev/null 2>&1; then
    gum spin --spinner dot --title "${title}" -- "$@"
  else
    log_info "${title}..."
    "$@"
  fi
}

# Check gum availability (install.sh handles actual installation)
ensure_gum() {
  command -v gum >/dev/null 2>&1
}

# Build and install auto-mobile globally from local project
ensure_auto_mobile() {
  # Always build the project to pick up latest changes
  log_info "Building TypeScript project..."
  if ! (cd "${PROJECT_ROOT}" && bunx turbo run build --output-logs=errors-only); then
    log_error "Failed to build TypeScript project."
    return 1
  fi

  # Always reinstall globally to pick up changes
  log_info "Installing auto-mobile globally via npm link..."
  if (cd "${PROJECT_ROOT}" && npm link 2>/dev/null); then
    if command -v auto-mobile >/dev/null 2>&1; then
      log_info "auto-mobile CLI installed globally."
      return 0
    fi
  fi

  log_error "Failed to install auto-mobile globally."
  log_error "Try running manually: cd ${PROJECT_ROOT} && npm link"
  return 1
}

# Install a Homebrew package if the command is not already available.
# Usage: brew_install_if_missing <command_name> [<brew_package_name>]
# If brew_package_name is omitted, command_name is used.
brew_install_if_missing() {
  local cmd="$1"
  local pkg="${2:-$1}"

  if command -v "${cmd}" >/dev/null 2>&1; then
    return 0
  fi

  if ! command -v brew >/dev/null 2>&1; then
    log_warn "${cmd} not found and Homebrew not available — skipping"
    return 1
  fi

  log_info "Installing ${pkg} via Homebrew..."
  if brew install "${pkg}"; then
    log_info "${pkg} installed"
  else
    log_warn "Failed to install ${pkg}"
    return 1
  fi
}

# Install a Homebrew cask if the command/directory is not detected.
brew_cask_install_if_missing() {
  local check_cmd="$1"
  local cask="$2"

  if command -v "${check_cmd}" >/dev/null 2>&1; then
    return 0
  fi

  if ! command -v brew >/dev/null 2>&1; then
    log_warn "${check_cmd} not found and Homebrew not available — skipping"
    return 1
  fi

  log_info "Installing ${cask} via Homebrew cask..."
  if brew install --cask "${cask}"; then
    log_info "${cask} installed"
  else
    log_warn "Failed to install ${cask}"
    return 1
  fi
}

# Ensure git-lfs is installed and configured for this repository.
# In non-interactive mode, exits non-zero with install instructions.
# In interactive mode, prompts to install via Homebrew, then runs git lfs install
# and git lfs pull if unresolved LFS objects are detected.
ensure_git_lfs() {
  if ! git lfs version >/dev/null 2>&1; then
    if [[ ! -t 0 ]]; then
      log_error "git-lfs is not installed. Without it, ~1,800 LFS-tracked source files will be missing."
      log_error "Install it with:"
      log_error "  brew install git-lfs && git lfs install && git lfs pull"
      return 1
    fi

    if ! prompt_confirm "git-lfs is not installed. Install it now via Homebrew?" "yes"; then
      log_error "git-lfs is required. Run: brew install git-lfs && git lfs install && git lfs pull"
      return 1
    fi

    if ! brew_install_if_missing git-lfs git-lfs; then
      log_error "Failed to install git-lfs. Run: brew install git-lfs"
      return 1
    fi
  fi

  log_info "Configuring git-lfs for this repository..."
  if ! git -C "${PROJECT_ROOT}" lfs install 2>/dev/null; then
    log_warn "git lfs install failed — LFS hooks may not be active"
  fi

  local unresolved
  unresolved=$(git -C "${PROJECT_ROOT}" lfs ls-files 2>/dev/null | grep -c " - " || true)
  if [[ "${unresolved}" -gt 0 ]]; then
    log_info "Found ${unresolved} unresolved LFS file(s). Running git lfs pull..."
    if ! run_with_spinner "Downloading LFS objects..." git -C "${PROJECT_ROOT}" lfs pull; then
      log_warn "git lfs pull encountered errors — some LFS files may still be missing"
    fi
  else
    log_info "All LFS objects present."
  fi
}

# Ensure all development tools that clean-env-uninstall.sh removes are present.
# Installs missing tools via Homebrew, project install scripts, or gem.
ensure_dev_tools() {
  log_info "Checking development tools..."

  local missing=0

  # --- Homebrew packages ---------------------------------------------------
  brew_install_if_missing rg        ripgrep     || ((missing++)) || true
  brew_install_if_missing shellcheck shellcheck  || ((missing++)) || true
  brew_install_if_missing jq        jq          || ((missing++)) || true
  brew_install_if_missing ffmpeg    ffmpeg       || ((missing++)) || true
  brew_install_if_missing xmlstarlet xmlstarlet  || ((missing++)) || true
  brew_install_if_missing swiftformat swiftformat || ((missing++)) || true
  brew_install_if_missing swiftlint swiftlint    || ((missing++)) || true
  brew_install_if_missing xcodegen  xcodegen     || ((missing++)) || true
  brew_install_if_missing yq        yq           || ((missing++)) || true
  brew_install_if_missing gum       gum          || ((missing++)) || true
  brew_install_if_missing hadolint  hadolint     || ((missing++)) || true
  brew_install_if_missing vips      vips         || ((missing++)) || true

  # --- Java 21 (needed for Gradle / Android builds) -----------------------
  if ! java -version 2>&1 | grep -q 'version "21'; then
    log_info "Java 21 not detected"
    brew_cask_install_if_missing java zulu-jdk21 || ((missing++)) || true
  fi

  # --- Manual tool installs (use project install scripts) ------------------
  if ! command -v lychee >/dev/null 2>&1; then
    log_info "Installing lychee..."
    bash "${PROJECT_ROOT}/scripts/lychee/install_lychee.sh" || ((missing++)) || true
  fi

  if ! command -v ktfmt >/dev/null 2>&1; then
    log_info "Installing ktfmt..."
    bash "${PROJECT_ROOT}/scripts/ktfmt/install_ktfmt.sh" || ((missing++)) || true
  fi

  if [[ "${missing}" -gt 0 ]]; then
    log_warn "${missing} tool(s) could not be installed — some features may be unavailable"
  else
    log_info "All development tools present."
  fi

  return 0
}

# Run all dependency checks via install.sh
ensure_dependencies() {
  log_info "Checking dependencies..."

  # Delegate to install.sh for gum, node, bun, and npm install
  local env_file
  env_file=$(mktemp)

  log_info "Running install.sh --preset local-dev..."
  if ! bash "${PROJECT_ROOT}/scripts/install.sh" \
    --preset local-dev \
    --non-interactive \
    --env-file "${env_file}"; then
    log_error "install.sh failed"
    rm -f "${env_file}"
    return 1
  fi

  # Source environment changes (PATH, NVM_DIR, ANDROID_HOME)
  if [[ -f "${env_file}" ]]; then
    # shellcheck disable=SC1090
    source "${env_file}"
    rm -f "${env_file}"
  fi

  # Post-install validation
  parse_required_versions

  # Verify node meets requirements
  if command -v node >/dev/null 2>&1; then
    local node_major
    node_major=$(node --version | sed 's/^v//' | cut -d. -f1)
    if [[ "${node_major}" -lt "${REQUIRED_NODE_MAJOR}" ]]; then
      log_error "Node.js v${node_major}.x found but v${REQUIRED_NODE_MAJOR}.x required after install"
      return 1
    fi
    log_info "Node.js $(node --version) verified"
  else
    log_error "Node.js not found after install"
    return 1
  fi

  # Verify bun meets requirements
  if command -v bun >/dev/null 2>&1; then
    local bun_version
    bun_version=$(bun --version 2>/dev/null || true)
    if ! version_gte "${bun_version}" "${REQUIRED_BUN_VERSION}"; then
      log_error "Bun v${bun_version} found but v${REQUIRED_BUN_VERSION} required after install"
      return 1
    fi
    log_info "Bun v${bun_version} verified"
  else
    log_error "Bun not found after install"
    return 1
  fi

  # Install development tools (brew packages, Java, manual installs)
  ensure_dev_tools

  # Ensure git-lfs is installed and LFS objects are checked out
  if ! ensure_git_lfs; then
    log_error "git-lfs setup failed."
    return 1
  fi

  # Build and npm link auto-mobile (local-dev specific)
  if ! ensure_auto_mobile; then
    log_error "auto-mobile global installation failed."
    return 1
  fi

  log_info "All dependencies satisfied."
  return 0
}
