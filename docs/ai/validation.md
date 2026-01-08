# Project Validation

This document provides instructions for AI agents to validate the Bun + TypeScript AutoMobile project
builds correctly and all tests pass. After writing some implementation you should select the most relevant checks given
the changes made. At no point should we be writing any JavaScript.

```bash
# Compile main source code
bun run build

# Run lint with automatic fixes - do this first before attempting to fix lint errors via editing
bun run lint

# Run all tests
bun run test

# Run specific tests
bun run test -- --grep "Name of the test suite or test case"

# Reinstall MCP server
bun install

# Auto-fix shell script formatting with shfmt (Google style: 2-space indent)
# Only formats touched/staged files by default
bash scripts/shellcheck/apply_shfmt.sh

# Format all shell scripts in the project
ONLY_TOUCHED_FILES=false bash scripts/shellcheck/apply_shfmt.sh

# Auto-install shfmt if missing during apply
INSTALL_SHFMT_WHEN_MISSING=true bash scripts/shellcheck/apply_shfmt.sh
```

## XML Formatting

Auto-format XML files in the project. By default, formats only touched/staged files.

```bash
# Format touched/staged XML files (default)
bash scripts/xml/format_xml.sh

# Format all XML files in the project
ONLY_TOUCHED_FILES=false bash scripts/xml/format_xml.sh
```

**Prerequisites:**
- macOS: `brew install xmlstarlet`
- Linux: Install `xmlstarlet` via your package manager

**Features:**
- Formats with 2-space indentation (Android standard)
- Automatically stages formatted files
- Reports files touched and any failures
- Exits with non-zero code on errors
