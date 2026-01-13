import { describe, expect, test } from "bun:test";
import { VisualHighlight, VisualHighlightClient } from "../../../src/features/debug/VisualHighlight";
import type { BootedDevice, HighlightOperationResult, HighlightShape } from "../../../src/models";

describe("VisualHighlight", () => {
  const androidDevice: BootedDevice = {
    deviceId: "test-device",
    platform: "android",
    isEmulator: true,
    name: "Test Device"
  };

  const highlightShape: HighlightShape = {
    type: "box",
    bounds: {
      x: 10,
      y: 20,
      width: 100,
      height: 80
    },
    style: {
      strokeColor: "#FF0000",
      strokeWidth: 4
    }
  };

  const pathShape: HighlightShape = {
    type: "path",
    points: [
      { x: 5, y: 10 },
      { x: 25, y: 40 },
      { x: 50, y: 20 }
    ],
    style: {
      strokeColor: "#FF8800",
      strokeWidth: 6,
      smoothing: "catmull-rom",
      tension: 0.6
    }
  };

  test("addHighlight returns parsed highlight response", async () => {
    const response: HighlightOperationResult = {
      success: true,
      highlights: [
        {
          id: "highlight-1",
          shape: highlightShape
        }
      ]
    };

    const fakeClient = {
      requestAddHighlight: async () => response
    };

    const highlight = new VisualHighlight(androidDevice, null, fakeClient as any);
    const result = await highlight.addHighlight("highlight-1", highlightShape);

    expect(result.success).toBe(true);
    expect(result.highlights.length).toBe(1);
  });

  test("addHighlight accepts path shapes", async () => {
    const response: HighlightOperationResult = {
      success: true,
      highlights: [
        {
          id: "path-1",
          shape: pathShape
        }
      ]
    };

    const fakeClient = {
      requestAddHighlight: async () => response
    };

    const highlight = new VisualHighlight(androidDevice, null, fakeClient as any);
    const result = await highlight.addHighlight("path-1", pathShape);

    expect(result.success).toBe(true);
    expect(result.highlights.length).toBe(1);
  });

  test("addHighlight rejects invalid shapes", async () => {
    const invalidShape: HighlightShape = {
      type: "box",
      bounds: {
        x: 10,
        y: 20,
        width: 0,
        height: 80
      }
    };

    const fakeClient = {
      requestAddHighlight: async () => ({
        success: true,
        highlights: []
      })
    };

    const highlight = new VisualHighlight(androidDevice, null, fakeClient as any);
    await expect(highlight.addHighlight("highlight-1", invalidShape)).rejects.toThrow();
  });

  test("addHighlight rejects invalid highlight responses", async () => {
    const fakeClient = {
      requestAddHighlight: async () => ({
        success: true,
        highlights: [
          {
            id: "",
            shape: highlightShape
          }
        ]
      })
    };

    const highlight = new VisualHighlight(androidDevice, null, fakeClient as any);
    await expect(highlight.addHighlight("highlight-1", highlightShape)).rejects.toThrow("Invalid highlight response");
  });

  test("listHighlights rejects non-Android devices", async () => {
    const iosDevice: BootedDevice = {
      deviceId: "ios-device",
      platform: "ios",
      isEmulator: true,
      name: "iPhone"
    };

    const fakeClient = {
      requestListHighlights: async () => ({
        success: true,
        highlights: []
      })
    };

    const highlight = new VisualHighlight(iosDevice, null, fakeClient as any);
    await expect(highlight.listHighlights()).rejects.toThrow("Visual highlights are only supported on Android devices.");
  });
});

describe("VisualHighlightClient", () => {
  const androidDevice: BootedDevice = {
    deviceId: "test-device",
    platform: "android",
    isEmulator: true,
    name: "Test Device"
  };

  const highlightShape: HighlightShape = {
    type: "circle",
    bounds: {
      x: 5,
      y: 10,
      width: 40,
      height: 40
    },
    style: {
      strokeColor: "#00FF00",
      strokeWidth: 3
    }
  };

  test("addHighlight throws when underlying operation fails", async () => {
    const fakeSessionManager = {
      ensureDeviceReady: async () => androidDevice
    };

    const fakeHighlight = {
      addHighlight: async () => ({
        success: false,
        error: "Service error",
        highlights: []
      })
    };

    const client = new VisualHighlightClient(
      fakeSessionManager as any,
      () => fakeHighlight as any
    );

    await expect(client.addHighlight("highlight-1", highlightShape, {
      deviceId: androidDevice.deviceId,
      platform: "android"
    })).rejects.toThrow("Service error");
  });

  test("listHighlights returns highlight entries on success", async () => {
    const fakeSessionManager = {
      ensureDeviceReady: async () => androidDevice
    };

    const fakeHighlight = {
      listHighlights: async () => ({
        success: true,
        highlights: [
          { id: "one", shape: highlightShape },
          { id: "two", shape: highlightShape }
        ]
      })
    };

    const client = new VisualHighlightClient(
      fakeSessionManager as any,
      () => fakeHighlight as any
    );

    const results = await client.listHighlights({
      deviceId: androidDevice.deviceId,
      platform: "android"
    });

    expect(results.highlights.length).toBe(2);
  });
});
