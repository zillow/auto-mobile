import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types";
import { createTestDatabase } from "./testDbHelper";
import {
  recordNetworkEvent,
  getNetworkEvents,
  getNetworkEventById,
} from "../../src/db/networkEventRepository";

function makeInput(overrides: Record<string, any> = {}) {
  return {
    deviceId: "d1",
    timestamp: 1000,
    applicationId: null,
    sessionId: null,
    url: "https://api.example.com/data",
    method: "GET",
    statusCode: 200,
    durationMs: 100,
    requestBodySize: 0,
    responseBodySize: 50,
    protocol: "h2",
    host: "api.example.com",
    path: "/data",
    error: null,
    ...overrides,
  };
}

describe("networkEventRepository extended queries", () => {
  let db: Kysely<Database>;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("recordNetworkEvent returns inserted id", async () => {
    const id = await recordNetworkEvent(makeInput(), db);
    expect(id).toBeGreaterThan(0);
  });

  test("getNetworkEventById returns full event with id", async () => {
    const id = await recordNetworkEvent(
      makeInput({
        requestHeaders: { "Authorization": "Bearer tok" },
        responseHeaders: { "Content-Type": "application/json" },
        requestBody: '{"q":"test"}',
        responseBody: '{"results":[]}',
        contentType: "application/json",
      }),
      db
    );

    const event = await getNetworkEventById(id, db);
    expect(event).not.toBeNull();
    expect(event!.id).toBe(id);
    expect(event!.url).toBe("https://api.example.com/data");
    expect(event!.requestHeaders).toEqual({ "Authorization": "Bearer tok" });
    expect(event!.requestBody).toBe('{"q":"test"}');
    expect(event!.responseBody).toBe('{"results":[]}');
  });

  test("getNetworkEventById returns null for missing id", async () => {
    const event = await getNetworkEventById(99999, db);
    expect(event).toBeNull();
  });

  test("getNetworkEventById truncates bodies over 10KB", async () => {
    const largeBody = "x".repeat(20_000);
    const id = await recordNetworkEvent(
      makeInput({ responseBody: largeBody, responseBodySize: 20_000 }),
      db
    );

    const event = await getNetworkEventById(id, db);
    expect(event!.responseBody!.length).toBe(10_240);
  });

  test("getNetworkEvents returns id on each event", async () => {
    await recordNetworkEvent(makeInput({ timestamp: 100 }), db);
    await recordNetworkEvent(makeInput({ timestamp: 200 }), db);

    const events = await getNetworkEvents({}, db);
    expect(events).toHaveLength(2);
    expect(events[0].id).toBeDefined();
    expect(events[1].id).toBeDefined();
    expect(events[0].id).not.toBe(events[1].id);
  });

  test("getNetworkEvents filters by host", async () => {
    await recordNetworkEvent(makeInput({ host: "api.example.com", timestamp: 100 }), db);
    await recordNetworkEvent(makeInput({ host: "cdn.example.com", timestamp: 200 }), db);

    const events = await getNetworkEvents({ host: "cdn.example.com" }, db);
    expect(events).toHaveLength(1);
    expect(events[0].host).toBe("cdn.example.com");
  });

  test("getNetworkEvents filters by method", async () => {
    await recordNetworkEvent(makeInput({ method: "GET", timestamp: 100 }), db);
    await recordNetworkEvent(makeInput({ method: "POST", timestamp: 200 }), db);

    const events = await getNetworkEvents({ method: "POST" }, db);
    expect(events).toHaveLength(1);
    expect(events[0].method).toBe("POST");
  });

  test("getNetworkEvents filters by exact status code", async () => {
    await recordNetworkEvent(makeInput({ statusCode: 200, timestamp: 100 }), db);
    await recordNetworkEvent(makeInput({ statusCode: 404, timestamp: 200 }), db);
    await recordNetworkEvent(makeInput({ statusCode: 500, timestamp: 300 }), db);

    const events = await getNetworkEvents({ statusCode: "404" }, db);
    expect(events).toHaveLength(1);
    expect(events[0].statusCode).toBe(404);
  });

  test("getNetworkEvents filters by status code class (4xx)", async () => {
    await recordNetworkEvent(makeInput({ statusCode: 200, timestamp: 100 }), db);
    await recordNetworkEvent(makeInput({ statusCode: 400, timestamp: 200 }), db);
    await recordNetworkEvent(makeInput({ statusCode: 404, timestamp: 300 }), db);
    await recordNetworkEvent(makeInput({ statusCode: 500, timestamp: 400 }), db);

    const events = await getNetworkEvents({ statusCode: "4xx" }, db);
    expect(events).toHaveLength(2);
    expect(events.every(e => e.statusCode >= 400 && e.statusCode < 500)).toBe(true);
  });

  test("getNetworkEvents filters by status code class (5xx)", async () => {
    await recordNetworkEvent(makeInput({ statusCode: 200, timestamp: 100 }), db);
    await recordNetworkEvent(makeInput({ statusCode: 500, timestamp: 200 }), db);
    await recordNetworkEvent(makeInput({ statusCode: 503, timestamp: 300 }), db);

    const events = await getNetworkEvents({ statusCode: "5xx" }, db);
    expect(events).toHaveLength(2);
    expect(events.every(e => e.statusCode >= 500 && e.statusCode < 600)).toBe(true);
  });

  test("getNetworkEvents combines multiple filters", async () => {
    await recordNetworkEvent(makeInput({ host: "api.com", method: "GET", statusCode: 200, timestamp: 100 }), db);
    await recordNetworkEvent(makeInput({ host: "api.com", method: "POST", statusCode: 500, timestamp: 200 }), db);
    await recordNetworkEvent(makeInput({ host: "cdn.com", method: "GET", statusCode: 500, timestamp: 300 }), db);

    const events = await getNetworkEvents({ host: "api.com", statusCode: "5xx" }, db);
    expect(events).toHaveLength(1);
    expect(events[0].method).toBe("POST");
  });
});
