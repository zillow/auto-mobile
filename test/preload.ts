/**
 * Test preload script - runs before tests to set up global hooks
 *
 * This ensures proper cleanup of resources that could prevent the test
 * process from exiting (e.g., adb daemon on Windows).
 */
import { afterAll } from "bun:test";
import { AdbClient } from "../src/utils/android-cmdline-tools/AdbClient";

// Register global cleanup after all tests complete
afterAll(async () => {
  // Kill adb server to prevent orphan daemon from blocking process exit
  // This is especially important on Windows where the daemon prevents bun from exiting
  await AdbClient.killServer();
});
