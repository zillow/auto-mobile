# npm Publishing

This guide covers publishing `@kaeawc/auto-mobile` to npm.
For Android JUnitRunner (Maven Central), see `docs/design-docs/plat/android/junitrunner.md`.

## Prerequisites

- npm account with access to the `@kaeawc` scope.
- Logged in locally: `npm login` and `npm whoami` (local publishing only).
- Clean working tree and an up-to-date build.
- Trusted Publisher configured for GitHub Actions (`.github/workflows/release.yml`) for automated releases.

## Build and verify

```sh
bun run build
npm pack --dry-run
```

Confirm the tarball only includes `dist/` (per `package.json`).

## Version bump

Use the GitHub Actions workflow **Prepare Release** to bump versions, update the changelog, and refresh the APK checksum. It opens a PR on `main` and auto-merges it. The merge creates the git tag that triggers the release workflow.

## Publish

### GitHub Actions (Trusted Publisher)

Publishing on tags uses GitHub Actions OIDC credentials. No npm token is required.

### Local publish

```sh
npm publish --access public
```

`publishConfig.access` is already set to `public`, so the flag is optional.

## Notes

- `prepublishOnly` temporarily rewrites `README.md` via `scripts/npm/transform-readme.js`.
- `postpublish` restores `README.md` from the backup.
- Prepare Release updates `src/constants/release.ts` with the latest APK checksum.
- Release workflow updates `src/constants/release.ts` using `scripts/generate-release-constants.sh` with `RELEASE_VERSION` set.
- Release workflow uses `npm publish --provenance` with npm CLI 11.5.1+.

## Troubleshooting

- `401 Unauthorized`: run `npm login` and re-check `npm whoami`.
- `403 Forbidden` or `You do not have permission`: confirm access to `@kaeawc`.
- `You cannot publish over the previously published versions`: bump version and retry.
