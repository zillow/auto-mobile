#!/usr/bin/env bash
#
# Release script for AutoMobile Android libraries
#
# This script handles the full release lifecycle:
# 1. Updates VERSION_NAME to release version
# 2. Commits and tags the release
# 3. Publishes to Maven Central
# 4. Bumps to next SNAPSHOT version
# 5. Commits and pushes everything
#
# Usage:
#   ./scripts/release/release.sh 0.0.10
#   ./scripts/release/release.sh --dry-run 0.0.10
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GRADLE_PROPERTIES="$REPO_ROOT/android/gradle.properties"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

dry_run=false
version=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      dry_run=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [--dry-run] <version>"
      echo ""
      echo "Options:"
      echo "  --dry-run    Show what would happen without making changes"
      echo "  --help       Show this help message"
      echo ""
      echo "Example:"
      echo "  $0 0.0.10           # Release version 0.0.10"
      echo "  $0 --dry-run 0.0.10 # Dry run for version 0.0.10"
      exit 0
      ;;
    *)
      if [[ -z "$version" ]]; then
        version="$1"
      else
        echo -e "${RED}Error: Unexpected argument: $1${NC}" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ -z "$version" ]]; then
  echo -e "${RED}Error: Version argument required${NC}" >&2
  echo "Usage: $0 [--dry-run] <version>"
  exit 1
fi

# Validate version format (semver without -SNAPSHOT)
if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo -e "${RED}Error: Invalid version format: $version${NC}" >&2
  echo "Expected format: X.Y.Z (e.g., 0.0.10)"
  exit 1
fi

# Calculate next snapshot version (bump minor, reset patch)
IFS='.' read -r major minor _patch <<< "$version"
next_minor=$((minor + 1))
next_snapshot="${major}.${next_minor}.0-SNAPSHOT"

echo -e "${GREEN}Release Configuration:${NC}"
echo "  Release version: $version"
echo "  Next snapshot:   $next_snapshot"
echo "  Dry run:         $dry_run"
echo ""

# Function to update VERSION_NAME in gradle.properties
update_gradle_version() {
  local new_version="$1"
  local file="$GRADLE_PROPERTIES"

  if [[ "$dry_run" == true ]]; then
    echo -e "${YELLOW}[DRY RUN]${NC} Would update VERSION_NAME to $new_version in $file"
    return 0
  fi

  # Use sed to replace VERSION_NAME line
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s/^VERSION_NAME=.*/VERSION_NAME=$new_version/" "$file"
  else
    sed -i "s/^VERSION_NAME=.*/VERSION_NAME=$new_version/" "$file"
  fi

  echo -e "${GREEN}Updated${NC} VERSION_NAME to $new_version"
}

# Function to run git commands
run_git() {
  if [[ "$dry_run" == true ]]; then
    echo -e "${YELLOW}[DRY RUN]${NC} git $*"
    return 0
  fi
  git "$@"
}

# Function to run gradle commands
run_gradle() {
  if [[ "$dry_run" == true ]]; then
    echo -e "${YELLOW}[DRY RUN]${NC} ./gradlew $*"
    return 0
  fi
  (cd "$REPO_ROOT/android" && ./gradlew "$@")
}

# Ensure we're on main branch and up to date
current_branch=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)
if [[ "$current_branch" != "main" && "$dry_run" == false ]]; then
  echo -e "${YELLOW}Warning: Not on main branch (currently on $current_branch)${NC}"
  read -p "Continue anyway? [y/N] " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Check for uncommitted changes
if [[ -n "$(git -C "$REPO_ROOT" status --porcelain)" && "$dry_run" == false ]]; then
  echo -e "${RED}Error: Working directory has uncommitted changes${NC}" >&2
  echo "Please commit or stash your changes before releasing."
  exit 1
fi

echo ""
echo -e "${GREEN}Step 1: Update to release version ($version)${NC}"
update_gradle_version "$version"

echo ""
echo -e "${GREEN}Step 2: Commit release version${NC}"
run_git -C "$REPO_ROOT" add android/gradle.properties
run_git -C "$REPO_ROOT" commit -m "chore: prepare release $version"

echo ""
echo -e "${GREEN}Step 3: Create release tag (v$version)${NC}"
run_git -C "$REPO_ROOT" tag -a "v$version" -m "Release v$version"

echo ""
echo -e "${GREEN}Step 4: Publish to Maven Central${NC}"
run_gradle :junit-runner:publishAndReleaseToMavenCentral :auto-mobile-sdk:publishAndReleaseToMavenCentral --no-configuration-cache

echo ""
echo -e "${GREEN}Step 5: Update to next snapshot version ($next_snapshot)${NC}"
update_gradle_version "$next_snapshot"

echo ""
echo -e "${GREEN}Step 6: Commit snapshot version${NC}"
run_git -C "$REPO_ROOT" add android/gradle.properties
run_git -C "$REPO_ROOT" commit -m "chore: prepare next development version"

echo ""
echo -e "${GREEN}Step 7: Push commits and tags${NC}"
run_git -C "$REPO_ROOT" push origin HEAD
run_git -C "$REPO_ROOT" push origin "v$version"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Release complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Published artifacts:"
echo "  - dev.jasonpearson.auto-mobile:auto-mobile-junit-runner:$version"
echo "  - dev.jasonpearson.auto-mobile:auto-mobile-sdk:$version"
echo ""
echo "Next steps:"
echo "  - The tag push will trigger the release.yml workflow"
echo "  - This will publish npm, Docker, and create GitHub Release"
echo "  - Maven Central artifacts should be available shortly"
echo ""
echo "Maven Central URLs (may take a few minutes to appear):"
echo "  https://central.sonatype.com/artifact/dev.jasonpearson.auto-mobile/auto-mobile-junit-runner/$version"
echo "  https://central.sonatype.com/artifact/dev.jasonpearson.auto-mobile/auto-mobile-sdk/$version"
