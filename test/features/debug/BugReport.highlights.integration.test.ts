import { beforeAll, describe, expect, test } from "bun:test";
import { AdbClient } from "../../../src/utils/android-cmdline-tools/AdbClient";
import { AndroidAccessibilityServiceManager } from "../../../src/utils/AccessibilityServiceManager";
import { BugReport } from "../../../src/features/debug/BugReport";
import { VisualHighlight } from "../../../src/features/debug/VisualHighlight";
import type { BootedDevice, HighlightShape } from "../../../src/models";

describe("BugReport - Highlight Integration Tests", () => {
  let device: BootedDevice | null = null;
  let bugReport: BugReport | null = null;
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
        console.warn("WARN: No Android devices connected. Skipping integration tests.");
        return;
      }

      device = devices[0];

      const adb = new AdbClient(device);
      const manager = AndroidAccessibilityServiceManager.getInstance(device, adb);
      manager.clearAvailabilityCache();
      const available = await manager.isAvailable();
      if (!available) {
        console.warn("WARN: Accessibility service is not available. Skipping integration tests.");
        device = null;
        return;
      }

      bugReport = new BugReport(device, adb);
      highlight = new VisualHighlight(device, adb);
    } catch (error) {
      console.warn(`WARN: Failed to set up device: ${error}`);
      device = null;
    }
  });

  test("captures highlight metadata and cleans up", async () => {
    if (!device || !bugReport || !highlight) {
      console.log("Skipping - no device available");
      return;
    }

    const highlightId = `bug-report-highlight-${Date.now()}`;
    const shape: HighlightShape = {
      type: "box",
      bounds: {
        x: 40,
        y: 80,
        width: 120,
        height: 90
      },
      style: {
        strokeColor: "#FF0000",
        strokeWidth: 4
      }
    };

    const report = await bugReport.execute({
      includeScreenshot: true,
      includeLogcat: false,
      includeRawHierarchy: false,
      highlights: [
        {
          id: highlightId,
          description: "Integration test highlight",
          shape
        }
      ],
      autoRemoveHighlights: true
    });

    const highlightEntry = report.highlights?.find(entry => entry.id === highlightId);
    expect(highlightEntry).toBeTruthy();
    expect(highlightEntry?.shape.type).toBe("box");
    expect(highlightEntry?.description).toBe("Integration test highlight");
    expect(Array.isArray(highlightEntry?.nearbyElements)).toBe(true);
    expect(report.screenshot).toBeDefined();

    // Note: highlight cleanup verification skipped as listHighlights/removeHighlight
    // methods are not yet implemented in VisualHighlight class
  });
});
