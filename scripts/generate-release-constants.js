#!/usr/bin/env node

/**
 * Generate release constants from environment variables
 *
 * This script is run during CI/CD builds to inject the actual release version
 * and APK checksum into the source code before building.
 *
 * Environment variables:
 * - RELEASE_VERSION: The version being released (e.g., "1.0.0")
 * - APK_SHA256_CHECKSUM: The SHA256 checksum of the built APK
 *
 * If environment variables are not set, the script exits without modifying the file,
 * allowing local development to use the default values.
 */

const fs = require('fs');
const path = require('path');

const RELEASE_VERSION = process.env.RELEASE_VERSION;
const APK_SHA256_CHECKSUM = process.env.APK_SHA256_CHECKSUM;

// If neither env var is set, skip generation (use defaults)
if (!RELEASE_VERSION && !APK_SHA256_CHECKSUM) {
  console.log('ℹ️  No release environment variables set - using default constants');
  process.exit(0);
}

// Validate both are set if one is set
if (!RELEASE_VERSION || !APK_SHA256_CHECKSUM) {
  console.error('❌ Error: Both RELEASE_VERSION and APK_SHA256_CHECKSUM must be set');
  process.exit(1);
}

// Validate checksum format (64 hex characters)
if (!/^[a-f0-9]{64}$/.test(APK_SHA256_CHECKSUM)) {
  console.error('❌ Error: APK_SHA256_CHECKSUM must be a valid SHA256 hash (64 hex characters)');
  console.error(`   Got: ${APK_SHA256_CHECKSUM}`);
  process.exit(1);
}

const constantsPath = path.join(__dirname, '..', 'src', 'constants', 'release.ts');

const content = `/**
 * Release constants - DO NOT EDIT MANUALLY
 *
 * This file contains release-specific constants that are updated automatically
 * during the release process. The values below are defaults for local development.
 *
 * During CI/CD release builds, these values are replaced by the actual release
 * version and APK checksum via scripts/generate-release-constants.js
 */

export const RELEASE_VERSION = "${RELEASE_VERSION}";
export const APK_URL = \`https://github.com/kaeawc/auto-mobile/releases/download/v\${RELEASE_VERSION}/accessibility-service-debug.apk\`;
export const APK_SHA256_CHECKSUM = "${APK_SHA256_CHECKSUM}";
`;

try {
  fs.writeFileSync(constantsPath, content, 'utf8');
  console.log('✅ Generated release constants:');
  console.log(`   Version: ${RELEASE_VERSION}`);
  console.log(`   Checksum: ${APK_SHA256_CHECKSUM}`);
  console.log(`   File: ${constantsPath}`);
} catch (error) {
  console.error('❌ Failed to write release constants:', error.message);
  process.exit(1);
}
