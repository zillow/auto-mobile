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
export const APK_SHA256_CHECKSUM: string = "f03ba457a37daa6a29aaefb070443ec6be2148d09bf2245202bec1f675f10a62"; // Empty = skip verification (local dev only)

/**
 * iOS XCTestService Release Constants
 *
 * XCTestService is distributed via GitHub releases as a prebuilt bundle.
 * The default "latest" version targets the most recent release.
 */
export const XCTESTSERVICE_RELEASE_VERSION: string = "latest";
export const XCTESTSERVICE_IPA_URL: string = XCTESTSERVICE_RELEASE_VERSION === "latest"
  ? "https://github.com/kaeawc/auto-mobile/releases/latest/download/XCTestService.ipa"
  : `https://github.com/kaeawc/auto-mobile/releases/download/v${XCTESTSERVICE_RELEASE_VERSION}/XCTestService.ipa`;
export const XCTESTSERVICE_SHA256_CHECKSUM: string = ""; // Empty = skip verification (local dev only)
export const XCTESTSERVICE_APP_HASH: string = ""; // Hash of XCTestServiceApp.app (device build), empty = skip verification
