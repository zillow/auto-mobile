import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types";
import { NavigationRepository } from "../../src/db/navigationRepository";
import { createTestDatabase } from "./testDbHelper";

describe("NavigationRepository", () => {
  let db: Kysely<Database>;
  let repo: NavigationRepository;

  beforeEach(async () => {
    db = await createTestDatabase();
    repo = new NavigationRepository(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe("getOrCreateApp", () => {
    test("creates a new app record", async () => {
      const app = await repo.getOrCreateApp("com.example.app");

      expect(app.app_id).toBe("com.example.app");
      expect(app.updated_at).toBeDefined();
      expect(app.created_at).toBeDefined();
    });

    test("returns existing app on second call", async () => {
      const first = await repo.getOrCreateApp("com.example.app");
      const second = await repo.getOrCreateApp("com.example.app");

      expect(second.app_id).toBe(first.app_id);
      // The existing record is returned from DB, so updated_at should match
      expect(second.updated_at).toBe(first.updated_at);
    });
  });

  describe("getOrCreateNode", () => {
    test("creates a new node with visit_count=1", async () => {
      await repo.getOrCreateApp("com.example.app");
      const node = await repo.getOrCreateNode("com.example.app", "HomeScreen", 1000);

      expect(node.app_id).toBe("com.example.app");
      expect(node.screen_name).toBe("HomeScreen");
      expect(node.visit_count).toBe(1);
      expect(node.first_seen_at).toBe(1000);
      expect(node.last_seen_at).toBe(1000);
    });

    test("returns existing node with incremented visit_count", async () => {
      await repo.getOrCreateApp("com.example.app");
      const first = await repo.getOrCreateNode("com.example.app", "HomeScreen", 1000);
      const second = await repo.getOrCreateNode("com.example.app", "HomeScreen", 2000);

      expect(second.id).toBe(first.id);
      expect(second.visit_count).toBe(2);
      expect(second.first_seen_at).toBe(1000);
      expect(second.last_seen_at).toBe(2000);
    });
  });

  describe("getNode", () => {
    test("returns node by app and screen name", async () => {
      await repo.getOrCreateApp("com.example.app");
      await repo.getOrCreateNode("com.example.app", "LoginScreen", 1000);

      const node = await repo.getNode("com.example.app", "LoginScreen");
      expect(node).toBeDefined();
      expect(node!.screen_name).toBe("LoginScreen");
    });

    test("returns undefined for nonexistent node", async () => {
      const node = await repo.getNode("com.example.app", "NoScreen");
      expect(node).toBeUndefined();
    });
  });

  describe("getNodeById", () => {
    test("returns node by app and ID", async () => {
      await repo.getOrCreateApp("com.example.app");
      const created = await repo.getOrCreateNode("com.example.app", "HomeScreen", 1000);

      const node = await repo.getNodeById("com.example.app", created.id);
      expect(node).toBeDefined();
      expect(node!.screen_name).toBe("HomeScreen");
    });

    test("returns undefined for wrong app ID", async () => {
      await repo.getOrCreateApp("com.example.app");
      const created = await repo.getOrCreateNode("com.example.app", "HomeScreen", 1000);

      const node = await repo.getNodeById("com.other.app", created.id);
      expect(node).toBeUndefined();
    });
  });

  describe("createEdge", () => {
    test("creates edge between screens", async () => {
      await repo.getOrCreateApp("com.example.app");
      await repo.getOrCreateNode("com.example.app", "Login", 1000);
      await repo.getOrCreateNode("com.example.app", "Home", 1000);

      const edge = await repo.createEdge(
        "com.example.app",
        "Login",
        "Home",
        "tapOn",
        { element: "loginButton" },
        2000
      );

      expect(edge.app_id).toBe("com.example.app");
      expect(edge.from_screen).toBe("Login");
      expect(edge.to_screen).toBe("Home");
      expect(edge.tool_name).toBe("tapOn");
      expect(edge.tool_args).toBe(JSON.stringify({ element: "loginButton" }));
      expect(edge.timestamp).toBe(2000);
    });

    test("creates edge with null tool_name", async () => {
      await repo.getOrCreateApp("com.example.app");

      const edge = await repo.createEdge(
        "com.example.app",
        "Login",
        "Home",
        null,
        null,
        2000
      );

      expect(edge.tool_name).toBeNull();
      expect(edge.tool_args).toBeNull();
    });
  });

  describe("getEdges", () => {
    test("returns all edges for an app ordered by timestamp", async () => {
      await repo.getOrCreateApp("com.example.app");

      await repo.createEdge("com.example.app", "A", "B", "tapOn", null, 1000);
      await repo.createEdge("com.example.app", "B", "C", "swipeOn", null, 2000);

      const edges = await repo.getEdges("com.example.app");
      expect(edges).toHaveLength(2);
      expect(edges[0].from_screen).toBe("A");
      expect(edges[1].from_screen).toBe("B");
    });

    test("returns empty for app with no edges", async () => {
      const edges = await repo.getEdges("com.nonexistent.app");
      expect(edges).toHaveLength(0);
    });
  });

  describe("getNodes", () => {
    test("returns all nodes for an app", async () => {
      await repo.getOrCreateApp("com.example.app");
      await repo.getOrCreateNode("com.example.app", "ScreenA", 1000);
      await repo.getOrCreateNode("com.example.app", "ScreenB", 2000);

      const nodes = await repo.getNodes("com.example.app");
      expect(nodes).toHaveLength(2);
      // Ordered by screen_name asc
      expect(nodes[0].screen_name).toBe("ScreenA");
      expect(nodes[1].screen_name).toBe("ScreenB");
    });

    test("returns empty for app with no nodes", async () => {
      const nodes = await repo.getNodes("com.nonexistent.app");
      expect(nodes).toHaveLength(0);
    });
  });

  describe("getOrCreateUIElement", () => {
    test("creates a new UI element", async () => {
      await repo.getOrCreateApp("com.example.app");
      const element = await repo.getOrCreateUIElement(
        "com.example.app",
        { text: "Login", resourceId: "btn_login", clickable: true },
        1000
      );

      expect(element.text).toBe("Login");
      expect(element.resource_id).toBe("btn_login");
      expect(element.clickable).toBe(1);
      expect(element.first_seen_at).toBe(1000);
      expect(element.last_seen_at).toBe(1000);
    });

    test("returns existing element with updated last_seen_at", async () => {
      await repo.getOrCreateApp("com.example.app");
      const first = await repo.getOrCreateUIElement(
        "com.example.app",
        { text: "Login", resourceId: "btn_login" },
        1000
      );
      const second = await repo.getOrCreateUIElement(
        "com.example.app",
        { text: "Login", resourceId: "btn_login" },
        2000
      );

      expect(second.id).toBe(first.id);
      expect(second.first_seen_at).toBe(1000);
      expect(second.last_seen_at).toBe(2000);
    });
  });

  describe("setNodeModals / getNodeModals", () => {
    test("sets and retrieves modal stack for a node", async () => {
      await repo.getOrCreateApp("com.example.app");
      const node = await repo.getOrCreateNode("com.example.app", "Home", 1000);

      await repo.setNodeModals(node.id, ["dialog_a", "dialog_b"]);

      const modals = await repo.getNodeModals(node.id);
      expect(modals).toEqual(["dialog_a", "dialog_b"]);
    });

    test("replaces modal stack on second set", async () => {
      await repo.getOrCreateApp("com.example.app");
      const node = await repo.getOrCreateNode("com.example.app", "Home", 1000);

      await repo.setNodeModals(node.id, ["dialog_a"]);
      await repo.setNodeModals(node.id, ["dialog_x", "dialog_y"]);

      const modals = await repo.getNodeModals(node.id);
      expect(modals).toEqual(["dialog_x", "dialog_y"]);
    });
  });

  describe("setScrollPosition / getScrollPosition", () => {
    test("sets and retrieves scroll position for an edge", async () => {
      await repo.getOrCreateApp("com.example.app");
      const edge = await repo.createEdge("com.example.app", "A", "B", "swipeOn", null, 1000);
      const target = await repo.getOrCreateUIElement(
        "com.example.app",
        { text: "Target", resourceId: "target_elem" },
        1000
      );

      await repo.setScrollPosition(edge.id, target.id, "down", undefined, "slow", 3);

      const scroll = await repo.getScrollPosition(edge.id);
      expect(scroll).toBeDefined();
      expect(scroll!.direction).toBe("down");
      expect(scroll!.speed).toBe("slow");
      expect(scroll!.swipeCount).toBe(3);
      expect(scroll!.targetElement.id).toBe(target.id);
    });
  });

  describe("clearApp", () => {
    test("deletes the app record", async () => {
      await repo.getOrCreateApp("com.example.app");

      await repo.clearApp("com.example.app");

      // App record should be deleted
      const app = await db
        .selectFrom("navigation_apps")
        .selectAll()
        .where("app_id", "=", "com.example.app")
        .executeTakeFirst();
      expect(app).toBeUndefined();
    });
  });

  describe("updateNodeVisit", () => {
    test("increments visit_count and updates last_seen_at", async () => {
      await repo.getOrCreateApp("com.example.app");
      const node = await repo.getOrCreateNode("com.example.app", "Home", 1000);
      expect(node.visit_count).toBe(1);

      await repo.updateNodeVisit(node.id, 5000);

      const updated = await repo.getNodeById("com.example.app", node.id);
      expect(updated).toBeDefined();
      expect(updated!.visit_count).toBe(2);
      expect(updated!.last_seen_at).toBe(5000);
    });
  });

  describe("getStats", () => {
    test("returns correct counts", async () => {
      await repo.getOrCreateApp("com.example.app");
      await repo.getOrCreateNode("com.example.app", "A", 1000);
      await repo.getOrCreateNode("com.example.app", "B", 1000);
      await repo.createEdge("com.example.app", "A", "B", "tapOn", null, 2000);
      await repo.createEdge("com.example.app", "B", "A", null, null, 3000);

      const stats = await repo.getStats("com.example.app");
      expect(stats.nodeCount).toBe(2);
      expect(stats.edgeCount).toBe(2);
      expect(stats.toolEdgeCount).toBe(1);
      expect(stats.unknownEdgeCount).toBe(1);
    });
  });

  describe("clearAppGraph", () => {
    test("clears graph data but keeps app record", async () => {
      await repo.getOrCreateApp("com.example.app");
      await repo.getOrCreateNode("com.example.app", "Home", 1000);
      await repo.createEdge("com.example.app", "Home", "Settings", "tapOn", null, 2000);

      await repo.clearAppGraph("com.example.app");

      const nodes = await repo.getNodes("com.example.app");
      expect(nodes).toHaveLength(0);

      const edges = await repo.getEdges("com.example.app");
      expect(edges).toHaveLength(0);

      // App record is preserved
      const app = await db
        .selectFrom("navigation_apps")
        .selectAll()
        .where("app_id", "=", "com.example.app")
        .executeTakeFirst();
      expect(app).toBeDefined();
    });
  });
});
