import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { SessionManager } from "../../src/daemon/sessionManager";

describe("SessionManager", () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager();
  });

  afterEach(() => {
    sessionManager.stopCleanupTimer();
  });

  describe("createSession", () => {
    test("should create new session with assigned device", async () => {
      const session = await sessionManager.createSession("session-1", "emulator-5554");
      expect(session.sessionId).toBe("session-1");
      expect(session.assignedDevice).toBe("emulator-5554");
      expect(session.cacheData).toEqual({});
      expect(typeof session.createdAt).toBe("number");
      expect(typeof session.lastUsedAt).toBe("number");
      expect(typeof session.expiresAt).toBe("number");
    });

    test("should return existing session if already created", async () => {
      const session1 = await sessionManager.createSession("session-1", "emulator-5554");
      const session2 = await sessionManager.createSession("session-1", "emulator-5556");
      expect(session1.sessionId).toBe(session2.sessionId);
      expect(session1.assignedDevice).toBe("emulator-5554");
      expect(session2.assignedDevice).toBe("emulator-5554"); // Should return original
    });

    test("should set correct expiration time for session", async () => {
      const beforeCreate = Date.now();
      const session = await sessionManager.createSession("session-1", "emulator-5554");
      const afterCreate = Date.now();
      const expectedMinExpiry = beforeCreate + 30 * 60 * 1000; // 30 minutes
      const expectedMaxExpiry = afterCreate + 30 * 60 * 1000;
      expect(session.expiresAt).toBeGreaterThanOrEqual(expectedMinExpiry);
      expect(session.expiresAt).toBeLessThanOrEqual(expectedMaxExpiry);
    });
  });

  describe("getOrCreateSession", () => {
    test("should return existing session without creating new one", async () => {
      await sessionManager.createSession("session-1", "emulator-5554");
      const session = await sessionManager.getOrCreateSession("session-1");
      expect(session.sessionId).toBe("session-1");
      expect(sessionManager.getActiveSessionCount()).toBe(1);
    });

    test("should update last used time when getting session", async () => {
      const session1 = await sessionManager.createSession("session-1", "emulator-5554");
      const initialLastUsed = session1.lastUsedAt;
      const initialExpiry = session1.expiresAt;
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      const session2 = await sessionManager.getOrCreateSession("session-1");
      expect(session2.lastUsedAt).toBeGreaterThanOrEqual(initialLastUsed);
      expect(session2.expiresAt).toBeGreaterThan(initialExpiry);
    });

    test("should throw error for non-existent session without device pool", async () => {
      try {
        await sessionManager.getOrCreateSession("non-existent");
        expect.unreachable("Should have thrown error");
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        expect((error as Error).message).toContain("not found");
      }
    });

    test("should return null session when expired session requested", async () => {
      const session = await sessionManager.createSession("session-1", "emulator-5554");
      // Force expiration by setting expiresAt to past
      const oneSecondAgo = Date.now() - 1000;
      (session as any).expiresAt = oneSecondAgo;
      const retrieved = sessionManager.getSession("session-1");
      expect(retrieved).toBeNull();
    });
  });

  describe("cache management", () => {
    test("should update session cache data", async () => {
      await sessionManager.createSession("session-1", "emulator-5554");
      sessionManager.updateSessionCache("session-1", {
        lastHierarchy: "test-hierarchy",
        lastScreenshot: "base64-data",
      });
      const cache = sessionManager.getSessionCache("session-1");
      expect(cache?.lastHierarchy).toBe("test-hierarchy");
      expect(cache?.lastScreenshot).toBe("base64-data");
    });

    test("should get session cache without modifying other fields", async () => {
      await sessionManager.createSession("session-1", "emulator-5554");
      sessionManager.updateSessionCache("session-1", {
        customData: { key: "value" },
      });
      const session1 = sessionManager.getSession("session-1");
      const initialLastUsed = session1?.lastUsedAt ?? 0;
      await new Promise(resolve => setTimeout(resolve, 10));
      const cache = sessionManager.getSessionCache("session-1");
      const session2 = sessionManager.getSession("session-1");
      expect(cache?.customData).toEqual({ key: "value" });
      expect((session2?.lastUsedAt ?? 0)).toBeGreaterThan(initialLastUsed);
    });

    test("should clear specific cache key", async () => {
      await sessionManager.createSession("session-1", "emulator-5554");
      sessionManager.updateSessionCache("session-1", {
        lastHierarchy: "test-hierarchy",
        lastScreenshot: "base64-data",
      });
      sessionManager.clearSessionCache("session-1", "lastHierarchy");
      const cache = sessionManager.getSessionCache("session-1");
      expect(cache?.lastHierarchy).toBeUndefined();
      expect(cache?.lastScreenshot).toBe("base64-data");
    });

    test("should clear all cache when no key specified", async () => {
      await sessionManager.createSession("session-1", "emulator-5554");
      sessionManager.updateSessionCache("session-1", {
        lastHierarchy: "test-hierarchy",
        lastScreenshot: "base64-data",
        customData: { key: "value" },
      });
      sessionManager.clearSessionCache("session-1");
      const cache = sessionManager.getSessionCache("session-1");
      expect(cache).toEqual({});
    });
  });

  describe("releaseSession", () => {
    test("should release session and return device id", async () => {
      await sessionManager.createSession("session-1", "emulator-5554");
      const deviceId = await sessionManager.releaseSession("session-1");
      expect(deviceId).toBe("emulator-5554");
      expect(sessionManager.getSession("session-1")).toBeNull();
    });

    test("should return null for non-existent session", async () => {
      const deviceId = await sessionManager.releaseSession("non-existent");
      expect(deviceId).toBeNull();
    });
  });

  describe("statistics", () => {
    test("should return correct session statistics", async () => {
      await sessionManager.createSession("session-1", "emulator-5554");
      await sessionManager.createSession("session-2", "emulator-5556");
      const stats = sessionManager.getStats();
      expect(stats.totalSessions).toBe(2);
      expect(stats.activeSessions).toBe(2);
      expect(stats.expiredSessions).toBe(0);
      expect(stats.assignedDevices).toBe(2);
    });
  });
});
