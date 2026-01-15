import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { RequestManager } from "../../src/utils/RequestManager";
import { Timer } from "../../src/utils/SystemTimer";

describe("RequestManager", () => {
  let manager: RequestManager;
  let mockTimer: Timer;
  let timeoutCallbacks: Map<number, () => void>;
  let nextTimeoutId: number;

  beforeEach(() => {
    timeoutCallbacks = new Map();
    nextTimeoutId = 1;

    mockTimer = {
      setTimeout: (callback: () => void, _ms: number) => {
        const id = nextTimeoutId++;
        timeoutCallbacks.set(id, callback);
        return id as any;
      },
      clearTimeout: (id: any) => {
        timeoutCallbacks.delete(id as number);
      },
      setInterval: () => 0 as any,
      clearInterval: () => {},
    };

    manager = new RequestManager(mockTimer);
  });

  afterEach(() => {
    manager.reset();
  });

  test("should generate unique request IDs", () => {
    const id1 = manager.generateId("screenshot");
    const id2 = manager.generateId("screenshot");
    const id3 = manager.generateId("swipe");

    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(id1).toContain("screenshot");
    expect(id3).toContain("swipe");
  });

  test("should register and resolve requests", async () => {
    const id = manager.generateId("test");
    const promise = manager.register<{ success: boolean }>(
      id,
      "test",
      5000,
      () => ({ success: false })
    );

    expect(manager.isPending(id)).toBe(true);
    expect(manager.getPendingCount()).toBe(1);

    // Resolve the request
    const resolved = manager.resolve(id, { success: true });
    expect(resolved).toBe(true);

    const result = await promise;
    expect(result).toEqual({ success: true });

    expect(manager.isPending(id)).toBe(false);
    expect(manager.getPendingCount()).toBe(0);
  });

  test("should timeout requests after specified duration", async () => {
    const id = manager.generateId("test");
    const promise = manager.register<{ success: boolean; error?: string }>(
      id,
      "test",
      1000,
      (_id, _type, timeoutMs) => ({ success: false, error: `Timeout after ${timeoutMs}ms` })
    );

    expect(manager.isPending(id)).toBe(true);

    // Trigger the timeout callback
    const timeoutCallback = Array.from(timeoutCallbacks.values())[0];
    timeoutCallback();

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error).toContain("Timeout after 1000ms");

    expect(manager.isPending(id)).toBe(false);
  });

  test("should cancel timeout when request is resolved", async () => {
    const id = manager.generateId("test");
    const promise = manager.register<{ success: boolean }>(
      id,
      "test",
      5000,
      () => ({ success: false })
    );

    expect(timeoutCallbacks.size).toBe(1);

    // Resolve the request
    manager.resolve(id, { success: true });

    // Timeout should be cancelled
    expect(timeoutCallbacks.size).toBe(0);

    const result = await promise;
    expect(result.success).toBe(true);
  });

  test("should handle multiple concurrent requests of same type", async () => {
    const id1 = manager.generateId("screenshot");
    const id2 = manager.generateId("screenshot");
    const id3 = manager.generateId("screenshot");

    const promise1 = manager.register<{ id: string }>(
      id1, "screenshot", 5000, () => ({ id: "timeout" })
    );
    const promise2 = manager.register<{ id: string }>(
      id2, "screenshot", 5000, () => ({ id: "timeout" })
    );
    const promise3 = manager.register<{ id: string }>(
      id3, "screenshot", 5000, () => ({ id: "timeout" })
    );

    expect(manager.getPendingCount()).toBe(3);

    // Resolve in different order
    manager.resolve(id2, { id: "second" });
    manager.resolve(id3, { id: "third" });
    manager.resolve(id1, { id: "first" });

    const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);

    expect(result1.id).toBe("first");
    expect(result2.id).toBe("second");
    expect(result3.id).toBe("third");
  });

  test("should return false when resolving unknown request ID", () => {
    const resolved = manager.resolve("unknown-id", { success: true });
    expect(resolved).toBe(false);
  });

  test("should reject requests", async () => {
    const id = manager.generateId("test");
    const promise = manager.register<{ success: boolean }>(
      id,
      "test",
      5000,
      () => ({ success: false })
    );

    const rejected = manager.reject(id, new Error("Test error"));
    expect(rejected).toBe(true);

    await expect(promise).rejects.toThrow("Test error");
    expect(manager.isPending(id)).toBe(false);
  });

  test("should cancel all pending requests", async () => {
    const id1 = manager.generateId("test1");
    const id2 = manager.generateId("test2");

    const promise1 = manager.register<{ success: boolean }>(
      id1, "test1", 5000, () => ({ success: false })
    );
    const promise2 = manager.register<{ success: boolean }>(
      id2, "test2", 5000, () => ({ success: false })
    );

    expect(manager.getPendingCount()).toBe(2);

    manager.cancelAll(new Error("Connection closed"));

    expect(manager.getPendingCount()).toBe(0);

    await expect(promise1).rejects.toThrow("Connection closed");
    await expect(promise2).rejects.toThrow("Connection closed");
  });

  test("should return pending IDs for debugging", () => {
    const id1 = manager.generateId("test1");
    const id2 = manager.generateId("test2");

    manager.register(id1, "test1", 5000, () => ({}));
    manager.register(id2, "test2", 5000, () => ({}));

    const pendingIds = manager.getPendingIds();
    expect(pendingIds).toContain(id1);
    expect(pendingIds).toContain(id2);
    expect(pendingIds.length).toBe(2);
  });

  test("should reset counter on reset", () => {
    manager.generateId("test");
    manager.generateId("test");
    manager.generateId("test");

    manager.reset();

    // Counter should be reset - new IDs should start from 1 again
    const newId = manager.generateId("test");
    expect(newId).toContain("_1");
  });
});
