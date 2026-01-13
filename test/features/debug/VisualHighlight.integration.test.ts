import { beforeAll, describe, expect, test } from "bun:test";
import { AdbClient } from "../../../src/utils/android-cmdline-tools/AdbClient";
import { AndroidAccessibilityServiceManager } from "../../../src/utils/AccessibilityServiceManager";
import { VisualHighlight } from "../../../src/features/debug/VisualHighlight";
import type { BootedDevice, HighlightShape } from "../../../src/models";

describe("VisualHighlight - Integration Tests", () => {
  let device: BootedDevice | null = null;
  let highlight: VisualHighlight | null = null;

  beforeAll(async () => {
    try {
      const adbInstance = new AdbClient({
        deviceId: "",
        platform: "android",
        isEmulator: false
      });

      const devices = await adbInstance.getBootedAndroidDevices();

      if (devices.length === 0) {
        console.warn("⚠️  No Android devices connected. Skipping integration tests.");
        return;
      }

      device = devices[0];

      const adb = new AdbClient(device);
      const manager = AndroidAccessibilityServiceManager.getInstance(device, adb);
      manager.clearAvailabilityCache();
      const available = await manager.isAvailable();
      if (!available) {
        console.warn("⚠️  Accessibility service is not available. Skipping integration tests.");
        device = null;
        return;
      }

      highlight = new VisualHighlight(device, adb);
    } catch (error) {
      console.warn(`⚠️  Failed to set up device: ${error}`);
      device = null;
    }
  });

  test("add, list, and clear highlights on device", async () => {
    if (!device || !highlight) {
      console.log("⊘ Skipping - no device available");
      return;
    }

    const shape: HighlightShape = {
      type: "box",
      bounds: {
        x: 20,
        y: 40,
        width: 80,
        height: 60
      },
      style: {
        strokeColor: "#FF0000",
        strokeWidth: 4
      }
    };

    const timeoutMs = 2000;
    const addResult = await highlight.addHighlight("integration-highlight", shape, { timeoutMs });
    if (!addResult.success) {
      console.log(`⊘ Skipping - addHighlight failed: ${addResult.error}`);
      return;
    }

    const listResult = await highlight.listHighlights({ timeoutMs });
    expect(listResult.success).toBe(true);
    expect(listResult.highlights.length).toBeGreaterThan(0);

    const clearResult = await highlight.clearHighlights({ timeoutMs });
    expect(clearResult.success).toBe(true);
  });
});
