import { describe, it, expect } from "bun:test";
import { buildNetworkGraph, type GraphLeaf, type GraphBranch } from "../../src/server/networkGraph";
import type { NetworkEventWithId } from "../../src/db/networkEventRepository";

function makeEvent(overrides: Partial<NetworkEventWithId> = {}): NetworkEventWithId {
  return {
    id: 1,
    deviceId: "device-1",
    timestamp: 1000,
    applicationId: "com.example",
    sessionId: "session-1",
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
    requestHeaders: null,
    responseHeaders: null,
    requestBody: null,
    responseBody: null,
    contentType: "application/json",
    ...overrides,
  };
}

describe("buildNetworkGraph", () => {
  it("returns empty graph for no events", () => {
    const result = buildNetworkGraph([]);
    expect(result.graph).toHaveLength(0);
  });

  it("groups by host", () => {
    const events = [
      makeEvent({ url: "https://api.example.com/a", host: "api.example.com", path: "/a" }),
      makeEvent({ url: "https://cdn.example.com/b", host: "cdn.example.com", path: "/b" }),
    ];

    const result = buildNetworkGraph(events);
    expect(result.graph).toHaveLength(2);

    const hosts = result.graph.map(g => g.host).sort();
    expect(hosts).toEqual(["api.example.com", "cdn.example.com"]);
  });

  it("builds path tree", () => {
    const events = [
      makeEvent({ url: "https://api.example.com/v1/users", path: "/v1/users" }),
      makeEvent({ url: "https://api.example.com/v1/posts", path: "/v1/posts" }),
    ];

    const result = buildNetworkGraph(events);
    expect(result.graph).toHaveLength(1);

    const hostEntry = result.graph[0];
    expect(hostEntry.paths["v1"]).toBeDefined();

    const v1 = hostEntry.paths["v1"] as GraphBranch;
    expect(v1.paths["users[GET]"]).toBeDefined();
    expect(v1.paths["posts[GET]"]).toBeDefined();
  });

  it("computes stats correctly", () => {
    const events = [
      makeEvent({ path: "/data", durationMs: 100, statusCode: 200 }),
      makeEvent({ path: "/data", durationMs: 200, statusCode: 200 }),
      makeEvent({ path: "/data", durationMs: 300, statusCode: 500 }),
    ];

    const result = buildNetworkGraph(events);
    const leaf = result.graph[0].paths["data[GET]"] as GraphLeaf;

    expect(leaf.success).toBe(2);
    expect(leaf.errors).toBe(1);
    expect(leaf.p50).toBe(200);
    expect(leaf.p95).toBe(290);
  });

  it("detects numeric IDs as parameterized", () => {
    const events = [
      makeEvent({ url: "https://api.example.com/users/123/posts", path: "/users/123/posts" }),
      makeEvent({ url: "https://api.example.com/users/456/posts", path: "/users/456/posts" }),
    ];

    const result = buildNetworkGraph(events);
    const users = result.graph[0].paths["users"] as GraphBranch;

    // Both 123 and 456 should collapse into {id}
    expect(users.paths["{id}"]).toBeDefined();
    const idNode = users.paths["{id}"] as GraphBranch;
    expect((idNode as any).parameterized).toBe(true);
    expect(idNode.paths["posts[GET]"]).toBeDefined();
  });

  it("detects UUID segments as parameterized", () => {
    const events = [
      makeEvent({
        url: "https://api.example.com/items/550e8400-e29b-41d4-a716-446655440000",
        path: "/items/550e8400-e29b-41d4-a716-446655440000",
      }),
    ];

    const result = buildNetworkGraph(events);
    const items = result.graph[0].paths["items"] as GraphBranch;
    expect(items.paths["{id}[GET]"]).toBeDefined();
  });

  it("recomputes percentiles when merging parameterized paths", () => {
    const events = [
      makeEvent({ url: "https://api.example.com/users/123", path: "/users/123", durationMs: 100 }),
      makeEvent({ url: "https://api.example.com/users/456", path: "/users/456", durationMs: 300 }),
    ];

    const result = buildNetworkGraph(events);
    const users = result.graph[0].paths["users"] as GraphBranch;
    const idNode = users.paths["{id}[GET]"] as GraphLeaf;

    // Both durations (100, 300) merged — p50 should be 200 (midpoint), not 100 or 300
    expect(idNode.success).toBe(2);
    expect(idNode.p50).toBe(200);
    expect(idNode.p95).toBe(290);
  });

  it("filters by minRequests", () => {
    const events = [
      makeEvent({ path: "/popular", id: 1 }),
      makeEvent({ path: "/popular", id: 2 }),
      makeEvent({ path: "/popular", id: 3 }),
      makeEvent({ path: "/rare", id: 4 }),
    ];

    const result = buildNetworkGraph(events, { minRequests: 2 });
    const paths = result.graph[0].paths;

    expect(paths["popular[GET]"]).toBeDefined();
    expect(paths["rare[GET]"]).toBeUndefined();
  });

  it("separates schemes", () => {
    const events = [
      makeEvent({ url: "https://api.example.com/a", host: "api.example.com", path: "/a" }),
      makeEvent({ url: "http://api.example.com/b", host: "api.example.com", path: "/b" }),
    ];

    const result = buildNetworkGraph(events);
    expect(result.graph).toHaveLength(2);

    const schemes = result.graph.map(g => g.scheme).sort();
    expect(schemes).toEqual(["http", "https"]);
  });

  it("separates GET and POST on the same path", () => {
    const events = [
      makeEvent({ path: "/users", method: "GET", durationMs: 50, statusCode: 200 }),
      makeEvent({ path: "/users", method: "POST", durationMs: 150, statusCode: 201 }),
      makeEvent({ path: "/users", method: "GET", durationMs: 100, statusCode: 200 }),
    ];

    const result = buildNetworkGraph(events);
    const paths = result.graph[0].paths;

    const getLeaf = paths["users[GET]"] as GraphLeaf;
    const postLeaf = paths["users[POST]"] as GraphLeaf;

    expect(getLeaf).toBeDefined();
    expect(postLeaf).toBeDefined();
    expect(getLeaf.method).toBe("GET");
    expect(postLeaf.method).toBe("POST");
    expect(getLeaf.success).toBe(2);
    expect(postLeaf.success).toBe(1);
    expect(getLeaf.p50).toBe(75);
    expect(postLeaf.p50).toBe(150);
  });
});
