import { describe, expect, it } from "bun:test";
import type {
  PreferenceFile,
  KeyValueType,
  KeyValueEntry,
  StorageSubscription,
  StorageChangedEvent,
  ListPreferenceFilesResult,
  GetPreferencesResult,
  SubscribeStorageResult,
  UnsubscribeStorageResult,
} from "../../../src/features/storage/storageTypes";

describe("storageTypes", () => {
  describe("PreferenceFile", () => {
    it("should have correct structure", () => {
      const file: PreferenceFile = {
        name: "user_prefs",
        path: "/data/data/com.example/shared_prefs/user_prefs.xml",
        entryCount: 5,
      };

      expect(file.name).toBe("user_prefs");
      expect(file.path).toContain("shared_prefs");
      expect(file.entryCount).toBe(5);
    });
  });

  describe("KeyValueType", () => {
    it("should support all value types", () => {
      const types: KeyValueType[] = ["STRING", "INT", "LONG", "FLOAT", "BOOLEAN", "STRING_SET"];
      expect(types).toHaveLength(6);
    });
  });

  describe("KeyValueEntry", () => {
    it("should support string values", () => {
      const entry: KeyValueEntry = {
        key: "username",
        value: JSON.stringify("john_doe"),
        type: "STRING",
      };

      expect(entry.key).toBe("username");
      expect(JSON.parse(entry.value!)).toBe("john_doe");
      expect(entry.type).toBe("STRING");
    });

    it("should support numeric values", () => {
      const intEntry: KeyValueEntry = {
        key: "count",
        value: JSON.stringify(42),
        type: "INT",
      };

      expect(intEntry.type).toBe("INT");
      expect(JSON.parse(intEntry.value!)).toBe(42);

      const floatEntry: KeyValueEntry = {
        key: "ratio",
        value: JSON.stringify(3.14),
        type: "FLOAT",
      };

      expect(floatEntry.type).toBe("FLOAT");
      expect(JSON.parse(floatEntry.value!)).toBe(3.14);
    });

    it("should support boolean values", () => {
      const entry: KeyValueEntry = {
        key: "enabled",
        value: JSON.stringify(true),
        type: "BOOLEAN",
      };

      expect(entry.type).toBe("BOOLEAN");
      expect(JSON.parse(entry.value!)).toBe(true);
    });

    it("should support string set values", () => {
      const entry: KeyValueEntry = {
        key: "tags",
        value: JSON.stringify(["red", "green", "blue"]),
        type: "STRING_SET",
      };

      expect(entry.type).toBe("STRING_SET");
      expect(JSON.parse(entry.value!)).toEqual(["red", "green", "blue"]);
    });

    it("should support null values for deleted entries", () => {
      const entry: KeyValueEntry = {
        key: "deleted_key",
        value: null,
        type: "STRING",
      };

      expect(entry.value).toBeNull();
    });
  });

  describe("StorageSubscription", () => {
    it("should have correct structure", () => {
      const subscription: StorageSubscription = {
        packageName: "com.example.app",
        fileName: "settings",
        subscriptionId: "sub-123",
      };

      expect(subscription.packageName).toBe("com.example.app");
      expect(subscription.fileName).toBe("settings");
      expect(subscription.subscriptionId).toBe("sub-123");
    });
  });

  describe("StorageChangedEvent", () => {
    it("should represent a key change event", () => {
      const event: StorageChangedEvent = {
        packageName: "com.example.app",
        fileName: "settings",
        key: "dark_mode",
        value: JSON.stringify(true),
        valueType: "BOOLEAN",
        timestamp: 1700000000000,
        sequenceNumber: 1,
      };

      expect(event.key).toBe("dark_mode");
      expect(JSON.parse(event.value!)).toBe(true);
      expect(event.valueType).toBe("BOOLEAN");
    });

    it("should represent a key deletion event", () => {
      const event: StorageChangedEvent = {
        packageName: "com.example.app",
        fileName: "settings",
        key: "deprecated_setting",
        value: null,
        valueType: "STRING",
        timestamp: 1700000000000,
        sequenceNumber: 2,
      };

      expect(event.key).toBe("deprecated_setting");
      expect(event.value).toBeNull();
    });

    it("should represent a file clear event", () => {
      const event: StorageChangedEvent = {
        packageName: "com.example.app",
        fileName: "settings",
        key: null,
        value: null,
        valueType: "STRING",
        timestamp: 1700000000000,
        sequenceNumber: 3,
      };

      expect(event.key).toBeNull();
      expect(event.value).toBeNull();
    });
  });

  describe("Result types", () => {
    it("ListPreferenceFilesResult should have correct structure", () => {
      const result: ListPreferenceFilesResult = {
        success: true,
        files: [
          { name: "prefs1", path: "/path/to/prefs1.xml", entryCount: 3 },
          { name: "prefs2", path: "/path/to/prefs2.xml", entryCount: 5 },
        ],
        totalTimeMs: 50,
      };

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(2);
      expect(result.totalTimeMs).toBe(50);
    });

    it("GetPreferencesResult should have correct structure", () => {
      const result: GetPreferencesResult = {
        success: true,
        entries: [
          { key: "key1", value: JSON.stringify("value1"), type: "STRING" },
          { key: "key2", value: JSON.stringify(42), type: "INT" },
        ],
        totalTimeMs: 30,
      };

      expect(result.success).toBe(true);
      expect(result.entries).toHaveLength(2);
    });

    it("SubscribeStorageResult should have correct structure", () => {
      const result: SubscribeStorageResult = {
        success: true,
        subscription: {
          packageName: "com.example.app",
          fileName: "settings",
          subscriptionId: "sub-456",
        },
        totalTimeMs: 20,
      };

      expect(result.success).toBe(true);
      expect(result.subscription?.subscriptionId).toBe("sub-456");
    });

    it("UnsubscribeStorageResult should have correct structure", () => {
      const result: UnsubscribeStorageResult = {
        success: true,
        totalTimeMs: 10,
      };

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("Result types should handle errors", () => {
      const errorResult: ListPreferenceFilesResult = {
        success: false,
        totalTimeMs: 100,
        error: "Permission denied",
      };

      expect(errorResult.success).toBe(false);
      expect(errorResult.error).toBe("Permission denied");
      expect(errorResult.files).toBeUndefined();
    });
  });
});
