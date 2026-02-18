/**
 * Secure temporary directory utilities.
 *
 * Provides consistent, secure temp directory creation with restrictive permissions.
 * Uses os.tmpdir() as the base for portability across platforms.
 */

import fs from "fs-extra";
import os from "os";
import path from "path";

/**
 * Base directory for all auto-mobile temp files.
 * Uses os.tmpdir() for portability (works on macOS, Linux, Windows).
 */
const AUTO_MOBILE_TEMP_BASE = path.join(os.tmpdir(), "auto-mobile");

/**
 * Restrictive directory permissions (owner read/write/execute only).
 * Prevents other users from accessing temp files.
 */
const SECURE_DIR_MODE = 0o700;

/**
 * Get a secure temp directory path for a given subdirectory.
 * Does NOT create the directory - use ensureSecureTempDir for that.
 *
 * @param subdirectory - Subdirectory name under auto-mobile temp base
 * @returns Full path to the temp directory
 */
export function getTempDir(subdirectory: string): string {
  return path.join(AUTO_MOBILE_TEMP_BASE, subdirectory);
}

/**
 * Synchronously ensure a secure temp directory exists with restrictive permissions.
 *
 * @param subdirectory - Subdirectory name under auto-mobile temp base
 * @returns Full path to the created/existing temp directory
 */
export function ensureSecureTempDirSync(subdirectory: string): string {
  const dir = getTempDir(subdirectory);
  fs.ensureDirSync(dir, { mode: SECURE_DIR_MODE });
  return dir;
}

// Common subdirectory constants for consistency
export const TEMP_SUBDIRS = {
  LOGS: "logs",
  TOOL_LOGS: "tool_logs",
  SCREENSHOTS: "screenshots",
  NAVIGATION_SCREENSHOTS: "navigation-screenshots",
  VIEW_HIERARCHY: "view_hierarchy",
  OBSERVE_RESULTS: "observe_results",
  WINDOW: "window",
  CACHE: "cache",
} as const;
