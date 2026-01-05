#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IDE_PLUGIN_DIR="${ANDROID_STUDIO_PLUGINS_DIR:-${IDEA_PLUGINS_DIR:-}}"

# Auto-detect IntelliJ/Android Studio plugins directory on macOS
if [[ -z "$IDE_PLUGIN_DIR" ]]; then
  OS_NAME="$(uname -s | tr '[:upper:]' '[:lower:]')"
  if [[ "$OS_NAME" == "darwin" ]]; then
    # Search for JetBrains IDE plugins directories
    JETBRAINS_DIR="$HOME/Library/Application Support/JetBrains"
    if [[ -d "$JETBRAINS_DIR" ]]; then
      # Find most recent IntelliJ or Android Studio directory
      IDE_PLUGIN_DIR=$(find "$JETBRAINS_DIR" -maxdepth 1 -type d \( -name "IntelliJIdea*" -o -name "AndroidStudio*" \) 2>/dev/null | sort -r | head -n 1 || true)
      if [[ -n "$IDE_PLUGIN_DIR" ]]; then
        IDE_PLUGIN_DIR="$IDE_PLUGIN_DIR/plugins"
      fi
    fi
  fi
fi

if [[ -z "$IDE_PLUGIN_DIR" ]]; then
  echo "Could not auto-detect IDE plugins directory."
  echo "Set ANDROID_STUDIO_PLUGINS_DIR or IDEA_PLUGINS_DIR to your IDE plugins directory."
  echo "Example (macOS):"
  echo "  export IDEA_PLUGINS_DIR=\"\$HOME/Library/Application Support/JetBrains/IntelliJIdea2025.3/plugins\""
  echo "  export ANDROID_STUDIO_PLUGINS_DIR=\"\$HOME/Library/Application Support/Google/AndroidStudio2025.2/plugins\""
  exit 1
fi

if [[ ! -d "$IDE_PLUGIN_DIR" ]]; then
  echo "Plugins directory not found: $IDE_PLUGIN_DIR"
  echo "Make sure your IDE has been run at least once to create the plugins directory."
  exit 1
fi

echo "Using plugins directory: $IDE_PLUGIN_DIR"

# Build the plugin using its own gradlew
echo "Building IDE plugin..."
(
  cd "$ROOT_DIR/android/ide-plugin"
  ./gradlew buildPlugin
)

PLUGIN_ZIP=$(find "$ROOT_DIR/android/ide-plugin/build/distributions" -maxdepth 1 -name '*.zip' -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -n 1 || true)
if [[ -z "$PLUGIN_ZIP" ]]; then
  echo "No plugin zip found in android/ide-plugin/build/distributions"
  exit 1
fi

PLUGIN_NAME="auto-mobile-ide-plugin"

# Remove old version and install new
echo "Installing plugin..."
rm -rf "${IDE_PLUGIN_DIR:?}/${PLUGIN_NAME:?}"
mkdir -p "$IDE_PLUGIN_DIR"
unzip -q "$PLUGIN_ZIP" -d "$IDE_PLUGIN_DIR"

echo "Installed $PLUGIN_NAME to $IDE_PLUGIN_DIR/$PLUGIN_NAME"

OS_NAME="$(uname -s | tr '[:upper:]' '[:lower:]')"

select_from_list() {
  local prompt="$1"
  shift
  local options=("$@")
  local count="${#options[@]}"

  if [[ "$count" -eq 0 ]]; then
    return 1
  fi

  echo "$prompt"
  local i=1
  for option in "${options[@]}"; do
    echo "  [$i] $option"
    i=$((i + 1))
  done
  read -r -p "Choose an option (1-$count): " selection
  if [[ -z "$selection" ]] || ! [[ "$selection" =~ ^[0-9]+$ ]]; then
    return 1
  fi
  if (( selection < 1 || selection > count )); then
    return 1
  fi
  echo "${options[$((selection - 1))]}"
}

restart_ide_macos() {
  local app_name="$1"
  if [[ -z "$app_name" ]]; then
    local known_apps=("Android Studio" "Android Studio Preview" "IntelliJ IDEA" "IntelliJ IDEA Ultimate" "IntelliJ IDEA Community")
    local running
    running="$(osascript -e 'tell application "System Events" to get name of (processes whose background only is false)' 2>/dev/null || true)"
    local matches=()
    for app in "${known_apps[@]}"; do
      if echo "$running" | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -Fxq "$app"; then
        matches+=("$app")
      fi
    done
    if [[ "${#matches[@]}" -eq 1 ]]; then
      app_name="${matches[0]}"
    elif [[ "${#matches[@]}" -gt 1 ]]; then
      app_name="$(select_from_list "Multiple IDEs are running. Which should be restarted?" "${matches[@]}")"
    fi
  fi

  if [[ -z "$app_name" ]]; then
    read -r -p "Enter the IDE app name to restart (e.g., IntelliJ IDEA): " app_name
  fi

  if [[ -z "$app_name" ]]; then
    echo "Skipping restart: no IDE app name provided."
    echo "Please restart your IDE manually to load the plugin."
    return 0
  fi

  echo "Restarting $app_name..."
  pkill -f "$app_name" 2>/dev/null || true
  sleep 1
  open -a "$app_name"
}

restart_ide_linux() {
  local ide_cmd="${IDE_CMD:-}"
  if [[ -z "$ide_cmd" ]]; then
    echo "Set IDE_CMD to the launch command for your IDE (e.g., idea.sh or studio.sh)."
    read -r -p "Enter IDE command to launch (leave empty to skip): " ide_cmd
  fi
  if [[ -z "$ide_cmd" ]]; then
    echo "Skipping restart: no IDE command provided."
    echo "Please restart your IDE manually to load the plugin."
    return 0
  fi

  echo "Restarting IDE via: $ide_cmd"
  pkill -f "studio|idea|intellij|android-studio" || true
  nohup "$ide_cmd" >/dev/null 2>&1 &
}

restart_ide_windows() {
  local ide_cmd="${IDE_CMD:-}"
  if [[ -z "$ide_cmd" ]]; then
    echo "Set IDE_CMD to the launch command for your IDE (e.g., idea64.exe or studio64.exe)."
    read -r -p "Enter IDE command to launch (leave empty to skip): " ide_cmd
  fi
  if [[ -z "$ide_cmd" ]]; then
    echo "Skipping restart: no IDE command provided."
    echo "Please restart your IDE manually to load the plugin."
    return 0
  fi

  echo "Restarting IDE via: $ide_cmd"
  taskkill //F //IM idea64.exe 2>/dev/null || true
  taskkill //F //IM studio64.exe 2>/dev/null || true
  cmd.exe /C start "" "$ide_cmd"
}

echo ""
echo "Plugin installed successfully!"
echo "Restart your IDE to load the plugin."
echo ""

if [[ "$OS_NAME" == "darwin" ]]; then
  restart_ide_macos "${IDE_APP_NAME:-}"
elif [[ "$OS_NAME" == "linux" ]]; then
  restart_ide_linux
else
  restart_ide_windows
fi
