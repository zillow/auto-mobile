#!/usr/bin/env bash

set -euo pipefail

# Validate Claude plugin structure
# This script validates the .claude-plugin/ directory structure and manifest files.

PLUGIN_DIR=".claude-plugin"

echo "Validating Claude plugin..."

# Check that plugin directory exists
if [[ ! -d "$PLUGIN_DIR" ]]; then
    echo "ERROR: Plugin directory '$PLUGIN_DIR' not found"
    exit 1
fi

# Check required files exist
required_files=(
    "$PLUGIN_DIR/plugin.json"
    "$PLUGIN_DIR/marketplace.json"
    "$PLUGIN_DIR/hooks.json"
)

for file in "${required_files[@]}"; do
    if [[ ! -f "$file" ]]; then
        echo "ERROR: Required file '$file' not found"
        exit 1
    fi
done

# Check skills directory exists and has files
if [[ ! -d "$PLUGIN_DIR/skills" ]]; then
    echo "ERROR: Skills directory '$PLUGIN_DIR/skills' not found"
    exit 1
fi

skill_count=$(find "$PLUGIN_DIR/skills" -name "*.md" -type f | wc -l | tr -d ' ')
if [[ "$skill_count" -eq 0 ]]; then
    echo "ERROR: No skill files found in '$PLUGIN_DIR/skills'"
    exit 1
fi

echo "Found $skill_count skill file(s)"

# Validate JSON files
echo "Validating JSON syntax..."
for json_file in "$PLUGIN_DIR"/*.json; do
    if ! python3 -c "import json; json.load(open('$json_file'))" 2>/dev/null; then
        echo "ERROR: Invalid JSON in '$json_file'"
        exit 1
    fi
    echo "  ✓ $json_file"
done

# Validate skill files have required frontmatter
echo "Validating skill files..."
for skill_file in "$PLUGIN_DIR/skills"/*.md; do
    skill_name=$(basename "$skill_file")

    # Check for YAML frontmatter
    if ! head -1 "$skill_file" | grep -q '^---$'; then
        echo "ERROR: Skill '$skill_name' missing YAML frontmatter"
        exit 1
    fi

    # Check for description field
    if ! grep -q '^description:' "$skill_file"; then
        echo "ERROR: Skill '$skill_name' missing 'description' field"
        exit 1
    fi

    # Check for allowed-tools field
    if ! grep -q '^allowed-tools:' "$skill_file"; then
        echo "ERROR: Skill '$skill_name' missing 'allowed-tools' field"
        exit 1
    fi

    echo "  ✓ $skill_name"
done

# Validate version consistency between package.json and plugin.json
echo "Validating version consistency..."
package_version=$(python3 -c "import json; print(json.load(open('package.json'))['version'])")
plugin_version=$(python3 -c "import json; print(json.load(open('$PLUGIN_DIR/plugin.json'))['version'])")

if [[ "$package_version" != "$plugin_version" ]]; then
    echo "ERROR: Version mismatch - package.json ($package_version) != plugin.json ($plugin_version)"
    exit 1
fi

echo "  ✓ Versions match: $package_version"

# Use claude CLI if available for additional validation
if command -v claude &>/dev/null; then
    echo "Running Claude CLI validation..."
    if ! claude plugin validate .; then
        echo "ERROR: Claude CLI validation failed"
        exit 1
    fi
else
    echo "Note: Claude CLI not installed, skipping advanced validation"
fi

echo ""
echo "✓ Claude plugin validation passed"
