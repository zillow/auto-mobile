import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types";
import { createTestDatabase } from "./testDbHelper";
import { recordLayoutEvent, getLayoutEvents } from "../../src/db/layoutEventRepository";

describe("LayoutEventRepository", () => {
  let db: Kysely<Database>;
  beforeEach(async () => { db = await createTestDatabase(); });
  afterEach(async () => { await db.destroy(); });

  test("recordLayoutEvent inserts and retrieves with all fields", async () => {
    await recordLayoutEvent({
      deviceId: "d1", timestamp: 1000, applicationId: "com.example", sessionId: "s1",
      subType: "hierarchy_change", composableName: null, composableId: null,
      recompositionCount: null, durationMs: null, likelyCause: null,
      detailsJson: '{"screenName":"Home"}', screenName: "HomeScreen",
    }, db);
    const events = await getLayoutEvents({ deviceId: "d1" }, db);
    expect(events).toHaveLength(1);
    expect(events[0].subType).toBe("hierarchy_change");
    expect(events[0].screenName).toBe("HomeScreen");
    expect(events[0].detailsJson).toBe('{"screenName":"Home"}');
  });

  test("recordLayoutEvent stores screenName correctly", async () => {
    await recordLayoutEvent({
      deviceId: "d1", timestamp: 1000, applicationId: null, sessionId: null,
      subType: "excessive_recomposition", composableName: "Counter", composableId: "c1",
      recompositionCount: 15, durationMs: 8, likelyCause: "unstable_lambda",
      detailsJson: null, screenName: "SettingsScreen",
    }, db);
    const events = await getLayoutEvents({}, db);
    expect(events[0].screenName).toBe("SettingsScreen");
    expect(events[0].composableName).toBe("Counter");
    expect(events[0].recompositionCount).toBe(15);
  });

  test("getLayoutEvents filters by deviceId", async () => {
    await recordLayoutEvent({
      deviceId: "d1", timestamp: 1000, applicationId: null, sessionId: null,
      subType: "hierarchy_change", composableName: null, composableId: null,
      recompositionCount: null, durationMs: null, likelyCause: null, detailsJson: null,
    }, db);
    await recordLayoutEvent({
      deviceId: "d2", timestamp: 2000, applicationId: null, sessionId: null,
      subType: "hierarchy_change", composableName: null, composableId: null,
      recompositionCount: null, durationMs: null, likelyCause: null, detailsJson: null,
    }, db);
    const events = await getLayoutEvents({ deviceId: "d1" }, db);
    expect(events).toHaveLength(1);
  });

  test("getLayoutEvents filters by sinceTimestamp", async () => {
    await recordLayoutEvent({
      deviceId: "d1", timestamp: 100, applicationId: null, sessionId: null,
      subType: "a", composableName: null, composableId: null,
      recompositionCount: null, durationMs: null, likelyCause: null, detailsJson: null,
    }, db);
    await recordLayoutEvent({
      deviceId: "d1", timestamp: 200, applicationId: null, sessionId: null,
      subType: "b", composableName: null, composableId: null,
      recompositionCount: null, durationMs: null, likelyCause: null, detailsJson: null,
    }, db);
    const events = await getLayoutEvents({ sinceTimestamp: 150 }, db);
    expect(events).toHaveLength(1);
    expect(events[0].subType).toBe("b");
  });

  test("screenName defaults to null when not provided", async () => {
    await recordLayoutEvent({
      deviceId: "d1", timestamp: 1000, applicationId: null, sessionId: null,
      subType: "hierarchy_change", composableName: null, composableId: null,
      recompositionCount: null, durationMs: null, likelyCause: null, detailsJson: null,
    }, db);
    const events = await getLayoutEvents({}, db);
    expect(events[0].screenName).toBeNull();
  });
});
