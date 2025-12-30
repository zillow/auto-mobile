/**
 * Release constants - DO NOT EDIT MANUALLY
 *
 * This file contains release-specific constants that are updated automatically
 * during the release process. The values below are defaults for local development.
 *
 * During CI/CD release builds, these values are replaced by the actual release
 * version and APK checksum via scripts/generate-release-constants.js
 */

export const RELEASE_VERSION = "0.0.6";
export const APK_URL = `https://github.com/kaeawc/auto-mobile/releases/download/v${RELEASE_VERSION}/accessibility-service-debug.apk`;
export const APK_SHA256_CHECKSUM = "979fa82f632d004a3f94dd7cd366be2a8bbab55f19d0bfd722f852c3cea674d4";
