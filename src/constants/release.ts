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
export const APK_SHA256_CHECKSUM: string = "41a8e9a3ac601ea275060cb7b3336ad7d52ea3e8cadd1139e127c6d72d4408d5"; // Empty = skip verification (local dev only)

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
export const XCTESTSERVICE_SHA256_CHECKSUM: string = "3a3818df9d84f0f7f864a6c182c87c512bbbfe9e898cd49e497f2b3cc48f1a4c"; // Empty = skip verification (local dev only)
export const XCTESTSERVICE_APP_HASH: string = ""; // Hash of XCTestServiceApp.app (device build), empty = skip verification
export const XCTESTSERVICE_RUNNER_SHA256: string = ""; // SHA256 of runner binary (XCTestServiceUITests-Runner), empty = skip verification
