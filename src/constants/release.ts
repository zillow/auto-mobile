/**
 * Release constants - DO NOT EDIT MANUALLY
 *
 * This file contains release-specific constants that are updated automatically.
 * The values below are defaults for local development.
 *
 * The APK checksum is updated by the merge workflow when the accessibility
 * service APK changes. The release workflow verifies the checksum matches
 * the built APK before publishing.
 *
 * During CI/CD release builds, the release version is replaced via
 * scripts/generate-release-constants.sh
 *
 * For local development, RELEASE_VERSION "latest" fetches from the most recent
 * GitHub release, and the empty checksum skips verification (not recommended for production).
 */

export const RELEASE_VERSION: string = "latest";
export const APK_URL: string = RELEASE_VERSION === "latest"
  ? `https://github.com/kaeawc/auto-mobile/releases/latest/download/accessibility-service-debug.apk`
  : `https://github.com/kaeawc/auto-mobile/releases/download/v${RELEASE_VERSION}/accessibility-service-debug.apk`;
export const APK_SHA256_CHECKSUM: string = "595f7acb1da7c8f772f21011f8232b54659d33ce2b3f917e093e9f74ce23bb32"; // Empty = skip verification (local dev only)
