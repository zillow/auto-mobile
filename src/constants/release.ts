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
  ? `https://github.com/kaeawc/auto-mobile/releases/latest/download/control-proxy-debug.apk`
  : `https://github.com/kaeawc/auto-mobile/releases/download/v${RELEASE_VERSION}/control-proxy-debug.apk`;
export const APK_SHA256_CHECKSUM: string = "0abb3aa8888a1f47b773943437ba2f8624b9ae11c7f2df3b883b131e69969eb1"; // Empty = skip verification (local dev only)

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
export const XCTESTSERVICE_SHA256_CHECKSUM: string = "61971ba3f116df1e145a01198ad500c4ebec0b5a9682e27849a7dc8ba2ee675b"; // Empty = skip verification (local dev only)
export const XCTESTSERVICE_APP_HASH: string = ""; // Hash of XCTestServiceApp.app (device build), empty = skip verification
export const XCTESTSERVICE_RUNNER_SHA256: string = ""; // SHA256 of runner binary (XCTestServiceUITests-Runner), empty = skip verification
