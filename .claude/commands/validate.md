---
description: Run lint and build to validate changes
allowed-tools: Bash
---

Run validation for the AutoMobile project:

1. Run `pnpm run lint` to check and auto-fix linting issues
2. Run `pnpm run build` to compile TypeScript
3. Run `bash scripts/hadolint/validate_hadolint.sh` to validate the Dockerfile
4. Run `bash scripts/act/validate_act.sh` to validate act (GitHub Actions runner) setup

Report any errors that need manual fixes.
