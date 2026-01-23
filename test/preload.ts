/**
 * Test preload script - runs before tests to set up global hooks
 *
 * This ensures proper cleanup of resources that could prevent the test
 * process from exiting (e.g., adb daemon on Windows).
 */
import { spawnSync } from "child_process";

// Kill any existing adb server BEFORE tests start
// This prevents tests from inheriting a running daemon
spawnSync("adb", ["kill-server"], { stdio: "ignore" });

// Also register cleanup for when process tries to exit
// This catches any adb daemon started during tests
process.on("beforeExit", () => {
  spawnSync("adb", ["kill-server"], { stdio: "ignore" });
});
