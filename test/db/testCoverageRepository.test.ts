import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types";
import { createTestDatabase } from "./testDbHelper";
import { FakeTimer } from "../fakes/FakeTimer";
import { TestCoverageRepository } from "../../src/db/testCoverageRepository";

describe("TestCoverageRepository", () => {
  let db: Kysely<Database>;
  let timer: FakeTimer;
  let repo: TestCoverageRepository;

  beforeEach(async () => {
    db = await createTestDatabase();
    timer = new FakeTimer();
    timer.setCurrentTime(1000000);
    repo = new TestCoverageRepository(timer, db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  /** Insert a navigation app into the DB (required FK parent). */
  async function insertApp(appId: string): Promise<void> {
    await db
      .insertInto("navigation_apps")
      .values({ app_id: appId, updated_at: "2024-06-01T00:00:00.000Z" })
      .execute();
  }

  /** Insert a navigation node and return its auto-generated id. */
  async function insertNode(appId: string, screenName: string): Promise<number> {
    const result = await db
      .insertInto("navigation_nodes")
      .values({
        app_id: appId,
        screen_name: screenName,
        first_seen_at: 1000,
        last_seen_at: 1000,
        visit_count: 1,
        back_stack_depth: null,
        task_id: null,
        screenshot_path: null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return result.id;
  }

  /** Insert a navigation edge and return its auto-generated id. */
  async function insertEdge(appId: string, fromScreen: string, toScreen: string): Promise<number> {
    const result = await db
      .insertInto("navigation_edges")
      .values({
        app_id: appId,
        from_screen: fromScreen,
        to_screen: toScreen,
        tool_name: "tapOn",
        tool_args: null,
        timestamp: 1000,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return result.id;
  }

  describe("startSession", () => {
    test("creates a new session with correct fields", async () => {
      await insertApp("com.example.app");

      const session = await repo.startSession("uuid-1", "com.example.app");
      expect(session.session_uuid).toBe("uuid-1");
      expect(session.app_id).toBe("com.example.app");
      expect(session.start_time).toBe(1000000);
      expect(session.end_time).toBeNull();
      expect(session.total_nodes_visited).toBe(0);
      expect(session.total_edges_traversed).toBe(0);
      expect(session.id).toBeGreaterThan(0);
    });

    test("uses timer.now() for start_time", async () => {
      await insertApp("com.example.app");
      timer.setCurrentTime(5555555);

      const session = await repo.startSession("uuid-t", "com.example.app");
      expect(session.start_time).toBe(5555555);
    });
  });

  describe("getOrCreateSession", () => {
    test("returns existing session if already created", async () => {
      await insertApp("com.example.app");

      const first = await repo.startSession("uuid-1", "com.example.app");
      const second = await repo.getOrCreateSession("uuid-1", "com.example.app");

      expect(second.id).toBe(first.id);
      expect(second.session_uuid).toBe("uuid-1");
    });

    test("creates a new session if not found", async () => {
      await insertApp("com.example.app");

      const session = await repo.getOrCreateSession("uuid-new", "com.example.app");
      expect(session.session_uuid).toBe("uuid-new");
      expect(session.app_id).toBe("com.example.app");
    });
  });

  describe("endSession", () => {
    test("sets end_time on the session", async () => {
      await insertApp("com.example.app");

      await repo.startSession("uuid-1", "com.example.app");
      timer.setCurrentTime(2000000);
      await repo.endSession("uuid-1");

      const session = await repo.getSession("uuid-1");
      expect(session).toBeDefined();
      expect(session!.end_time).toBe(2000000);
    });

    test("uses timer.now() for end_time", async () => {
      await insertApp("com.example.app");

      await repo.startSession("uuid-1", "com.example.app");
      timer.setCurrentTime(9999999);
      await repo.endSession("uuid-1");

      const session = await repo.getSession("uuid-1");
      expect(session!.end_time).toBe(9999999);
    });
  });

  describe("recordNodeVisit", () => {
    test("creates a new node coverage record on first visit", async () => {
      await insertApp("com.example.app");
      const nodeId = await insertNode("com.example.app", "HomeScreen");
      const session = await repo.startSession("uuid-1", "com.example.app");

      await repo.recordNodeVisit(session.id, nodeId, 2000);

      const covered = await repo.getCoveredNodes(session.id);
      expect(covered).toHaveLength(1);
      expect(covered[0].node_id).toBe(nodeId);
      expect(covered[0].visit_count).toBe(1);
      expect(covered[0].first_visit_time).toBe(2000);
      expect(covered[0].last_visit_time).toBe(2000);
    });

    test("increments visit count on subsequent visits", async () => {
      await insertApp("com.example.app");
      const nodeId = await insertNode("com.example.app", "HomeScreen");
      const session = await repo.startSession("uuid-1", "com.example.app");

      await repo.recordNodeVisit(session.id, nodeId, 2000);
      await repo.recordNodeVisit(session.id, nodeId, 3000);
      await repo.recordNodeVisit(session.id, nodeId, 4000);

      const covered = await repo.getCoveredNodes(session.id);
      expect(covered).toHaveLength(1);
      expect(covered[0].visit_count).toBe(3);
      expect(covered[0].first_visit_time).toBe(2000);
      expect(covered[0].last_visit_time).toBe(4000);
    });

    test("increments total_nodes_visited on session", async () => {
      await insertApp("com.example.app");
      const nodeId = await insertNode("com.example.app", "HomeScreen");
      const session = await repo.startSession("uuid-1", "com.example.app");

      await repo.recordNodeVisit(session.id, nodeId, 2000);
      await repo.recordNodeVisit(session.id, nodeId, 3000);

      const updated = await repo.getSession("uuid-1");
      expect(updated!.total_nodes_visited).toBe(2);
    });

    test("tracks different nodes independently", async () => {
      await insertApp("com.example.app");
      const nodeA = await insertNode("com.example.app", "ScreenA");
      const nodeB = await insertNode("com.example.app", "ScreenB");
      const session = await repo.startSession("uuid-1", "com.example.app");

      await repo.recordNodeVisit(session.id, nodeA, 2000);
      await repo.recordNodeVisit(session.id, nodeB, 3000);

      const covered = await repo.getCoveredNodes(session.id);
      expect(covered).toHaveLength(2);
    });
  });

  describe("recordEdgeTraversal", () => {
    test("creates a new edge coverage record on first traversal", async () => {
      await insertApp("com.example.app");
      const edgeId = await insertEdge("com.example.app", "Home", "Settings");
      const session = await repo.startSession("uuid-1", "com.example.app");

      await repo.recordEdgeTraversal(session.id, edgeId, 2000);

      const covered = await repo.getCoveredEdges(session.id);
      expect(covered).toHaveLength(1);
      expect(covered[0].edge_id).toBe(edgeId);
      expect(covered[0].traversal_count).toBe(1);
      expect(covered[0].first_traversal_time).toBe(2000);
      expect(covered[0].last_traversal_time).toBe(2000);
    });

    test("increments traversal count on subsequent traversals", async () => {
      await insertApp("com.example.app");
      const edgeId = await insertEdge("com.example.app", "Home", "Settings");
      const session = await repo.startSession("uuid-1", "com.example.app");

      await repo.recordEdgeTraversal(session.id, edgeId, 2000);
      await repo.recordEdgeTraversal(session.id, edgeId, 3000);
      await repo.recordEdgeTraversal(session.id, edgeId, 4000);

      const covered = await repo.getCoveredEdges(session.id);
      expect(covered).toHaveLength(1);
      expect(covered[0].traversal_count).toBe(3);
      expect(covered[0].first_traversal_time).toBe(2000);
      expect(covered[0].last_traversal_time).toBe(4000);
    });

    test("increments total_edges_traversed on session", async () => {
      await insertApp("com.example.app");
      const edgeId = await insertEdge("com.example.app", "Home", "Settings");
      const session = await repo.startSession("uuid-1", "com.example.app");

      await repo.recordEdgeTraversal(session.id, edgeId, 2000);
      await repo.recordEdgeTraversal(session.id, edgeId, 3000);

      const updated = await repo.getSession("uuid-1");
      expect(updated!.total_edges_traversed).toBe(2);
    });

    test("tracks different edges independently", async () => {
      await insertApp("com.example.app");
      const edgeA = await insertEdge("com.example.app", "Home", "Settings");
      const edgeB = await insertEdge("com.example.app", "Settings", "Profile");
      const session = await repo.startSession("uuid-1", "com.example.app");

      await repo.recordEdgeTraversal(session.id, edgeA, 2000);
      await repo.recordEdgeTraversal(session.id, edgeB, 3000);

      const covered = await repo.getCoveredEdges(session.id);
      expect(covered).toHaveLength(2);
    });
  });

  describe("getCoveredNodes", () => {
    test("returns empty array when no nodes visited", async () => {
      await insertApp("com.example.app");
      const session = await repo.startSession("uuid-1", "com.example.app");

      const covered = await repo.getCoveredNodes(session.id);
      expect(covered).toEqual([]);
    });

    test("returns only nodes for the specified session", async () => {
      await insertApp("com.example.app");
      const nodeId = await insertNode("com.example.app", "HomeScreen");
      const session1 = await repo.startSession("uuid-1", "com.example.app");
      const session2 = await repo.startSession("uuid-2", "com.example.app");

      await repo.recordNodeVisit(session1.id, nodeId, 2000);

      const covered1 = await repo.getCoveredNodes(session1.id);
      expect(covered1).toHaveLength(1);

      const covered2 = await repo.getCoveredNodes(session2.id);
      expect(covered2).toHaveLength(0);
    });
  });

  describe("getCoveredEdges", () => {
    test("returns empty array when no edges traversed", async () => {
      await insertApp("com.example.app");
      const session = await repo.startSession("uuid-1", "com.example.app");

      const covered = await repo.getCoveredEdges(session.id);
      expect(covered).toEqual([]);
    });

    test("returns only edges for the specified session", async () => {
      await insertApp("com.example.app");
      const edgeId = await insertEdge("com.example.app", "Home", "Settings");
      const session1 = await repo.startSession("uuid-1", "com.example.app");
      const session2 = await repo.startSession("uuid-2", "com.example.app");

      await repo.recordEdgeTraversal(session1.id, edgeId, 2000);

      const covered1 = await repo.getCoveredEdges(session1.id);
      expect(covered1).toHaveLength(1);

      const covered2 = await repo.getCoveredEdges(session2.id);
      expect(covered2).toHaveLength(0);
    });
  });

  describe("getSession", () => {
    test("returns the session by uuid", async () => {
      await insertApp("com.example.app");
      await repo.startSession("uuid-1", "com.example.app");

      const session = await repo.getSession("uuid-1");
      expect(session).toBeDefined();
      expect(session!.session_uuid).toBe("uuid-1");
    });

    test("returns undefined for nonexistent uuid", async () => {
      const session = await repo.getSession("nonexistent");
      expect(session).toBeUndefined();
    });
  });

  describe("getSessionsForApp", () => {
    test("returns all sessions for the given app", async () => {
      await insertApp("com.app1");
      await insertApp("com.app2");

      await repo.startSession("uuid-1", "com.app1");
      timer.advanceTime(100);
      await repo.startSession("uuid-2", "com.app1");
      await repo.startSession("uuid-3", "com.app2");

      const sessions = await repo.getSessionsForApp("com.app1");
      expect(sessions).toHaveLength(2);
      // Ordered by start_time desc
      expect(sessions[0].session_uuid).toBe("uuid-2");
      expect(sessions[1].session_uuid).toBe("uuid-1");
    });

    test("returns empty array when no sessions exist for app", async () => {
      await insertApp("com.app1");
      const sessions = await repo.getSessionsForApp("com.app1");
      expect(sessions).toEqual([]);
    });
  });

  describe("clearSession", () => {
    test("removes the specified session", async () => {
      await insertApp("com.example.app");
      await repo.startSession("uuid-1", "com.example.app");
      await repo.startSession("uuid-2", "com.example.app");

      await repo.clearSession("uuid-1");

      const removed = await repo.getSession("uuid-1");
      expect(removed).toBeUndefined();

      const kept = await repo.getSession("uuid-2");
      expect(kept).toBeDefined();
    });

    test("does not leave orphaned session rows", async () => {
      await insertApp("com.example.app");
      const session = await repo.startSession("uuid-1", "com.example.app");

      await repo.clearSession("uuid-1");

      const rows = await db
        .selectFrom("test_coverage_sessions")
        .selectAll()
        .where("id", "=", session.id)
        .execute();
      expect(rows).toHaveLength(0);
    });
  });

  describe("clearCoverageForApp", () => {
    test("removes all sessions for the given app", async () => {
      await insertApp("com.app1");
      await insertApp("com.app2");

      await repo.startSession("uuid-1", "com.app1");
      await repo.startSession("uuid-2", "com.app1");
      await repo.startSession("uuid-3", "com.app2");

      await repo.clearCoverageForApp("com.app1");

      const app1Sessions = await repo.getSessionsForApp("com.app1");
      expect(app1Sessions).toHaveLength(0);

      const app2Sessions = await repo.getSessionsForApp("com.app2");
      expect(app2Sessions).toHaveLength(1);
    });

    test("removes all sessions for the app from the database", async () => {
      await insertApp("com.example.app");
      await repo.startSession("uuid-1", "com.example.app");
      await repo.startSession("uuid-2", "com.example.app");

      await repo.clearCoverageForApp("com.example.app");

      const rows = await db
        .selectFrom("test_coverage_sessions")
        .selectAll()
        .where("app_id", "=", "com.example.app")
        .execute();
      expect(rows).toHaveLength(0);
    });
  });
});
