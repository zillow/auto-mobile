import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types";
import { createTestDatabase } from "./testDbHelper";
import { recordStorageEvent, getStorageEvents } from "../../src/db/storageEventRepository";

describe("StorageEventRepository", () => {
  let db: Kysely<Database>;
  beforeEach(async () => { db = await createTestDatabase(); });
  afterEach(async () => { await db.destroy(); });

  test("recordStorageEvent inserts and retrieves", async () => {
    await recordStorageEvent({
      deviceId: "d1", timestamp: 1000, applicationId: "com.example", sessionId: "s1",
      fileName: "prefs.xml", key: "dark_mode", value: "true", valueType: "BOOLEAN", changeType: "modify",
    }, db);
    const events = await getStorageEvents({ deviceId: "d1" }, db);
    expect(events).toHaveLength(1);
    expect(events[0].fileName).toBe("prefs.xml");
    expect(events[0].key).toBe("dark_mode");
    expect(events[0].value).toBe("true");
    expect(events[0].changeType).toBe("modify");
  });

  test("recordStorageEvent looks up previous value from prior event", async () => {
    await recordStorageEvent({
      deviceId: "d1", timestamp: 1000, applicationId: null, sessionId: null,
      fileName: "prefs.xml", key: "theme", value: "light", valueType: "STRING", changeType: "add",
    }, db);
    await recordStorageEvent({
      deviceId: "d1", timestamp: 2000, applicationId: null, sessionId: null,
      fileName: "prefs.xml", key: "theme", value: "dark", valueType: "STRING", changeType: "modify",
    }, db);
    const events = await getStorageEvents({ deviceId: "d1" }, db);
    // Most recent first
    expect(events[0].previousValue).toBe("light");
  });

  test("recordStorageEvent uses provided previousValue when given", async () => {
    await recordStorageEvent({
      deviceId: "d1", timestamp: 1000, applicationId: null, sessionId: null,
      fileName: "prefs.xml", key: "k", value: "v2", valueType: null, changeType: "modify",
      previousValue: "v1",
    }, db);
    const events = await getStorageEvents({ deviceId: "d1" }, db);
    expect(events[0].previousValue).toBe("v1");
  });

  test("recordStorageEvent skips previous value lookup when key is null", async () => {
    await recordStorageEvent({
      deviceId: "d1", timestamp: 1000, applicationId: null, sessionId: null,
      fileName: "prefs.xml", key: null, value: null, valueType: null, changeType: "clear",
    }, db);
    const events = await getStorageEvents({ deviceId: "d1" }, db);
    expect(events[0].previousValue).toBeNull();
  });

  test("recordStorageEvent skips previous value lookup when deviceId is null", async () => {
    await recordStorageEvent({
      deviceId: null, timestamp: 1000, applicationId: null, sessionId: null,
      fileName: "prefs.xml", key: "k", value: "v", valueType: null, changeType: "add",
    }, db);
    const events = await getStorageEvents({}, db);
    expect(events[0].previousValue).toBeNull();
  });

  test("getStorageEvents filters by deviceId", async () => {
    await recordStorageEvent({
      deviceId: "d1", timestamp: 1000, applicationId: null, sessionId: null,
      fileName: "f", key: "k", value: "v", valueType: null, changeType: "add",
    }, db);
    await recordStorageEvent({
      deviceId: "d2", timestamp: 2000, applicationId: null, sessionId: null,
      fileName: "f", key: "k2", value: "v2", valueType: null, changeType: "add",
    }, db);
    const events = await getStorageEvents({ deviceId: "d1" }, db);
    expect(events).toHaveLength(1);
    expect(events[0].key).toBe("k");
  });

  test("getStorageEvents filters by sinceTimestamp", async () => {
    await recordStorageEvent({
      deviceId: "d1", timestamp: 100, applicationId: null, sessionId: null,
      fileName: "f", key: "k1", value: "v1", valueType: null, changeType: "add",
    }, db);
    await recordStorageEvent({
      deviceId: "d1", timestamp: 200, applicationId: null, sessionId: null,
      fileName: "f", key: "k2", value: "v2", valueType: null, changeType: "add",
    }, db);
    const events = await getStorageEvents({ sinceTimestamp: 150 }, db);
    expect(events).toHaveLength(1);
    expect(events[0].key).toBe("k2");
  });
});
