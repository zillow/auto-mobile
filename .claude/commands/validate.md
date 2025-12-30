---
description: Run lint and build to validate changes
allowed-tools: Bash
---

Run validation for the AutoMobile project:

1. Run `npm run lint` to check and auto-fix linting issues
2. Run `npm run build` to compile TypeScript
3. Run `bash scripts/hadolint/validate_hadolint.sh` to validate the Dockerfile

Report any errors that need manual fixes.
