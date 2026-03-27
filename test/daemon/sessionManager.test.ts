import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { SessionManager } from "../../src/daemon/sessionManager";
import { FakeTimer } from "../fakes/FakeTimer";

describe("SessionManager", () => {
  let sessionManager: SessionManager;
  let fakeTimer: FakeTimer;

  beforeEach(() => {
    fakeTimer = new FakeTimer();
    sessionManager = new SessionManager(fakeTimer);
  });

  afterEach(() => {
    sessionManager.stopCleanupTimer();
  });

  describe("createSession", () => {
    test("should create new session with assigned device", async () => {
      const session = await sessionManager.createSession("session-1", "emulator-5554", "android");
      expect(session.sessionId).toBe("session-1");
      expect(session.assignedDevice).toBe("emulator-5554");
      expect(session.cacheData).toEqual({});
      expect(typeof session.createdAt).toBe("number");
      expect(typeof session.lastUsedAt).toBe("number");
      expect(typeof session.expiresAt).toBe("number");
    });

    test("should return existing session if already created", async () => {
      const session1 = await sessionManager.createSession("session-1", "emulator-5554", "android");
      const session2 = await sessionManager.createSession("session-1", "emulator-5556", "android");
      expect(session1.sessionId).toBe(session2.sessionId);
      expect(session1.assignedDevice).toBe("emulator-5554");
      expect(session2.assignedDevice).toBe("emulator-5554"); // Should return original
    });

    test("should set correct expiration time for session", async () => {
      const beforeCreate = fakeTimer.now();
      const session = await sessionManager.createSession("session-1", "emulator-5554", "android");
      const expectedExpiry = beforeCreate + 30 * 60 * 1000; // 30 minutes
      expect(session.expiresAt).toBe(expectedExpiry);
    });
  });

  describe("getOrCreateSession", () => {
    test("should return existing session without creating new one", async () => {
      await sessionManager.createSession("session-1", "emulator-5554", "android");
      const session = await sessionManager.getOrCreateSession("session-1");
      expect(session.sessionId).toBe("session-1");
      expect(sessionManager.getActiveSessionCount()).toBe(1);
    });

    test("should update last used time when getting session", async () => {
      const session1 = await sessionManager.createSession("session-1", "emulator-5554", "android");
      const initialLastUsed = session1.lastUsedAt;
      const initialExpiry = session1.expiresAt;
      fakeTimer.advanceTime(10);
      const session2 = await sessionManager.getOrCreateSession("session-1");
      expect(session2.lastUsedAt).toBe(initialLastUsed + 10);
      expect(session2.expiresAt).toBe(initialExpiry + 10);
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
      const session = await sessionManager.createSession("session-1", "emulator-5554", "android");
      // Force expiration by setting expiresAt to past
      fakeTimer.advanceTime(2000);
      const oneSecondAgo = fakeTimer.now() - 1000;
      (session as any).expiresAt = oneSecondAgo;
      const retrieved = sessionManager.getSession("session-1");
      expect(retrieved).toBeNull();
    });
  });

  describe("cache management", () => {
    test("should update session cache data", async () => {
      await sessionManager.createSession("session-1", "emulator-5554", "android");
      sessionManager.updateSessionCache("session-1", {
        lastHierarchy: "test-hierarchy",
        lastScreenshot: "base64-data",
      });
      const cache = sessionManager.getSessionCache("session-1");
      expect(cache?.lastHierarchy).toBe("test-hierarchy");
      expect(cache?.lastScreenshot).toBe("base64-data");
    });

    test("should get session cache without modifying other fields", async () => {
      await sessionManager.createSession("session-1", "emulator-5554", "android");
      sessionManager.updateSessionCache("session-1", {
        customData: { key: "value" },
      });
      const session1 = sessionManager.getSession("session-1");
      const initialLastUsed = session1?.lastUsedAt ?? 0;
      fakeTimer.advanceTime(10);
      const cache = sessionManager.getSessionCache("session-1");
      const session2 = sessionManager.getSession("session-1");
      expect(cache?.customData).toEqual({ key: "value" });
      expect((session2?.lastUsedAt ?? 0)).toBe(initialLastUsed + 10);
    });

    test("should clear specific cache key", async () => {
      await sessionManager.createSession("session-1", "emulator-5554", "android");
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
      await sessionManager.createSession("session-1", "emulator-5554", "android");
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
      await sessionManager.createSession("session-1", "emulator-5554", "android");
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
      await sessionManager.createSession("session-1", "emulator-5554", "android");
      await sessionManager.createSession("session-2", "emulator-5556", "android");
      const stats = sessionManager.getStats();
      expect(stats.totalSessions).toBe(2);
      expect(stats.activeSessions).toBe(2);
      expect(stats.expiredSessions).toBe(0);
      expect(stats.assignedDevices).toBe(2);
    });
  });

  describe("onSessionRelease callbacks", () => {
    test("should invoke release callbacks when session is released", async () => {
      await sessionManager.createSession("session-cb", "emulator-5554", "android");

      const released: { sessionId: string; deviceId: string }[] = [];
      sessionManager.onSessionRelease((sessionId, deviceId) => {
        released.push({ sessionId, deviceId });
      });

      await sessionManager.releaseSession("session-cb");

      expect(released).toHaveLength(1);
      expect(released[0].sessionId).toBe("session-cb");
      expect(released[0].deviceId).toBe("emulator-5554");
    });

    test("should continue releasing even if a callback throws", async () => {
      await sessionManager.createSession("session-err", "emulator-5554", "android");

      const results: string[] = [];
      sessionManager.onSessionRelease(() => {
        throw new Error("callback error");
      });
      sessionManager.onSessionRelease(sessionId => {
        results.push(sessionId);
      });

      await sessionManager.releaseSession("session-err");

      // Second callback should still fire despite first throwing
      expect(results).toEqual(["session-err"]);
    });

    test("should invoke release callbacks when expired session is accessed via getSession", async () => {
      await sessionManager.createSession("session-expiry", "emulator-5554", "android");

      const released: { sessionId: string; deviceId: string }[] = [];
      sessionManager.onSessionRelease((sessionId, deviceId) => {
        released.push({ sessionId, deviceId });
      });

      // Advance time past the 30-minute session timeout
      fakeTimer.advanceTime(31 * 60 * 1000);

      // Accessing the expired session should trigger cleanup + callback
      const result = sessionManager.getSession("session-expiry");
      expect(result).toBeNull();
      expect(released).toHaveLength(1);
      expect(released[0].sessionId).toBe("session-expiry");
      expect(released[0].deviceId).toBe("emulator-5554");
    });

    test("should invoke release callbacks when cleanup timer fires for expired sessions", async () => {
      await sessionManager.createSession("session-timer", "emulator-5556", "android");

      const released: { sessionId: string; deviceId: string }[] = [];
      sessionManager.onSessionRelease((sessionId, deviceId) => {
        released.push({ sessionId, deviceId });
      });

      // Advance past session timeout + cleanup interval (30min + 5min)
      fakeTimer.advanceTime(36 * 60 * 1000);

      expect(released).toHaveLength(1);
      expect(released[0].sessionId).toBe("session-timer");
      expect(released[0].deviceId).toBe("emulator-5556");
    });
  });
});
