import { describe, expect, it, beforeEach } from "bun:test";
import { FakeStorageClient } from "./FakeStorageClient";
import type { StorageChangedEvent } from "../../src/features/storage/storageTypes";

describe("FakeStorageClient", () => {
  let client: FakeStorageClient;

  beforeEach(() => {
    client = new FakeStorageClient();
  });

  describe("listPreferenceFiles", () => {
    it("should return empty array when no data configured", async () => {
      const files = await client.listPreferenceFiles("com.example.app");
      expect(files).toEqual([]);
    });

    it("should return configured preference files", async () => {
      client.setPreferenceFiles("com.example.app", [
        {
          file: { name: "prefs", path: "/path/to/prefs.xml", entryCount: 3 },
          entries: [],
        },
      ]);

      const files = await client.listPreferenceFiles("com.example.app");
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe("prefs");
    });

    it("should track method calls", async () => {
      await client.listPreferenceFiles("com.example.app");
      await client.listPreferenceFiles("com.other.app");

      expect(client.wasMethodCalled("listPreferenceFiles")).toBe(true);
      expect(client.getMethodCallCount("listPreferenceFiles")).toBe(2);

      const history = client.getListPreferenceFilesHistory();
      expect(history).toHaveLength(2);
      expect(history[0].packageName).toBe("com.example.app");
      expect(history[1].packageName).toBe("com.other.app");
    });

    it("should throw when failure mode is set", async () => {
      client.setFailureMode("listPreferenceFiles", new Error("Test error"));

      await expect(client.listPreferenceFiles("com.example.app")).rejects.toThrow("Test error");
    });
  });

  describe("getPreferenceEntries", () => {
    it("should return empty array when no data configured", async () => {
      const entries = await client.getPreferenceEntries("com.example.app", "settings");
      expect(entries).toEqual([]);
    });

    it("should return configured entries", async () => {
      client.setPreferenceFiles("com.example.app", [
        {
          file: { name: "settings", path: "/path/to/settings.xml", entryCount: 2 },
          entries: [
            { key: "key1", value: '"value1"', type: "STRING" },
            { key: "key2", value: "42", type: "INT" },
          ],
        },
      ]);

      const entries = await client.getPreferenceEntries("com.example.app", "settings");
      expect(entries).toHaveLength(2);
      expect(entries[0].key).toBe("key1");
      expect(entries[1].key).toBe("key2");
    });

    it("should track method calls", async () => {
      await client.getPreferenceEntries("com.example.app", "settings");

      const history = client.getGetPreferenceEntriesHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual({ packageName: "com.example.app", fileName: "settings" });
    });
  });

  describe("subscribeStorage", () => {
    it("should return subscription with unique ID", async () => {
      const sub1 = await client.subscribeStorage("com.example.app", "settings");
      const sub2 = await client.subscribeStorage("com.example.app", "other");

      expect(sub1.subscriptionId).not.toBe(sub2.subscriptionId);
      expect(sub1.packageName).toBe("com.example.app");
      expect(sub1.fileName).toBe("settings");
    });

    it("should track active subscriptions", async () => {
      await client.subscribeStorage("com.example.app", "settings");
      await client.subscribeStorage("com.example.app", "other");

      const subscriptions = client.getActiveSubscriptions();
      expect(subscriptions).toHaveLength(2);
    });

    it("should track method calls", async () => {
      await client.subscribeStorage("com.example.app", "settings");

      const history = client.getSubscribeStorageHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual({ packageName: "com.example.app", fileName: "settings" });
    });
  });

  describe("unsubscribeStorage", () => {
    it("should remove subscription", async () => {
      const sub = await client.subscribeStorage("com.example.app", "settings");
      expect(client.getActiveSubscriptions()).toHaveLength(1);

      await client.unsubscribeStorage(sub.subscriptionId);
      expect(client.getActiveSubscriptions()).toHaveLength(0);
    });

    it("should track method calls", async () => {
      const sub = await client.subscribeStorage("com.example.app", "settings");
      await client.unsubscribeStorage(sub.subscriptionId);

      const history = client.getUnsubscribeStorageHistory();
      expect(history).toHaveLength(1);
      expect(history[0].subscriptionId).toBe(sub.subscriptionId);
    });
  });

  describe("storage change listeners", () => {
    it("should notify listeners on simulated change", async () => {
      const receivedEvents: StorageChangedEvent[] = [];
      client.addStorageChangeListener(event => {
        receivedEvents.push(event);
      });

      const event: StorageChangedEvent = {
        packageName: "com.example.app",
        fileName: "settings",
        key: "dark_mode",
        value: "true",
        valueType: "BOOLEAN",
        timestamp: Date.now(),
        sequenceNumber: 1,
      };

      client.simulateStorageChange(event);

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toEqual(event);
    });

    it("should allow removing listeners", async () => {
      const receivedEvents: StorageChangedEvent[] = [];
      const remove = client.addStorageChangeListener(event => {
        receivedEvents.push(event);
      });

      expect(client.getStorageChangeListenerCount()).toBe(1);

      remove();
      expect(client.getStorageChangeListenerCount()).toBe(0);

      client.simulateStorageChange({
        packageName: "com.example.app",
        fileName: "settings",
        key: "test",
        value: "value",
        valueType: "STRING",
        timestamp: Date.now(),
        sequenceNumber: 1,
      });

      expect(receivedEvents).toHaveLength(0);
    });
  });

  describe("reset", () => {
    it("should clear all state", async () => {
      client.setPreferenceFiles("com.example.app", [
        { file: { name: "prefs", path: "/path", entryCount: 1 }, entries: [] },
      ]);
      client.setFailureMode("listPreferenceFiles", new Error("Test"));
      await client.subscribeStorage("com.example.app", "settings");
      client.addStorageChangeListener(() => {});
      await client.listPreferenceFiles("com.example.app").catch(() => {});

      client.reset();

      // All state should be cleared
      expect(client.getOperations()).toHaveLength(0);
      expect(client.getActiveSubscriptions()).toHaveLength(0);
      expect(client.getStorageChangeListenerCount()).toBe(0);

      // Should not throw after reset
      const files = await client.listPreferenceFiles("com.example.app");
      expect(files).toEqual([]);
    });
  });

  describe("clearOperations", () => {
    it("should only clear operations history", async () => {
      client.setPreferenceFiles("com.example.app", [
        { file: { name: "prefs", path: "/path", entryCount: 1 }, entries: [] },
      ]);
      await client.listPreferenceFiles("com.example.app");

      expect(client.getOperations()).toHaveLength(1);

      client.clearOperations();

      expect(client.getOperations()).toHaveLength(0);

      // Data should still be there
      const files = await client.listPreferenceFiles("com.example.app");
      expect(files).toHaveLength(1);
    });
  });
});
