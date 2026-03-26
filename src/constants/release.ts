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
export const APK_SHA256_CHECKSUM: string = "aa49272e44fc89b6b94950813e8b341b90c4ecfd233141120e9976ff8738520e"; // Empty = skip verification (local dev only)

/**
 * iOS CtrlProxy Release Constants
 *
 * CtrlProxy is distributed via GitHub releases as a prebuilt bundle.
 * The default "latest" version targets the most recent release.
 */
export const IOS_CTRL_PROXY_RELEASE_VERSION: string = "latest";
export const IOS_CTRL_PROXY_IPA_URL: string = IOS_CTRL_PROXY_RELEASE_VERSION === "latest"
  ? "https://github.com/kaeawc/auto-mobile/releases/latest/download/control-proxy.ipa"
  : `https://github.com/kaeawc/auto-mobile/releases/download/v${IOS_CTRL_PROXY_RELEASE_VERSION}/control-proxy.ipa`;
export const IOS_CTRL_PROXY_SHA256_CHECKSUM: string = "9ca869400167a4877be043185c57469c5c99c9d4b9c1ed8a31a1bcdb922adab8"; // Empty = skip verification (local dev only)
export const IOS_CTRL_PROXY_APP_HASH: string = ""; // Hash of CtrlProxyApp.app (device build), empty = skip verification
export const IOS_CTRL_PROXY_RUNNER_SHA256: string = ""; // SHA256 of runner binary (CtrlProxyUITests-Runner), empty = skip verification
