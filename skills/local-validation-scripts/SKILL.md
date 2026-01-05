---
name: local-validation-scripts
description: Use this skill when running project validations; the scripts/ directory contains local validation helpers and should be used instead of reimplementing checks.
---

# Local Validation Scripts

Use the scripts under `scripts/` for local validations.

- Check `scripts/` for purpose-built validation commands before writing new ones.
- Prefer `bash scripts/<path>.sh` when a validation exists there.
- Keep validation output concise and report any manual fixes needed.
