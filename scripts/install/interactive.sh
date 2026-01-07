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

INSTALL_BUN=false
BUN_INSTALLED=false
INSTALL_ANDROID_SDK=false
ANDROID_SDK_DETECTED=false
ANDROID_SDK_ROOT_SELECTED=""
INSTALL_ANDROID_PLATFORM_TOOLS=false
INSTALL_ACCESSIBILITY_SERVICE=false
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

install_gum_manual() {
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

    local version
    version=$(fetch_gum_version)
    local download_url="https://github.com/charmbracelet/gum/releases/download/v${version}/gum_${version}_${os_label}_${arch_label}.tar.gz"

    plain_info "Downloading gum ${version}..."

    local temp_dir
    temp_dir=$(mktemp -d)
    local archive_path="${temp_dir}/gum.tar.gz"

    if ! download_file "${download_url}" "${archive_path}"; then
        plain_error "Failed to download gum from ${download_url}"
        rm -rf "${temp_dir}"
        return 1
    fi

    tar -xzf "${archive_path}" -C "${temp_dir}"

    local install_dir="${HOME}/.local/bin"
    mkdir -p "${install_dir}"
    mv "${temp_dir}/gum" "${install_dir}/gum"
    chmod +x "${install_dir}/gum"
    rm -rf "${temp_dir}"

    if [[ ":${PATH}:" != *":${install_dir}:"* ]]; then
        export PATH="${install_dir}:${PATH}"
        plain_warn "Added ${install_dir} to PATH for this session."
        plain_warn "Add this line to your shell profile to persist:"
        plain_warn "export PATH=\"\$PATH:${install_dir}\""
    fi

    plain_info "gum installed to ${install_dir}"
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
    if command_exists gum; then
        return 0
    fi

    plain_warn "gum is required for the interactive installer."
    if ! prompt_confirm_plain "Install gum now?"; then
        plain_error "gum is required to continue."
        exit 1
    fi

    if ! install_gum; then
        plain_error "gum installation failed."
        exit 1
    fi

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

play_logo_animation() {
    local -a logo_lines=(
        "    _________"
        " __/  _   _ \\__"
        "/__ / \\_/ \\__\\"
        "\\__\\__/ \\__/__/"
        "   O       O"
    )
    local offset=0
    local direction=1
    local frames=40
    local delay=0.05
    local max_offset=12
    local logo_width=0
    local term_cols=80
    local color_start=""
    local color_reset=""

    if ! command_exists tput || [[ ! -t 1 ]]; then
        printf "%s\n" "${logo_lines[@]}"
        return 0
    fi

    term_cols=$(tput cols 2>/dev/null || echo 80)
    for line in "${logo_lines[@]}"; do
        if (( ${#line} > logo_width )); then
            logo_width=${#line}
        fi
    done

    local available=$((term_cols - logo_width - 1))
    if (( available < 0 )); then
        available=0
    fi
    if (( available < max_offset )); then
        max_offset=${available}
    fi

    color_start=$(tput setaf 1 2>/dev/null || true)
    color_reset=$(tput sgr0 2>/dev/null || true)

    tput civis || true

    for ((i = 0; i < frames; i++)); do
        for line in "${logo_lines[@]}"; do
            printf "\033[2K%*s%s%s%s\n" "${offset}" "" "${color_start}" "${line}" "${color_reset}"
        done
        tput cuu "${#logo_lines[@]}" || true

        if (( offset <= 0 )); then
            direction=1
        elif (( offset >= max_offset )); then
            direction=-1
        fi

        offset=$((offset + direction))
        sleep "${delay}"
    done

    tput cud "${#logo_lines[@]}" || true
    tput cnorm || true
    printf "\n"
}

resolve_ide_plugin_url() {
    local url=""

    if command_exists curl; then
        url=$(curl -fsSL "https://api.github.com/repos/kaeawc/auto-mobile/releases/latest" \
            | sed -nE 's/.*"browser_download_url": "([^"]*auto-mobile-ide-plugin[^"]*\.zip)".*/\1/p' \
            | head -n 1)
    elif command_exists wget; then
        url=$(wget -qO- "https://api.github.com/repos/kaeawc/auto-mobile/releases/latest" \
            | sed -nE 's/.*"browser_download_url": "([^"]*auto-mobile-ide-plugin[^"]*\.zip)".*/\1/p' \
            | head -n 1)
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

install_accessibility_service() {
    if ! command_exists adb; then
        log_error "adb is required to install the Accessibility Service."
        return 1
    fi

    local device_id="${ACCESSIBILITY_DEVICE_ID}"
    if [[ -z "${device_id}" || "${device_id}" == "auto" ]]; then
        device_id=$(choose_adb_device || true)
    fi

    if [[ -z "${device_id}" ]]; then
        log_warn "No connected Android devices detected. Skipping Accessibility Service install."
        return 1
    fi

    local temp_dir
    temp_dir=$(mktemp -d)
    local apk_path="${temp_dir}/accessibility-service.apk"

    if command_exists curl; then
        if ! run_download_with_progress "Downloading Accessibility Service APK" \
            curl -fsSL "${ACCESSIBILITY_APK_URL}" -o "${apk_path}"; then
            log_error "Failed to download Accessibility Service APK."
            rm -rf "${temp_dir}"
            return 1
        fi
    elif command_exists wget; then
        if ! run_download_with_progress "Downloading Accessibility Service APK" \
            wget -qO "${apk_path}" "${ACCESSIBILITY_APK_URL}"; then
            log_error "Failed to download Accessibility Service APK."
            rm -rf "${temp_dir}"
            return 1
        fi
    else
        log_error "curl or wget is required to download the Accessibility Service APK."
        rm -rf "${temp_dir}"
        return 1
    fi

    local expected_checksum
    expected_checksum=$(resolve_accessibility_checksum)
    if [[ -n "${expected_checksum}" ]]; then
        local actual_checksum
        actual_checksum=$(sha256_file "${apk_path}" || true)
        if [[ -z "${actual_checksum}" ]]; then
            log_warn "Checksum tools not available; skipping APK verification."
        elif [[ "${expected_checksum}" != "${actual_checksum}" ]]; then
            log_error "APK checksum mismatch. Expected ${expected_checksum}, got ${actual_checksum}."
            rm -rf "${temp_dir}"
            return 1
        else
            log_info "Accessibility Service APK checksum verified."
        fi
    else
        log_warn "No expected checksum available; skipping APK verification."
    fi

    if ! run_with_progress "Installing Accessibility Service APK" \
        adb -s "${device_id}" install -r "${apk_path}"; then
        log_error "Failed to install Accessibility Service APK."
        rm -rf "${temp_dir}"
        return 1
    fi

    if [[ "${OPEN_ACCESSIBILITY_SETTINGS}" == "true" ]]; then
        run_spinner "Opening Accessibility Settings" \
            adb -s "${device_id}" shell am start -a android.settings.ACCESSIBILITY_SETTINGS
        log_info "Enable AutoMobile Accessibility Service on the device to finish setup."
    else
        log_info "Enable AutoMobile Accessibility Service in device settings to finish setup."
    fi

    rm -rf "${temp_dir}"
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

handle_android_sdk_setup() {
    if [[ "${ANDROID_SDK_DETECTED}" == "true" ]]; then
        return 0
    fi

    if [[ "${INSTALL_ANDROID_SDK}" == "true" ]]; then
        install_android_cmdline_tools
        return 0
    fi

    log_warn "Android SDK is required for device support. See docs/install/plat/android.md."
    return 1
}

collect_choices() {
    if [[ "${BUN_INSTALLED}" == "false" ]]; then
        if gum confirm "Bun is required for AutoMobile. Install Bun now?"; then
            INSTALL_BUN=true
        fi
    fi

    if [[ "${platform_choice}" == "Android" || "${platform_choice}" == "Both" ]]; then
        if [[ "${ANDROID_SDK_DETECTED}" == "false" ]]; then
            if gum confirm "Android SDK not detected. Download command line tools?"; then
                INSTALL_ANDROID_SDK=true
                ANDROID_SDK_ROOT_SELECTED=$(choose_android_sdk_root)
                if gum confirm "Install Android platform-tools (adb) after command line tools? (accepts SDK licenses)"; then
                    INSTALL_ANDROID_PLATFORM_TOOLS=true
                fi
            fi
        fi

        if gum confirm "Install AutoMobile Accessibility Service (latest release) on a connected device?"; then
            INSTALL_ACCESSIBILITY_SERVICE=true
            ACCESSIBILITY_DEVICE_ID=$(choose_adb_device || true)
            if [[ -z "${ACCESSIBILITY_DEVICE_ID}" ]]; then
                ACCESSIBILITY_DEVICE_ID="auto"
                log_warn "No connected devices detected yet. Will attempt install on the first device found."
            fi
            if gum confirm "Open Accessibility Settings after install?"; then
                OPEN_ACCESSIBILITY_SETTINGS=true
            fi
        fi

        if gum confirm "Install AutoMobile IntelliJ/Android Studio plugin?"; then
            INSTALL_IDE_PLUGIN=true
            if [[ "${IS_REPO}" == "true" ]]; then
                local method
                method=$(gum choose "Build from source (Gradle)" "Download latest release (zip)")
                if [[ "${method}" == "Build from source (Gradle)" ]]; then
                    IDE_PLUGIN_METHOD="source"
                else
                    IDE_PLUGIN_METHOD="release"
                fi
            else
                IDE_PLUGIN_METHOD="release"
            fi

            IDE_PLUGIN_DIR=$(detect_ide_plugins_dir || true)
            if [[ -z "${IDE_PLUGIN_DIR}" ]]; then
                IDE_PLUGIN_DIR=$(gum input --prompt "IDE plugins directory: " --value "")
            fi

            if [[ "${IDE_PLUGIN_METHOD}" == "release" ]]; then
                IDE_PLUGIN_ZIP_URL=$(resolve_ide_plugin_url || true)
                if [[ -z "${IDE_PLUGIN_ZIP_URL}" ]]; then
                    IDE_PLUGIN_ZIP_URL=$(gum input --prompt "IDE plugin zip URL: " --value "")
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

choose_android_sdk_root() {
    if [[ -n "${ANDROID_SDK_ROOT_SELECTED}" ]]; then
        echo "${ANDROID_SDK_ROOT_SELECTED}"
        return 0
    fi

    local default_root
    default_root=$(resolve_android_sdk_root)
    local selected_root
    selected_root=$(gum input --prompt "Android SDK location: " --value "${default_root}")

    if [[ -z "${selected_root}" ]]; then
        selected_root="${default_root}"
    fi

    echo "${selected_root}"
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

install_android_platform_tools() {
    local sdk_root="$1"
    local sdkmanager="${sdk_root}/cmdline-tools/latest/bin/sdkmanager"
    local log_path
    log_path=$(mktemp)

    if [[ ! -x "${sdkmanager}" ]]; then
        log_error "sdkmanager not found at ${sdkmanager}"
        rm -f "${log_path}"
        return 1
    fi

    if ! command_exists java; then
        log_warn "Java is required to run sdkmanager. Install a JDK and retry."
        rm -f "${log_path}"
        return 1
    fi

    if ! run_with_progress "Installing Android platform-tools (adb)" \
        bash -c "yes | \"${sdkmanager}\" --sdk_root=\"${sdk_root}\" \"platform-tools\" >\"${log_path}\" 2>&1"; then
        log_error "Failed to install platform-tools. Logs: ${log_path}"
        return 1
    fi

    log_info "Android platform-tools installed."
    rm -f "${log_path}"
}

install_android_cmdline_tools() {
    local sdk_root="${ANDROID_SDK_ROOT_SELECTED}"

    if [[ -z "${sdk_root}" ]]; then
        log_error "Android SDK location is required. Re-run and select a path."
        return 1
    fi

    if ! spin_check "Checking unzip" "command -v unzip >/dev/null 2>&1"; then
        log_error "unzip is required to extract Android command line tools."
        return 1
    fi

    local os
    os=$(detect_os)
    local download_url=""

    case "${os}" in
        macos)
            download_url="https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip"
            ;;
        linux)
            download_url="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
            ;;
        *)
            log_error "Android SDK download is only supported on macOS and Linux."
            return 1
            ;;
    esac

    local temp_dir
    temp_dir=$(mktemp -d)
    local zip_path="${temp_dir}/commandlinetools.zip"

    if command_exists curl; then
        if ! run_download_with_progress "Downloading Android command line tools" \
            curl -fsSL "${download_url}" -o "${zip_path}"; then
            log_error "Failed to download Android command line tools."
            rm -rf "${temp_dir}"
            return 1
        fi
    elif command_exists wget; then
        if ! run_download_with_progress "Downloading Android command line tools" \
            wget -qO "${zip_path}" "${download_url}"; then
            log_error "Failed to download Android command line tools."
            rm -rf "${temp_dir}"
            return 1
        fi
    else
        log_error "curl or wget is required to download Android command line tools."
        rm -rf "${temp_dir}"
        return 1
    fi

    if ! run_spinner "Extracting command line tools" unzip -q "${zip_path}" -d "${temp_dir}"; then
        log_error "Failed to extract command line tools."
        rm -rf "${temp_dir}"
        return 1
    fi

    mkdir -p "${sdk_root}/cmdline-tools"
    rm -rf "${sdk_root}/cmdline-tools/latest"
    mv "${temp_dir}/cmdline-tools" "${sdk_root}/cmdline-tools/latest"
    rm -rf "${temp_dir}"

    export ANDROID_SDK_ROOT="${sdk_root}"
    export ANDROID_HOME="${sdk_root}"

    log_info "Android command line tools installed to ${sdk_root}"
    log_info "Add ANDROID_SDK_ROOT=${sdk_root} to your shell config for future sessions."

    if [[ "${INSTALL_ANDROID_PLATFORM_TOOLS}" == "true" ]]; then
        install_android_platform_tools "${sdk_root}"
    else
        log_warn "Run sdkmanager later to install platform-tools: ${sdk_root}/cmdline-tools/latest/bin/sdkmanager \"platform-tools\""
    fi
}

main() {
    ensure_gum

    gum style --bold "AutoMobile Interactive Installer"
    play_logo_animation

    local os
    os=$(detect_os)
    if [[ "${os}" == "unknown" ]]; then
        log_error "This installer supports macOS and Linux only."
        exit 1
    fi

    log_info "Starting setup from ${PROJECT_ROOT}"

    platform_choice=$(gum choose "Android" "iOS" "Both" "Skip platform setup")

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

    handle_bun_setup

    case "${platform_choice}" in
        Android)
            handle_android_sdk_setup
            if [[ "${INSTALL_ACCESSIBILITY_SERVICE}" == "true" ]]; then
                install_accessibility_service
            fi
            if [[ "${INSTALL_IDE_PLUGIN}" == "true" ]]; then
                install_ide_plugin
            fi
            ;;
        iOS)
            log_warn "iOS support is not available yet. See docs/design-docs/plat/ios/index.md."
            ;;
        Both)
            handle_android_sdk_setup
            if [[ "${INSTALL_ACCESSIBILITY_SERVICE}" == "true" ]]; then
                install_accessibility_service
            fi
            if [[ "${INSTALL_IDE_PLUGIN}" == "true" ]]; then
                install_ide_plugin
            fi
            log_warn "iOS support is not available yet. See docs/design-docs/plat/ios/index.md."
            ;;
        *)
            log_info "Skipping platform-specific setup."
            ;;
    esac

    if [[ "${INSTALL_AUTOMOBILE_CLI}" == "true" ]]; then
        install_auto_mobile_cli
    fi

    if [[ "${START_DAEMON}" == "true" ]]; then
        start_mcp_daemon
    fi

    log_info "Setup complete. Review docs/install/overview.md for MCP configuration examples."
}

main "$@"
