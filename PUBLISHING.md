# npm Publishing

This guide covers publishing `@kaeawc/auto-mobile` to npm.

## Prerequisites

- npm account with access to the `@kaeawc` scope.
- Logged in locally: `npm login` and `npm whoami`.
- Clean working tree and an up-to-date build.

## Build and verify

```sh
bun run build
npm pack --dry-run
```

Confirm the tarball only includes `dist/` (per `package.json`).

## Version bump

Pick one:

```sh
npm version patch
# or: npm version minor
# or: npm version major
```

This updates `package.json` and creates a git tag.

## Publish

```sh
npm publish --access public
```

`publishConfig.access` is already set to `public`, so the flag is optional.

## Notes

- `prepublishOnly` temporarily rewrites `README.md` via `scripts/npm/transform-readme.js`.
- `postpublish` restores `README.md` from the backup.
- Release workflow updates `src/constants/release.ts` using `scripts/generate-release-constants.sh` with `RELEASE_VERSION` set.

## Troubleshooting

- `401 Unauthorized`: run `npm login` and re-check `npm whoami`.
- `403 Forbidden` or `You do not have permission`: confirm access to `@kaeawc`.
- `You cannot publish over the previously published versions`: bump version and retry.
