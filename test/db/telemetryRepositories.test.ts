import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types";
import { createTestDatabase } from "./testDbHelper";
import { recordNetworkEvent, getNetworkEvents } from "../../src/db/networkEventRepository";
import { recordLogEvent, getLogEvents } from "../../src/db/logEventRepository";
import { recordCustomEvent, getCustomEvents } from "../../src/db/customEventRepository";
import { recordOsEvent, getOsEvents } from "../../src/db/osEventRepository";

describe("NetworkEventRepository", () => {
  let db: Kysely<Database>;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("recordNetworkEvent inserts and retrieves", async () => {
    await recordNetworkEvent({
      deviceId: "emulator-5554",
      timestamp: 1000,
      applicationId: "com.example.app",
      sessionId: "s1",
      url: "https://api.example.com/users",
      method: "GET",
      statusCode: 200,
      durationMs: 150,
      requestBodySize: 0,
      responseBodySize: 1024,
      protocol: "h2",
      host: "api.example.com",
      path: "/users",
      error: null,
    }, db);

    const events = await getNetworkEvents({ deviceId: "emulator-5554" }, db);
    expect(events).toHaveLength(1);
    expect(events[0].url).toBe("https://api.example.com/users");
    expect(events[0].statusCode).toBe(200);
    expect(events[0].durationMs).toBe(150);
  });

  test("getNetworkEvents filters by sinceTimestamp", async () => {
    await recordNetworkEvent({
      deviceId: "d1", timestamp: 100, applicationId: null, sessionId: null,
      url: "u1", method: "GET", statusCode: 200, durationMs: 10,
      requestBodySize: -1, responseBodySize: -1, protocol: null, host: null, path: null, error: null,
    }, db);
    await recordNetworkEvent({
      deviceId: "d1", timestamp: 200, applicationId: null, sessionId: null,
      url: "u2", method: "POST", statusCode: 201, durationMs: 20,
      requestBodySize: -1, responseBodySize: -1, protocol: null, host: null, path: null, error: null,
    }, db);

    const events = await getNetworkEvents({ sinceTimestamp: 150 }, db);
    expect(events).toHaveLength(1);
    expect(events[0].url).toBe("u2");
  });
});

describe("LogEventRepository", () => {
  let db: Kysely<Database>;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("recordLogEvent inserts and retrieves", async () => {
    await recordLogEvent({
      deviceId: "d1",
      timestamp: 1000,
      applicationId: "com.example.app",
      sessionId: "s1",
      level: 4,
      tag: "OkHttp",
      message: "HTTP 200",
      filterName: "http",
    }, db);

    const events = await getLogEvents({ tag: "OkHttp" }, db);
    expect(events).toHaveLength(1);
    expect(events[0].level).toBe(4);
    expect(events[0].filterName).toBe("http");
  });
});

describe("CustomEventRepository", () => {
  let db: Kysely<Database>;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("recordCustomEvent inserts with properties", async () => {
    await recordCustomEvent({
      deviceId: "d1",
      timestamp: 1000,
      applicationId: "com.example.app",
      sessionId: "s1",
      name: "purchase",
      properties: { amount: "9.99", currency: "USD" },
    }, db);

    const events = await getCustomEvents({ name: "purchase" }, db);
    expect(events).toHaveLength(1);
    expect(events[0].properties).toEqual({ amount: "9.99", currency: "USD" });
  });

  test("recordCustomEvent inserts with empty properties", async () => {
    await recordCustomEvent({
      deviceId: "d1",
      timestamp: 1000,
      applicationId: null,
      sessionId: null,
      name: "click",
      properties: {},
    }, db);

    const events = await getCustomEvents({}, db);
    expect(events).toHaveLength(1);
    expect(events[0].properties).toEqual({});
  });
});

describe("OsEventRepository", () => {
  let db: Kysely<Database>;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("recordOsEvent inserts lifecycle event", async () => {
    await recordOsEvent({
      deviceId: "d1",
      timestamp: 1000,
      applicationId: "com.example.app",
      sessionId: "s1",
      category: "lifecycle",
      kind: "foreground",
      details: null,
    }, db);

    const events = await getOsEvents({ category: "lifecycle" }, db);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("foreground");
  });

  test("recordOsEvent inserts broadcast with details", async () => {
    await recordOsEvent({
      deviceId: "d1",
      timestamp: 2000,
      applicationId: null,
      sessionId: null,
      category: "broadcast",
      kind: "android.intent.action.LOCALE_CHANGED",
      details: { locale: "String" },
    }, db);

    const events = await getOsEvents({ category: "broadcast" }, db);
    expect(events).toHaveLength(1);
    expect(events[0].details).toEqual({ locale: "String" });
  });

  test("getOsEvents filters by device and timestamp", async () => {
    await recordOsEvent({
      deviceId: "d1", timestamp: 100, applicationId: null, sessionId: null,
      category: "lifecycle", kind: "foreground", details: null,
    }, db);
    await recordOsEvent({
      deviceId: "d2", timestamp: 200, applicationId: null, sessionId: null,
      category: "lifecycle", kind: "background", details: null,
    }, db);

    const d1Events = await getOsEvents({ deviceId: "d1" }, db);
    expect(d1Events).toHaveLength(1);
    expect(d1Events[0].kind).toBe("foreground");
  });
});
