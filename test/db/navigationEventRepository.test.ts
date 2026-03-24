import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types";
import { createTestDatabase } from "./testDbHelper";
import { recordNavigationEvent, getNavigationEvents } from "../../src/db/navigationEventRepository";

describe("NavigationEventRepository", () => {
  let db: Kysely<Database>;
  beforeEach(async () => { db = await createTestDatabase(); });
  afterEach(async () => { await db.destroy(); });

  test("recordNavigationEvent inserts and retrieves with all fields", async () => {
    await recordNavigationEvent({
      deviceId: "d1", timestamp: 1000, applicationId: "com.example", sessionId: "s1",
      destination: "HomeScreen", source: "sdk",
      arguments: { tab: "discover" }, metadata: { route: "/home" },
    }, db);
    const events = await getNavigationEvents({ deviceId: "d1" }, db);
    expect(events).toHaveLength(1);
    expect(events[0].destination).toBe("HomeScreen");
    expect(events[0].source).toBe("sdk");
    expect(events[0].arguments).toEqual({ tab: "discover" });
    expect(events[0].metadata).toEqual({ route: "/home" });
  });

  test("recordNavigationEvent serializes null arguments and metadata", async () => {
    await recordNavigationEvent({
      deviceId: "d1", timestamp: 1000, applicationId: null, sessionId: null,
      destination: "SettingsScreen", source: null, arguments: null, metadata: null,
    }, db);
    const events = await getNavigationEvents({}, db);
    expect(events[0].arguments).toBeNull();
    expect(events[0].metadata).toBeNull();
    expect(events[0].source).toBeNull();
  });

  test("getNavigationEvents filters by deviceId", async () => {
    await recordNavigationEvent({
      deviceId: "d1", timestamp: 1000, applicationId: null, sessionId: null,
      destination: "A", source: null, arguments: null, metadata: null,
    }, db);
    await recordNavigationEvent({
      deviceId: "d2", timestamp: 2000, applicationId: null, sessionId: null,
      destination: "B", source: null, arguments: null, metadata: null,
    }, db);
    const events = await getNavigationEvents({ deviceId: "d1" }, db);
    expect(events).toHaveLength(1);
    expect(events[0].destination).toBe("A");
  });

  test("getNavigationEvents filters by sinceTimestamp", async () => {
    await recordNavigationEvent({
      deviceId: "d1", timestamp: 100, applicationId: null, sessionId: null,
      destination: "A", source: null, arguments: null, metadata: null,
    }, db);
    await recordNavigationEvent({
      deviceId: "d1", timestamp: 200, applicationId: null, sessionId: null,
      destination: "B", source: null, arguments: null, metadata: null,
    }, db);
    const events = await getNavigationEvents({ sinceTimestamp: 150 }, db);
    expect(events).toHaveLength(1);
    expect(events[0].destination).toBe("B");
  });

  test("getNavigationEvents orders by timestamp desc", async () => {
    await recordNavigationEvent({
      deviceId: "d1", timestamp: 100, applicationId: null, sessionId: null,
      destination: "First", source: null, arguments: null, metadata: null,
    }, db);
    await recordNavigationEvent({
      deviceId: "d1", timestamp: 200, applicationId: null, sessionId: null,
      destination: "Second", source: null, arguments: null, metadata: null,
    }, db);
    const events = await getNavigationEvents({}, db);
    expect(events[0].destination).toBe("Second");
    expect(events[1].destination).toBe("First");
  });
});
