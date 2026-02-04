#!/usr/bin/env bash
#
# IDE plugin build, install, and watch utilities for local development.
#
# Required variables (must be set before sourcing):
#   PROJECT_ROOT - Path to project root
#
# Functions:
#   detect_toolbox_ides()       - Parse JetBrains Toolbox state.json
#   detect_spotlight_ides()     - Fallback using mdfind for bundle identifiers
#   get_all_ides()              - Combined detection, sorted by access time
#   select_ide()                - Interactive gum selection (IDE type -> version)
#   get_ide_plugins_dir()       - Resolve plugins directory for selected IDE
#   build_ide_plugin()          - Run gradlew buildPlugin
#   install_ide_plugin()        - Unzip plugin to IDE's plugins directory
#   restart_ide()               - Graceful quit via osascript, fallback to pkill
#   list_ide_plugin_watch_files() - Files to watch for changes
#   hash_ide_plugin_state()     - Hash of watched file timestamps

# IDE plugin paths
IDE_PLUGIN_DIR="${PROJECT_ROOT}/android/ide-plugin"
PLUGIN_NAME="auto-mobile-ide-plugin"

# Selected IDE state (set by select_ide)
SELECTED_IDE_NAME=""
SELECTED_IDE_PATH=""
SELECTED_IDE_TYPE=""  # "android-studio" or "intellij"

# Detect IDEs from JetBrains Toolbox state.json (primary method)
# Outputs: Lines of "type|name|path|launch_command"
detect_toolbox_ides() {
  local toolbox_state="${HOME}/Library/Application Support/JetBrains/Toolbox/state.json"

  if [[ ! -f "${toolbox_state}" ]]; then
    return 0
  fi

  # Parse the state.json using jq if available, otherwise use grep/sed
  if command -v jq >/dev/null 2>&1; then
    jq -r '.tools[]? | select(.productCode == "AI" or .productCode == "IU" or .productCode == "IC") |
      "\(.productCode)|\(.displayName)|\(.installLocation)|\(.launchCommand // "")"' "${toolbox_state}" 2>/dev/null || true
  else
    # Fallback: basic grep for install locations
    grep -o '"installLocation"[[:space:]]*:[[:space:]]*"[^"]*"' "${toolbox_state}" 2>/dev/null | \
      sed 's/.*"installLocation"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' | \
      while read -r path; do
        if [[ -d "${path}" ]]; then
          local name
          name=$(basename "${path}" .app)
          local type="unknown"
          if [[ "${name}" == *"Android Studio"* ]]; then
            type="AI"
          elif [[ "${name}" == *"IntelliJ"* ]]; then
            type="IU"
          fi
          echo "${type}|${name}|${path}|"
        fi
      done
  fi
}

# Detect IDEs using Spotlight mdfind (fallback method)
# Outputs: Lines of "type|name|path|"
detect_spotlight_ides() {
  local apps=()

  # Search for Android Studio
  while IFS= read -r path; do
    if [[ -n "${path}" && -d "${path}" ]]; then
      local name
      name=$(basename "${path}" .app)
      apps+=("AI|${name}|${path}|")
    fi
  done < <(mdfind "kMDItemCFBundleIdentifier == 'com.google.android.studio'" 2>/dev/null || true)

  # Search for Android Studio Preview
  while IFS= read -r path; do
    if [[ -n "${path}" && -d "${path}" ]]; then
      local name
      name=$(basename "${path}" .app)
      apps+=("AI|${name}|${path}|")
    fi
  done < <(mdfind "kMDItemCFBundleIdentifier == 'com.google.android.studio-EAP'" 2>/dev/null || true)

  # Search for IntelliJ IDEA
  while IFS= read -r path; do
    if [[ -n "${path}" && -d "${path}" ]]; then
      local name
      name=$(basename "${path}" .app)
      local type="IU"
      if [[ "${name}" == *"Community"* ]]; then
        type="IC"
      fi
      apps+=("${type}|${name}|${path}|")
    fi
  done < <(mdfind "kMDItemCFBundleIdentifier == 'com.jetbrains.intellij*'" 2>/dev/null || true)

  printf '%s\n' "${apps[@]}"
}

# Get access time for a path (for sorting by recency)
get_access_time() {
  local path="$1"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    stat -f "%a" "${path}" 2>/dev/null || echo "0"
  else
    stat -c "%X" "${path}" 2>/dev/null || echo "0"
  fi
}

# Get all detected IDEs, sorted by access time (most recent first)
# Outputs: Lines of "type|name|path|launch_command"
get_all_ides() {
  local ides=()
  local seen_paths=()

  log_info "Scanning for JetBrains IDEs..."

  # Collect from Toolbox first
  log_info "Checking JetBrains Toolbox..."
  while IFS= read -r line; do
    if [[ -n "${line}" ]]; then
      local path
      path=$(echo "${line}" | cut -d'|' -f3)
      log_info "  Toolbox candidate: ${path}"
      if [[ -d "${path}" ]]; then
        ides+=("${line}")
        seen_paths+=("${path}")
      else
        log_info "    (path does not exist, skipping)"
      fi
    fi
  done < <(detect_toolbox_ides)

  # Add Spotlight results if not already seen
  log_info "Checking Spotlight index..."
  while IFS= read -r line; do
    if [[ -n "${line}" ]]; then
      local path
      path=$(echo "${line}" | cut -d'|' -f3)
      log_info "  Spotlight candidate: ${path}"
      local already_seen=false
      if [[ ${#seen_paths[@]} -gt 0 ]]; then
        for seen in "${seen_paths[@]}"; do
          if [[ "${seen}" == "${path}" ]]; then
            already_seen=true
            break
          fi
        done
      fi
      if [[ "${already_seen}" == "true" ]]; then
        log_info "    (already found via Toolbox, skipping)"
      elif [[ ! -d "${path}" ]]; then
        log_info "    (path does not exist, skipping)"
      else
        ides+=("${line}")
      fi
    fi
  done < <(detect_spotlight_ides)

  log_info "Found ${#ides[@]} IDE(s)"

  # Sort by access time (most recent first)
  if [[ ${#ides[@]} -gt 0 ]]; then
    for ide in "${ides[@]}"; do
      local path
      path=$(echo "${ide}" | cut -d'|' -f3)
      local atime
      atime=$(get_access_time "${path}")
      echo "${atime}|${ide}"
    done | sort -t'|' -k1 -rn | cut -d'|' -f2-
  fi
}

# Interactive IDE selection using gum
# Sets: SELECTED_IDE_NAME, SELECTED_IDE_PATH, SELECTED_IDE_TYPE, SELECTED_IDE_VERSION
select_ide() {
  local preselect="${1:-}"
  local ides=()
  local ide_types=()

  # Collect all IDEs
  while IFS= read -r line; do
    if [[ -n "${line}" ]]; then
      ides+=("${line}")
      local type
      type=$(echo "${line}" | cut -d'|' -f1)
      # Track unique types
      local found=false
      if [[ ${#ide_types[@]} -gt 0 ]]; then
        for t in "${ide_types[@]}"; do
          if [[ "${t}" == "${type}" ]]; then
            found=true
            break
          fi
        done
      fi
      if [[ "${found}" == "false" ]]; then
        ide_types+=("${type}")
      fi
    fi
  done < <(get_all_ides)

  if [[ ${#ides[@]} -eq 0 ]]; then
    log_error "No JetBrains IDEs detected."
    log_error "Install Android Studio or IntelliJ IDEA and run them at least once."
    return 1
  fi

  # If preselect specified, try to match
  if [[ -n "${preselect}" ]]; then
    for ide in "${ides[@]}"; do
      local name
      name=$(echo "${ide}" | cut -d'|' -f2)
      if [[ "${name}" == *"${preselect}"* ]]; then
        SELECTED_IDE_NAME="${name}"
        SELECTED_IDE_PATH=$(echo "${ide}" | cut -d'|' -f3)
        local type
        type=$(echo "${ide}" | cut -d'|' -f1)
        if [[ "${type}" == "AI" ]]; then
          SELECTED_IDE_TYPE="android-studio"
        else
          SELECTED_IDE_TYPE="intellij"
        fi
        log_info "Selected IDE: ${SELECTED_IDE_NAME}"
        return 0
      fi
    done
    log_warn "No IDE matching '${preselect}' found. Prompting for selection."
  fi

  # If only one IDE, select it automatically
  if [[ ${#ides[@]} -eq 1 ]]; then
    local ide="${ides[0]}"
    SELECTED_IDE_NAME=$(echo "${ide}" | cut -d'|' -f2)
    SELECTED_IDE_PATH=$(echo "${ide}" | cut -d'|' -f3)
    local type
    type=$(echo "${ide}" | cut -d'|' -f1)
    if [[ "${type}" == "AI" ]]; then
      SELECTED_IDE_TYPE="android-studio"
    else
      SELECTED_IDE_TYPE="intellij"
    fi
    log_info "Auto-selected IDE: ${SELECTED_IDE_NAME}"
    return 0
  fi

  # Check if gum is available
  if ! command -v gum >/dev/null 2>&1; then
    log_error "Multiple IDEs detected but gum not available for selection."
    log_error "Install gum or use --ide <name> to specify the IDE."
    return 1
  fi

  local selected_type=""

  # Stage 1: IDE type selection (if multiple types)
  local has_android_studio=false
  local has_intellij=false
  for type in "${ide_types[@]}"; do
    if [[ "${type}" == "AI" ]]; then
      has_android_studio=true
    elif [[ "${type}" == "IU" || "${type}" == "IC" ]]; then
      has_intellij=true
    fi
  done

  if [[ "${has_android_studio}" == "true" && "${has_intellij}" == "true" ]]; then
    selected_type=$(gum choose --header "Which IDE?" "Android Studio" "IntelliJ IDEA")
    if [[ "${selected_type}" == "Android Studio" ]]; then
      selected_type="AI"
    else
      selected_type="IU"  # Will match both IU and IC
    fi
  elif [[ "${has_android_studio}" == "true" ]]; then
    selected_type="AI"
  else
    selected_type="IU"
  fi

  # Filter IDEs by selected type
  local filtered_ides=()
  for ide in "${ides[@]}"; do
    local type
    type=$(echo "${ide}" | cut -d'|' -f1)
    if [[ "${selected_type}" == "AI" && "${type}" == "AI" ]]; then
      filtered_ides+=("${ide}")
    elif [[ "${selected_type}" == "IU" && ("${type}" == "IU" || "${type}" == "IC") ]]; then
      filtered_ides+=("${ide}")
    fi
  done

  # Stage 2: Version selection (if multiple versions)
  if [[ ${#filtered_ides[@]} -eq 1 ]]; then
    local ide="${filtered_ides[0]}"
    SELECTED_IDE_NAME=$(echo "${ide}" | cut -d'|' -f2)
    SELECTED_IDE_PATH=$(echo "${ide}" | cut -d'|' -f3)
  else
    # Build choice list with "(most recent)" marker on first
    local choices=()
    local first=true
    for ide in "${filtered_ides[@]}"; do
      local name
      name=$(echo "${ide}" | cut -d'|' -f2)
      if [[ "${first}" == "true" ]]; then
        choices+=("${name} (most recent)")
        first=false
      else
        choices+=("${name}")
      fi
    done

    local selection
    selection=$(printf '%s\n' "${choices[@]}" | gum choose --header "Which version?")

    # Remove "(most recent)" suffix if present
    selection="${selection% (most recent)}"

    # Find matching IDE
    for ide in "${filtered_ides[@]}"; do
      local name
      name=$(echo "${ide}" | cut -d'|' -f2)
      if [[ "${name}" == "${selection}" ]]; then
        SELECTED_IDE_NAME="${name}"
        SELECTED_IDE_PATH=$(echo "${ide}" | cut -d'|' -f3)
        break
      fi
    done
  fi

  if [[ "${selected_type}" == "AI" ]]; then
    SELECTED_IDE_TYPE="android-studio"
  else
    SELECTED_IDE_TYPE="intellij"
  fi

  log_info "Selected IDE: ${SELECTED_IDE_NAME}"
  return 0
}

# Resolve plugins directory for the selected IDE
# Outputs: Path to plugins directory
get_ide_plugins_dir() {
  local plugins_dir=""

  if [[ -z "${SELECTED_IDE_NAME}" ]]; then
    log_error "No IDE selected. Call select_ide first."
    return 1
  fi

  # Extract version from IDE name (e.g., "Android Studio Panda | 2025.3.1" -> "2025.3")
  local version=""
  if [[ "${SELECTED_IDE_NAME}" =~ ([0-9]{4}\.[0-9]+) ]]; then
    version="${BASH_REMATCH[1]}"
  fi

  # If no version in name, try to read from app bundle Info.plist
  if [[ -z "${version}" && -n "${SELECTED_IDE_PATH}" ]]; then
    local bundle_version
    bundle_version=$(defaults read "${SELECTED_IDE_PATH}/Contents/Info" CFBundleShortVersionString 2>/dev/null || true)
    if [[ "${bundle_version}" =~ ([0-9]{4}\.[0-9]+) ]]; then
      version="${BASH_REMATCH[1]}"
    fi
  fi

  if [[ "${SELECTED_IDE_TYPE}" == "android-studio" ]]; then
    # Android Studio: ~/Library/Application Support/Google/AndroidStudio<version>/plugins
    local config_base="${HOME}/Library/Application Support/Google"
    if [[ -n "${version}" ]]; then
      # Try exact match first, then glob for patch versions (e.g., 2025.3 -> AndroidStudio2025.3.1)
      if [[ -d "${config_base}/AndroidStudio${version}" ]]; then
        plugins_dir="${config_base}/AndroidStudio${version}/plugins"
      else
        # Find directory matching version prefix (e.g., AndroidStudio2025.3*)
        plugins_dir=$(find "${config_base}" -maxdepth 1 -type d -name "AndroidStudio${version}*" ! -name "*Preview*" 2>/dev/null | sort -V | tail -n 1 || true)
        if [[ -n "${plugins_dir}" ]]; then
          plugins_dir="${plugins_dir}/plugins"
        fi
      fi
    fi
    # Fallback: find most recent non-Preview AndroidStudio directory by modification time
    if [[ -z "${plugins_dir}" || ! -d "$(dirname "${plugins_dir}")" ]]; then
      plugins_dir=$(find "${config_base}" -maxdepth 1 -type d -name "AndroidStudio[0-9]*" ! -name "*Preview*" -exec stat -f "%m %N" {} \; 2>/dev/null | sort -rn | head -n 1 | cut -d' ' -f2- || true)
      if [[ -n "${plugins_dir}" ]]; then
        plugins_dir="${plugins_dir}/plugins"
      fi
    fi
  else
    # IntelliJ IDEA: ~/Library/Application Support/JetBrains/IntelliJIdea<version>/plugins
    local config_base="${HOME}/Library/Application Support/JetBrains"
    if [[ -n "${version}" ]]; then
      if [[ -d "${config_base}/IntelliJIdea${version}" ]]; then
        plugins_dir="${config_base}/IntelliJIdea${version}/plugins"
      else
        plugins_dir=$(find "${config_base}" -maxdepth 1 -type d -name "IntelliJIdea${version}*" 2>/dev/null | sort -V | tail -n 1 || true)
        if [[ -n "${plugins_dir}" ]]; then
          plugins_dir="${plugins_dir}/plugins"
        fi
      fi
    fi
    # Fallback: find most recent IntelliJIdea directory by modification time
    if [[ -z "${plugins_dir}" || ! -d "$(dirname "${plugins_dir}")" ]]; then
      plugins_dir=$(find "${config_base}" -maxdepth 1 -type d -name "IntelliJIdea*" -exec stat -f "%m %N" {} \; 2>/dev/null | sort -rn | head -n 1 | cut -d' ' -f2- || true)
      if [[ -n "${plugins_dir}" ]]; then
        plugins_dir="${plugins_dir}/plugins"
      fi
    fi
  fi

  if [[ -z "${plugins_dir}" ]]; then
    log_error "Could not determine plugins directory for ${SELECTED_IDE_NAME}"
    return 1
  fi

  # Create plugins directory if it doesn't exist
  if [[ ! -d "${plugins_dir}" ]]; then
    log_info "Creating plugins directory: ${plugins_dir}"
    mkdir -p "${plugins_dir}"
  fi

  echo "${plugins_dir}"
}

# Build the IDE plugin
build_ide_plugin() {
  log_info "Building IDE plugin..."

  if ! (cd "${IDE_PLUGIN_DIR}" && ./gradlew buildPlugin); then
    log_error "Gradle build failed."
    return 1
  fi

  # Verify plugin zip exists
  local plugin_zip
  plugin_zip=$(find "${IDE_PLUGIN_DIR}/build/distributions" -maxdepth 1 -name '*.zip' -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -n 1 || true)

  if [[ -z "${plugin_zip}" || ! -f "${plugin_zip}" ]]; then
    log_error "Plugin zip not found in ${IDE_PLUGIN_DIR}/build/distributions"
    return 1
  fi

  log_info "Plugin built: $(basename "${plugin_zip}")"
  return 0
}

# Install the IDE plugin to the selected IDE's plugins directory
install_ide_plugin() {
  local plugins_dir="$1"

  if [[ -z "${plugins_dir}" ]]; then
    log_error "Plugins directory not specified."
    return 1
  fi

  local plugin_zip
  plugin_zip=$(find "${IDE_PLUGIN_DIR}/build/distributions" -maxdepth 1 -name '*.zip' -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -n 1 || true)

  if [[ -z "${plugin_zip}" || ! -f "${plugin_zip}" ]]; then
    log_error "Plugin zip not found. Run build_ide_plugin first."
    return 1
  fi

  log_info "Installing plugin to ${plugins_dir}..."

  # Remove old version
  rm -rf "${plugins_dir:?}/${PLUGIN_NAME:?}"

  # Extract new version (overwrite without prompting)
  unzip -o -q "${plugin_zip}" -d "${plugins_dir}"

  log_info "Plugin installed: ${PLUGIN_NAME}"
  return 0
}

# Restart the IDE (graceful quit, wait, force kill, relaunch)
restart_ide() {
  if [[ -z "${SELECTED_IDE_NAME}" || -z "${SELECTED_IDE_PATH}" ]]; then
    log_error "No IDE selected. Call select_ide first."
    return 1
  fi

  log_info "Restarting ${SELECTED_IDE_NAME}..."

  # Extract app name for osascript (e.g., "Android Studio" from path)
  local app_name
  app_name=$(basename "${SELECTED_IDE_PATH}" .app)

  # Step 1: Graceful quit via osascript
  log_info "Sending quit signal..."
  osascript -e "tell application \"${app_name}\" to quit" 2>/dev/null || true

  # Step 2: Wait for exit (max 10s)
  local count=0
  local process_pattern
  if [[ "${SELECTED_IDE_TYPE}" == "android-studio" ]]; then
    process_pattern="studio"
  else
    process_pattern="idea"
  fi

  while pgrep -f "${process_pattern}" >/dev/null 2>&1 && [[ ${count} -lt 10 ]]; do
    sleep 1
    ((count++))
  done

  # Step 3: Force kill if still running
  if pgrep -f "${process_pattern}" >/dev/null 2>&1; then
    log_warn "Force killing IDE..."
    pkill -9 -f "${process_pattern}" 2>/dev/null || true
    sleep 1
  fi

  # Step 4: Relaunch
  log_info "Launching ${app_name}..."
  open -a "${SELECTED_IDE_PATH}"

  log_info "IDE restarted."
  return 0
}

# List all files to watch for changes
list_ide_plugin_watch_files() {
  local watch_dirs=(
    "${IDE_PLUGIN_DIR}/src"
  )
  local extra_files=(
    "${IDE_PLUGIN_DIR}/build.gradle.kts"
  )

  # Use ripgrep if available, otherwise find
  if command -v rg >/dev/null 2>&1; then
    rg --files "${watch_dirs[@]}" -g '!**/build/**' 2>/dev/null || true
  else
    find "${watch_dirs[@]}" -type f ! -path "*/build/*" 2>/dev/null || true
  fi

  for file in "${extra_files[@]}"; do
    if [[ -f "${file}" ]]; then
      echo "${file}"
    fi
  done
}

# Compute hash of all watched file timestamps
hash_ide_plugin_state() {
  list_ide_plugin_watch_files | while read -r file; do
    if [[ -f "${file}" ]]; then
      stat_entry "${file}" 2>/dev/null || true
    fi
  done | sort | hash_stream
}

# Watch for changes and rebuild/reinstall
# Args: poll_interval plugins_dir no_restart_flag
ide_plugin_watch_loop() {
  local poll_interval="${1:-2}"
  local plugins_dir="$2"
  local no_restart="${3:-false}"

  log_info "Watching for changes (poll interval ${poll_interval}s)..."
  log_info "Press Ctrl+C to stop."
  local last_hash
  last_hash="$(hash_ide_plugin_state)"

  while true; do
    sleep "${poll_interval}"

    local next_hash
    next_hash="$(hash_ide_plugin_state)"

    if [[ "${next_hash}" != "${last_hash}" ]]; then
      log_info "Change detected. Rebuilding..."
      last_hash="${next_hash}"

      if build_ide_plugin; then
        if install_ide_plugin "${plugins_dir}"; then
          if [[ "${no_restart}" != "true" ]]; then
            restart_ide
          else
            log_info "Plugin installed. Restart IDE to apply changes."
          fi
        else
          log_warn "Install failed; waiting for next change."
        fi
      else
        log_warn "Build failed; waiting for next change."
      fi

      # Update hash after build in case build generated new files
      last_hash="$(hash_ide_plugin_state)"
    fi
  done
}
