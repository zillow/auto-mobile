#!/usr/bin/env bash
#
# Dependency detection and installation for local development.
#
# Required variables (must be set before sourcing):
#   PROJECT_ROOT - Path to project root
#
# Functions:
#   parse_required_versions()  - Extract required versions from package.json
#   ensure_gum()               - Detect and install gum for interactive prompts
#   ensure_node()              - Detect and install/update node (nvm preferred)
#   ensure_bun()               - Detect and install/update bun
#   ensure_dependencies()      - Run all dependency checks

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

# Ensure gum is installed for interactive prompts
ensure_gum() {
  if command -v gum >/dev/null 2>&1; then
    return 0
  fi

  log_info "gum not found. Installing for interactive prompts..."

  if [[ "$(uname -s)" == "Darwin" ]]; then
    if command -v brew >/dev/null 2>&1; then
      log_info "Installing gum via Homebrew..."
      if brew install gum >/dev/null 2>&1; then
        log_info "gum installed successfully."
        return 0
      else
        log_warn "Failed to install gum via Homebrew."
        return 1
      fi
    fi
  elif [[ "$(uname -s)" == "Linux" ]]; then
    if command -v apt-get >/dev/null 2>&1; then
      log_info "Installing gum via apt..."
      if sudo mkdir -p /etc/apt/keyrings && \
         curl -fsSL https://repo.charm.sh/apt/gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/charm.gpg 2>/dev/null && \
         echo "deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *" | sudo tee /etc/apt/sources.list.d/charm.list >/dev/null && \
         sudo apt-get update -qq && sudo apt-get install -y -qq gum; then
        log_info "gum installed successfully."
        return 0
      fi
    elif command -v dnf >/dev/null 2>&1; then
      log_info "Installing gum via dnf..."
      if echo '[charm]
name=Charm
baseurl=https://repo.charm.sh/yum/
enabled=1
gpgcheck=1
gpgkey=https://repo.charm.sh/yum/gpg.key' | sudo tee /etc/yum.repos.d/charm.repo >/dev/null && \
         sudo dnf install -y -q gum; then
        log_info "gum installed successfully."
        return 0
      fi
    elif command -v pacman >/dev/null 2>&1; then
      log_info "Installing gum via pacman..."
      if sudo pacman -S --noconfirm gum >/dev/null 2>&1; then
        log_info "gum installed successfully."
        return 0
      fi
    fi
  fi

  log_warn "Could not auto-install gum. Falling back to basic prompts."
  log_warn "Install manually: https://github.com/charmbracelet/gum#installation"
  return 1
}

# Check if nvm has a specific node version installed
nvm_has_version() {
  local version="$1"
  # nvm ls returns installed versions; check if our major version is there
  nvm ls "${version}" 2>/dev/null | grep -q "v${version}" 2>/dev/null
}

# Offer to create .nvmrc file for the project
offer_nvmrc() {
  local nvmrc_path="${PROJECT_ROOT}/.nvmrc"

  if [[ -f "${nvmrc_path}" ]]; then
    return 0
  fi

  if prompt_confirm "Create .nvmrc file to persist Node.js version for this project?"; then
    echo "${REQUIRED_NODE_MAJOR}" > "${nvmrc_path}"
    log_info "Created ${nvmrc_path} with Node.js ${REQUIRED_NODE_MAJOR}"
  fi
}

# Ensure node is installed at the required version
ensure_node() {
  local current_version=""
  local current_major=""
  local nvmrc_path="${PROJECT_ROOT}/.nvmrc"

  # Check if node is available
  if command -v node >/dev/null 2>&1; then
    current_version=$(node --version | sed 's/^v//')
    current_major=$(echo "${current_version}" | cut -d. -f1)
  fi

  if [[ -n "${current_major}" && "${current_major}" -ge "${REQUIRED_NODE_MAJOR}" ]]; then
    log_info "Node.js v${current_version} found (requires ${REQUIRED_NODE_MAJOR}.x)"
    return 0
  fi

  if [[ -n "${current_version}" ]]; then
    log_warn "Node.js v${current_version} found, but v${REQUIRED_NODE_MAJOR}.x required"
  else
    log_warn "Node.js not found"
  fi

  # Try nvm first
  if [[ -n "${NVM_DIR:-}" ]] || [[ -d "${HOME}/.nvm" ]]; then
    local nvm_dir="${NVM_DIR:-${HOME}/.nvm}"
    if [[ -s "${nvm_dir}/nvm.sh" ]]; then
      # Source nvm
      # shellcheck disable=SC1091
      source "${nvm_dir}/nvm.sh"

      # Check if .nvmrc exists and use it
      if [[ -f "${nvmrc_path}" ]]; then
        log_info "Found .nvmrc, running nvm use..."
        if nvm use 2>/dev/null; then
          log_info "Node.js $(node --version) activated via .nvmrc"
          return 0
        fi
      fi

      # Check if required version is already installed
      if nvm_has_version "${REQUIRED_NODE_MAJOR}"; then
        log_info "Node.js ${REQUIRED_NODE_MAJOR} already installed via nvm. Switching..."
        if nvm use "${REQUIRED_NODE_MAJOR}"; then
          log_info "Node.js $(node --version) activated via nvm."
          offer_nvmrc
          return 0
        fi
      fi

      # Version not installed, prompt to install
      if prompt_confirm "Install Node.js ${REQUIRED_NODE_MAJOR} via nvm?"; then
        # nvm is a shell function, not an executable, so we can't use run_with_spinner
        # (gum spawns a subprocess that won't have the function loaded)
        log_info "Installing Node.js ${REQUIRED_NODE_MAJOR} via nvm..."
        if nvm install "${REQUIRED_NODE_MAJOR}"; then
          nvm use "${REQUIRED_NODE_MAJOR}"
          log_info "Node.js $(node --version) installed and activated via nvm."
          offer_nvmrc
          return 0
        else
          log_error "Failed to install Node.js via nvm."
        fi
      fi
    fi
  fi

  # Fallback to Homebrew on macOS
  if [[ "$(uname -s)" == "Darwin" ]] && command -v brew >/dev/null 2>&1; then
    if prompt_confirm "Install Node.js ${REQUIRED_NODE_MAJOR} via Homebrew?"; then
      log_info "Installing node@${REQUIRED_NODE_MAJOR} via Homebrew..."
      if run_with_spinner "Installing Node.js ${REQUIRED_NODE_MAJOR}" brew install "node@${REQUIRED_NODE_MAJOR}"; then
        # Link the specific version
        brew link --overwrite "node@${REQUIRED_NODE_MAJOR}" 2>/dev/null || true

        # Add to PATH if needed
        local brew_prefix
        brew_prefix=$(brew --prefix)
        if [[ -d "${brew_prefix}/opt/node@${REQUIRED_NODE_MAJOR}/bin" ]]; then
          export PATH="${brew_prefix}/opt/node@${REQUIRED_NODE_MAJOR}/bin:${PATH}"
        fi

        if command -v node >/dev/null 2>&1; then
          log_info "Node.js $(node --version) installed via Homebrew."
          return 0
        fi
      fi
      log_error "Failed to install Node.js via Homebrew."
    fi
  fi

  # Check again in case user installed manually
  if command -v node >/dev/null 2>&1; then
    current_version=$(node --version | sed 's/^v//')
    current_major=$(echo "${current_version}" | cut -d. -f1)
    if [[ "${current_major}" -ge "${REQUIRED_NODE_MAJOR}" ]]; then
      return 0
    fi
  fi

  log_error "Node.js ${REQUIRED_NODE_MAJOR}.x is required but not installed."
  log_error "Install via nvm: nvm install ${REQUIRED_NODE_MAJOR}"
  log_error "Or via Homebrew: brew install node@${REQUIRED_NODE_MAJOR}"
  return 1
}

# Ensure bun is installed at the required version
ensure_bun() {
  local current_version=""

  # Check if bun is available
  if command -v bun >/dev/null 2>&1; then
    current_version=$(bun --version 2>/dev/null || true)
  fi

  if [[ -n "${current_version}" ]] && version_gte "${current_version}" "${REQUIRED_BUN_VERSION}"; then
    log_info "Bun v${current_version} found (requires >=${REQUIRED_BUN_VERSION})"
    return 0
  fi

  if [[ -n "${current_version}" ]]; then
    log_warn "Bun v${current_version} found, but v${REQUIRED_BUN_VERSION} required"

    if prompt_confirm "Update Bun to v${REQUIRED_BUN_VERSION}?"; then
      log_info "Updating Bun..."
      if run_with_spinner "Updating Bun to v${REQUIRED_BUN_VERSION}" bun upgrade; then
        current_version=$(bun --version 2>/dev/null || true)
        if version_gte "${current_version}" "${REQUIRED_BUN_VERSION}"; then
          log_info "Bun updated to v${current_version}."
          return 0
        fi
      fi
      log_warn "Bun upgrade didn't reach required version. Trying fresh install..."
    fi
  else
    log_warn "Bun not found"
  fi

  # Install bun
  if prompt_confirm "Install Bun v${REQUIRED_BUN_VERSION}?"; then
    log_info "Installing Bun..."

    # Try official installer
    if run_with_spinner "Installing Bun" bash -c "curl -fsSL https://bun.sh/install | bash -s -- bun-v${REQUIRED_BUN_VERSION}"; then
      # Source the updated profile
      if [[ -f "${HOME}/.bashrc" ]]; then
        # shellcheck disable=SC1091
        source "${HOME}/.bashrc" 2>/dev/null || true
      fi
      if [[ -f "${HOME}/.zshrc" ]]; then
        # shellcheck disable=SC1091
        source "${HOME}/.zshrc" 2>/dev/null || true
      fi

      # Add bun to PATH for current session
      if [[ -d "${HOME}/.bun/bin" ]]; then
        export PATH="${HOME}/.bun/bin:${PATH}"
      fi

      if command -v bun >/dev/null 2>&1; then
        current_version=$(bun --version 2>/dev/null || true)
        log_info "Bun v${current_version} installed."
        return 0
      fi
    fi

    # Fallback to Homebrew on macOS
    if [[ "$(uname -s)" == "Darwin" ]] && command -v brew >/dev/null 2>&1; then
      log_info "Trying Homebrew installation..."
      if run_with_spinner "Installing Bun via Homebrew" brew install oven-sh/bun/bun; then
        if command -v bun >/dev/null 2>&1; then
          current_version=$(bun --version 2>/dev/null || true)
          log_info "Bun v${current_version} installed via Homebrew."
          return 0
        fi
      fi
    fi

    log_error "Failed to install Bun."
  fi

  # Final check
  if command -v bun >/dev/null 2>&1; then
    current_version=$(bun --version 2>/dev/null || true)
    if version_gte "${current_version}" "${REQUIRED_BUN_VERSION}"; then
      return 0
    fi
  fi

  log_error "Bun >=${REQUIRED_BUN_VERSION} is required but not installed."
  log_error "Install via: curl -fsSL https://bun.sh/install | bash"
  return 1
}

# Build and install auto-mobile globally from local project
ensure_auto_mobile() {
  # Always build the project to pick up latest changes
  log_info "Building TypeScript project..."
  if ! (cd "${PROJECT_ROOT}" && bun run build); then
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

# Run all dependency checks
ensure_dependencies() {
  log_info "Checking dependencies..."

  # Parse required versions first
  parse_required_versions

  # Install gum first for better prompts during other installs
  ensure_gum || true  # Don't fail if gum can't be installed

  # Check/install node
  if ! ensure_node; then
    log_error "Node.js installation failed or was declined."
    return 1
  fi

  # Check/install bun
  if ! ensure_bun; then
    log_error "Bun installation failed or was declined."
    return 1
  fi

  # Check/install auto-mobile globally
  if ! ensure_auto_mobile; then
    log_error "auto-mobile global installation failed."
    return 1
  fi

  log_info "All dependencies satisfied."
  return 0
}
