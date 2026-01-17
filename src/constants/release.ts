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
export const APK_SHA256_CHECKSUM: string = "a80b4e0101a66c47828b958aac882abe05824fe51393bb4cf2eacc82fa422169"; // Empty = skip verification (local dev only)

/**
 * iOS XCTestService Release Constants
 *
 * Phase 1: Build from source (current)
 * - XCTESTSERVICE_RELEASE_VERSION = "source" means build locally
 * - No remote bundle download
 *
 * Phase 2 (Future): GitHub release hosting
 * - Set XCTESTSERVICE_RELEASE_VERSION to a version number to download pre-built bundle
 * - This requires solving code signing for distribution
 */
export const XCTESTSERVICE_RELEASE_VERSION: string = "source"; // "source" = build locally, version = download
export const XCTESTSERVICE_BUNDLE_URL: string = XCTESTSERVICE_RELEASE_VERSION === "source"
  ? ""
  : `https://github.com/kaeawc/auto-mobile/releases/download/v${XCTESTSERVICE_RELEASE_VERSION}/xctestservice-bundle.zip`;
export const XCTESTSERVICE_SHA256_CHECKSUM: string = ""; // Empty = build from source
