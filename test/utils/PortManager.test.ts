import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { PortManager } from "../../src/utils/PortManager";

describe("PortManager", () => {
  beforeEach(() => {
    // Reset before each test to ensure clean state (other tests may allocate ports)
    PortManager.reset();
  });

  afterEach(() => {
    PortManager.reset();
  });

  test("should allocate unique ports for different devices", () => {
    const port1 = PortManager.allocate("device-1");
    const port2 = PortManager.allocate("device-2");
    const port3 = PortManager.allocate("device-3");

    expect(port1).toBe(8765);
    expect(port2).toBe(8766);
    expect(port3).toBe(8767);
  });

  test("should return same port for same device", () => {
    const port1 = PortManager.allocate("device-1");
    const port2 = PortManager.allocate("device-1");
    const port3 = PortManager.allocate("device-1");

    expect(port1).toBe(port2);
    expect(port2).toBe(port3);
  });

  test("should release port and allow reallocation", () => {
    const port1 = PortManager.allocate("device-1");
    expect(port1).toBe(8765);

    PortManager.release("device-1");
    expect(PortManager.getPort("device-1")).toBeUndefined();

    // Device-2 should get the released port
    const port2 = PortManager.allocate("device-2");
    expect(port2).toBe(8765);
  });

  test("should reuse released ports in order", () => {
    PortManager.allocate("device-1"); // 8765
    PortManager.allocate("device-2"); // 8766
    PortManager.allocate("device-3"); // 8767

    PortManager.release("device-2"); // frees 8766

    // New device should get the first available port (8766)
    const newPort = PortManager.allocate("device-4");
    expect(newPort).toBe(8766);
  });

  test("should track allocated count", () => {
    expect(PortManager.getAllocatedCount()).toBe(0);

    PortManager.allocate("device-1");
    expect(PortManager.getAllocatedCount()).toBe(1);

    PortManager.allocate("device-2");
    expect(PortManager.getAllocatedCount()).toBe(2);

    PortManager.release("device-1");
    expect(PortManager.getAllocatedCount()).toBe(1);
  });

  test("should reset all allocations", () => {
    PortManager.allocate("device-1");
    PortManager.allocate("device-2");
    PortManager.allocate("device-3");

    expect(PortManager.getAllocatedCount()).toBe(3);

    PortManager.reset();

    expect(PortManager.getAllocatedCount()).toBe(0);
    expect(PortManager.getPort("device-1")).toBeUndefined();
  });

  test("should get WebSocket URL with allocated port", () => {
    const url1 = PortManager.getWebSocketUrl("device-1");
    const url2 = PortManager.getWebSocketUrl("device-2");

    expect(url1).toBe("ws://localhost:8765/ws");
    expect(url2).toBe("ws://localhost:8766/ws");
  });

  test("should return allocations map", () => {
    PortManager.allocate("device-1");
    PortManager.allocate("device-2");

    const allocations = PortManager.getAllocations();

    expect(allocations.size).toBe(2);
    expect(allocations.get("device-1")).toBe(8765);
    expect(allocations.get("device-2")).toBe(8766);
  });

  test("should expose base port and device port constants", () => {
    expect(PortManager.getBasePort()).toBe(8765);
    expect(PortManager.DEVICE_PORT).toBe(8765);
  });

  test("should handle release of non-existent device gracefully", () => {
    // Should not throw
    PortManager.release("non-existent-device");
    expect(PortManager.getAllocatedCount()).toBe(0);
  });

  test("should support many devices up to MAX_DEVICES", () => {
    // Allocate 50 devices (well under 100 limit)
    for (let i = 0; i < 50; i++) {
      const port = PortManager.allocate(`device-${i}`);
      expect(port).toBe(8765 + i);
    }

    expect(PortManager.getAllocatedCount()).toBe(50);
  });
});
