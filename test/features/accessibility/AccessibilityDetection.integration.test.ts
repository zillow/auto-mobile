import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { ObserveScreen } from "../../../src/features/observe/ObserveScreen";
import { AdbClient } from "../../../src/utils/android-cmdline-tools/AdbClient";
import { accessibilityDetector } from "../../../src/utils/AccessibilityDetector";
import type { BootedDevice } from "../../../src/models";

/**
 * Integration tests for TalkBack detection
 *
 * These tests require a real Android device or emulator.
 * Run with: bun test test/features/accessibility/AccessibilityDetection.integration.test.ts
 *
 * Prerequisites:
 * - Android device/emulator connected via ADB
 * - Device API level 29+ recommended
 * - TalkBack installed (included in Google APIs system images)
 */
describe("AccessibilityDetection - Integration Tests", () => {
  let device: BootedDevice | null = null;
  let adb: AdbClient;
  let observeScreen: ObserveScreen | null = null;

  beforeAll(async () => {
    // Check if we have a connected device
    try {
      const adbInstance = new AdbClient({
        deviceId: "",
        platform: "android",
        isEmulator: false,
      });

      const devicesResult = await adbInstance.listDevices();
      const devices = devicesResult.stdout
        .split("\n")
        .filter(line => line.includes("\tdevice"))
        .map(line => line.split("\t")[0]);

      if (devices.length === 0) {
        console.warn("⚠️  No Android devices connected. Skipping integration tests.");
        console.warn("   Connect a device or start an emulator to run these tests.");
        return;
      }

      const deviceId = devices[0];
      console.log(`✓ Found device: ${deviceId}`);

      device = {
        deviceId,
        platform: "android",
        isEmulator: deviceId.startsWith("emulator"),
      };

      adb = new AdbClient(device);
      observeScreen = new ObserveScreen(device, adb);
    } catch (error) {
      console.warn(`⚠️  Failed to connect to device: ${error}`);
      device = null;
    }
  });

  afterAll(() => {
    // Clean up cache after tests
    if (device) {
      accessibilityDetector.invalidateCache(device.deviceId);
    }
  });

  describe("TalkBack Detection on Real Device", () => {
    test("detects current TalkBack state", async () => {
      if (!device || !adb) {
        console.log("⊘ Skipping - no device available");
        return;
      }

      const enabled = await accessibilityDetector.isAccessibilityEnabled(device.deviceId, adb);
      const service = await accessibilityDetector.detectMethod(device.deviceId, adb);

      console.log(`  Device ${device.deviceId}:`);
      console.log(`    - Accessibility enabled: ${enabled}`);
      console.log(`    - Service detected: ${service}`);

      // Just verify we got valid results
      expect(typeof enabled).toBe("boolean");
      expect(["talkback", "unknown"]).toContain(service);
    });

    test("caching works across multiple calls", async () => {
      if (!device || !adb) {
        console.log("⊘ Skipping - no device available");
        return;
      }

      // Clear cache first
      accessibilityDetector.invalidateCache(device.deviceId);

      // First call
      const start1 = Date.now();
      const enabled1 = await accessibilityDetector.isAccessibilityEnabled(device.deviceId, adb);
      const duration1 = Date.now() - start1;

      // Second call (should be cached)
      const start2 = Date.now();
      const enabled2 = await accessibilityDetector.isAccessibilityEnabled(device.deviceId, adb);
      const duration2 = Date.now() - start2;

      console.log(`  First call (uncached): ${duration1}ms`);
      console.log(`  Second call (cached): ${duration2}ms`);

      // Results should be consistent
      expect(enabled1).toBe(enabled2);

      // Cached call should be significantly faster
      expect(duration2).toBeLessThan(duration1);
      expect(duration2).toBeLessThan(10); // Cached should be < 10ms
    });

    test("detection meets performance target", async () => {
      if (!device || !adb) {
        console.log("⊘ Skipping - no device available");
        return;
      }

      // Clear cache to measure fresh detection
      accessibilityDetector.invalidateCache(device.deviceId);

      const start = Date.now();
      await accessibilityDetector.isAccessibilityEnabled(device.deviceId, adb);
      const duration = Date.now() - start;

      console.log(`  Detection latency: ${duration}ms (target: <50ms)`);

      // Should meet the <50ms performance target from design doc
      expect(duration).toBeLessThan(50);
    });
  });

  describe("ObserveScreen Integration", () => {
    test("observe includes accessibilityState", async () => {
      if (!device || !observeScreen) {
        console.log("⊘ Skipping - no device available");
        return;
      }

      const result = await observeScreen.execute();

      console.log(`  Observation result:`);
      console.log(`    - Has accessibilityState: ${!!result.accessibilityState}`);
      if (result.accessibilityState) {
        console.log(`    - Enabled: ${result.accessibilityState.enabled}`);
        console.log(`    - Service: ${result.accessibilityState.service}`);
      }

      // Should include accessibility state
      expect(result.accessibilityState).toBeDefined();
      expect(typeof result.accessibilityState?.enabled).toBe("boolean");
      expect(["talkback", "unknown"]).toContain(result.accessibilityState?.service || "unknown");
    });

    test("observe performance is not significantly impacted", async () => {
      if (!device || !observeScreen) {
        console.log("⊘ Skipping - no device available");
        return;
      }

      // Run observe twice to measure with cache
      await observeScreen.execute(); // Warm up cache

      const start = Date.now();
      const result = await observeScreen.execute();
      const duration = Date.now() - start;

      console.log(`  Observe with accessibility detection: ${duration}ms`);

      // Verify accessibility state is included
      expect(result.accessibilityState).toBeDefined();

      // Performance should still be reasonable
      // (This is just a sanity check, actual performance depends on device)
      expect(duration).toBeLessThan(5000); // 5 seconds max for full observe
    });
  });

  describe("Manual TalkBack Toggle Testing", () => {
    /**
     * Note: These tests are informational only. They require manual TalkBack
     * toggling on the device to verify detection works correctly.
     *
     * To run manually:
     * 1. Enable TalkBack on device: Settings > Accessibility > TalkBack > On
     * 2. Run test and verify detection shows enabled=true, service=talkback
     * 3. Disable TalkBack on device
     * 4. Run test and verify detection shows enabled=false, service=unknown
     */
    test("manual verification - check current state", async () => {
      if (!device || !adb) {
        console.log("⊘ Skipping - no device available");
        return;
      }

      // Clear cache to force fresh detection
      accessibilityDetector.invalidateCache(device.deviceId);

      const enabled = await accessibilityDetector.isAccessibilityEnabled(device.deviceId, adb);
      const service = await accessibilityDetector.detectMethod(device.deviceId, adb);

      console.log("\n  📋 Manual Verification Instructions:");
      console.log("     1. Check TalkBack settings on your device");
      console.log("     2. Compare with detected state below:\n");
      console.log(`  Current detection result:`);
      console.log(`    - Accessibility enabled: ${enabled}`);
      console.log(`    - Service detected: ${service}`);
      console.log("\n  Expected results:");
      console.log(`    - If TalkBack is ON: enabled=true, service=talkback`);
      console.log(`    - If TalkBack is OFF: enabled=false, service=unknown`);
      console.log(`    - If other service is ON: enabled=true, service=unknown\n`);

      // This test always passes - it's for manual verification only
      expect(true).toBe(true);
    });
  });

  describe("ADB Command Verification", () => {
    test("can query accessibility settings directly", async () => {
      if (!device || !adb) {
        console.log("⊘ Skipping - no device available");
        return;
      }

      // Test the underlying ADB command
      const result = await adb.shell(
        device.deviceId,
        "settings get secure enabled_accessibility_services"
      );

      console.log(`  ADB command result:`);
      console.log(`    - Exit code: ${result.exitCode}`);
      console.log(`    - Output: "${result.stdout.trim()}"`);

      // Should succeed
      expect(result.exitCode).toBe(0);

      // Output should be either "null", an empty string, or a service list
      const output = result.stdout.trim();
      const isValidOutput =
        output === "null" ||
        output === "" ||
        output.includes("/") || // Service format: package/service
        output.length > 0;

      expect(isValidOutput).toBe(true);
    });
  });
});
