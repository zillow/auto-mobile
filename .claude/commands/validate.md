---
description: Run lint and build to validate changes
allowed-tools: Bash
---

Run validation for the AutoMobile project:

1. Run `bun run lint` to check and auto-fix linting issues
2. Run `bun run build` to compile TypeScript
3. Run `bash scripts/hadolint/validate_hadolint.sh` to validate the Dockerfile
4. Run `bash scripts/act/validate_act.sh` to validate act (GitHub Actions runner) setup
5. Run `bash scripts/ios/swift-build.sh` to build Swift packages
6. Run `ONLY_TOUCHED_FILES=false bash scripts/swiftformat/validate_swiftformat.sh` to validate Swift formatting
7. Run `ONLY_TOUCHED_FILES=false bash scripts/swiftlint/validate_swiftlint.sh` to validate Swift linting

Report any errors that need manual fixes.
