import type { Kysely } from "kysely";
import { getDatabase } from "./database";
import type {
  Database,
  NewNavigationApp,
  NavigationApp,
  NewNavigationNode,
  NavigationNode,
  NewNavigationEdge,
  NavigationEdge,
  NewUIElement,
  UIElement,
  NewEdgeUIElement,
  NewNodeModal,
  NewEdgeModal,
  NewScrollPosition,
  NavigationNodeFingerprint,
  NewNavigationNodeFingerprint,
  NavigationSuggestion,
  NewNavigationSuggestion,
} from "./types";
import { logger } from "../utils/logger";

/**
 * Repository for navigation graph database operations.
 * Provides type-safe access to navigation data.
 */
export class NavigationRepository {
  private db: Kysely<Database> | null;

  constructor(db?: Kysely<Database>) {
    this.db = db ?? null;
  }

  private getDb(): Kysely<Database> {
    if (this.db) {
      return this.db;
    }
    return getDatabase();
  }
  /**
   * Get or create a navigation app record.
   */
  async getOrCreateApp(appId: string): Promise<NavigationApp> {
    const db = this.getDb();

    // Check if app exists
    const existing = await db
      .selectFrom("navigation_apps")
      .selectAll()
      .where("app_id", "=", appId)
      .executeTakeFirst();

    if (existing) {
      return existing;
    }

    // Create new app record
    const now = new Date().toISOString();
    const newApp: NewNavigationApp = {
      app_id: appId,
      updated_at: now,
    };

    await db
      .insertInto("navigation_apps")
      .values(newApp)
      .execute();

    logger.info(`[NAV_REPO] Created app record: ${appId}`);

    return {
      ...newApp,
      created_at: now,
    };
  }

  /**
   * Update app's updated_at timestamp.
   */
  async touchApp(appId: string): Promise<void> {
    const db = this.getDb();
    await db
      .updateTable("navigation_apps")
      .set({ updated_at: new Date().toISOString() })
      .where("app_id", "=", appId)
      .execute();
  }

  /**
   * Get or create a navigation node (screen).
   */
  async getOrCreateNode(
    appId: string,
    screenName: string,
    timestamp: number
  ): Promise<NavigationNode> {
    const db = this.getDb();

    // Check if node exists
    const existing = await db
      .selectFrom("navigation_nodes")
      .selectAll()
      .where("app_id", "=", appId)
      .where("screen_name", "=", screenName)
      .executeTakeFirst();

    if (existing) {
      // Update last_seen_at and increment visit_count
      await db
        .updateTable("navigation_nodes")
        .set({
          last_seen_at: timestamp,
          visit_count: existing.visit_count + 1,
        })
        .where("id", "=", existing.id)
        .execute();

      return {
        ...existing,
        last_seen_at: timestamp,
        visit_count: existing.visit_count + 1,
      };
    }

    // Create new node
    const newNode: NewNavigationNode = {
      app_id: appId,
      screen_name: screenName,
      first_seen_at: timestamp,
      last_seen_at: timestamp,
      visit_count: 1,
    };

    const result = await db
      .insertInto("navigation_nodes")
      .values(newNode)
      .returningAll()
      .executeTakeFirstOrThrow();

    logger.debug(`[NAV_REPO] New screen discovered: ${screenName} (id=${result.id})`);

    return result;
  }

  /**
   * Get a node by app and screen name.
   */
  async getNode(appId: string, screenName: string): Promise<NavigationNode | undefined> {
    const db = this.getDb();
    return db
      .selectFrom("navigation_nodes")
      .selectAll()
      .where("app_id", "=", appId)
      .where("screen_name", "=", screenName)
      .executeTakeFirst();
  }

  /**
   * Get a node by app and node ID.
   */
  async getNodeById(appId: string, nodeId: number): Promise<NavigationNode | undefined> {
    const db = this.getDb();
    return db
      .selectFrom("navigation_nodes")
      .selectAll()
      .where("app_id", "=", appId)
      .where("id", "=", nodeId)
      .executeTakeFirst();
  }

  /**
   * Update back stack information for a node.
   */
  async updateNodeBackStack(
    appId: string,
    screenName: string,
    backStackDepth: number,
    taskId: number
  ): Promise<void> {
    const db = this.getDb();
    await db
      .updateTable("navigation_nodes")
      .set({
        back_stack_depth: backStackDepth,
        task_id: taskId,
      })
      .where("app_id", "=", appId)
      .where("screen_name", "=", screenName)
      .execute();

    logger.debug(
      `[NAV_REPO] Updated back stack for ${screenName}: depth=${backStackDepth}, taskId=${taskId}`
    );
  }

  /**
   * Get all nodes for an app.
   */
  async getNodes(appId: string): Promise<NavigationNode[]> {
    const db = this.getDb();
    return db
      .selectFrom("navigation_nodes")
      .selectAll()
      .where("app_id", "=", appId)
      .orderBy("screen_name", "asc")
      .execute();
  }

  /**
   * Get nodes by screen name.
   */
  async getNodesByScreenNames(
    appId: string,
    screenNames: string[]
  ): Promise<NavigationNode[]> {
    if (screenNames.length === 0) {
      return [];
    }

    const db = this.getDb();
    return db
      .selectFrom("navigation_nodes")
      .selectAll()
      .where("app_id", "=", appId)
      .where("screen_name", "in", screenNames)
      .execute();
  }

  /**
   * Create a navigation edge.
   */
  async createEdge(
    appId: string,
    fromScreen: string,
    toScreen: string,
    toolName: string | null,
    toolArgs: Record<string, any> | null,
    timestamp: number
  ): Promise<NavigationEdge> {
    const db = this.getDb();

    const newEdge: NewNavigationEdge = {
      app_id: appId,
      from_screen: fromScreen,
      to_screen: toScreen,
      tool_name: toolName,
      tool_args: toolArgs ? JSON.stringify(toolArgs) : null,
      timestamp,
    };

    const result = await db
      .insertInto("navigation_edges")
      .values(newEdge)
      .returningAll()
      .executeTakeFirstOrThrow();

    const toolInfo = toolName ? ` via ${toolName}` : " (unknown)";
    logger.debug(
      `[NAV_REPO] Edge created: ${fromScreen} → ${toScreen}${toolInfo} (id=${result.id})`
    );

    return result;
  }

  /**
   * Get all edges for an app.
   */
  async getEdges(appId: string): Promise<NavigationEdge[]> {
    const db = this.getDb();
    return db
      .selectFrom("navigation_edges")
      .selectAll()
      .where("app_id", "=", appId)
      .orderBy("timestamp", "asc")
      .execute();
  }

  /**
   * Get edges for an app with pagination support.
   */
  async getEdgesPage(
    appId: string,
    options: {
      cursor?: { timestamp: number; id: number } | null;
      limit: number;
    }
  ): Promise<{ edges: NavigationEdge[]; hasMore: boolean }> {
    const db = this.getDb();
    let query = db
      .selectFrom("navigation_edges")
      .selectAll()
      .where("app_id", "=", appId);

    if (options.cursor) {
      query = query.where(({ eb, or, and }) =>
        or([
          eb("timestamp", ">", options.cursor!.timestamp),
          and([
            eb("timestamp", "=", options.cursor!.timestamp),
            eb("id", ">", options.cursor!.id),
          ]),
        ])
      );
    }

    const rows = await query
      .orderBy("timestamp", "asc")
      .orderBy("id", "asc")
      .limit(options.limit + 1)
      .execute();

    const hasMore = rows.length > options.limit;
    const edges = hasMore ? rows.slice(0, options.limit) : rows;

    return { edges, hasMore };
  }

  /**
   * Get edges from a specific screen.
   */
  async getEdgesFrom(appId: string, fromScreen: string): Promise<NavigationEdge[]> {
    const db = this.getDb();
    return db
      .selectFrom("navigation_edges")
      .selectAll()
      .where("app_id", "=", appId)
      .where("from_screen", "=", fromScreen)
      .execute();
  }

  /**
   * Get edges to a specific screen.
   */
  async getEdgesTo(appId: string, toScreen: string): Promise<NavigationEdge[]> {
    const db = this.getDb();
    return db
      .selectFrom("navigation_edges")
      .selectAll()
      .where("app_id", "=", appId)
      .where("to_screen", "=", toScreen)
      .execute();
  }

  /**
   * Get or create a UI element.
   */
  async getOrCreateUIElement(
    appId: string,
    element: {
      text?: string;
      resourceId?: string;
      contentDescription?: string;
      className?: string;
      bounds?: { left: number; top: number; right: number; bottom: number };
      clickable?: boolean;
      scrollable?: boolean;
    },
    timestamp: number
  ): Promise<UIElement> {
    const db = this.getDb();

    // Try to find existing element with same properties
    let query = db
      .selectFrom("ui_elements")
      .selectAll()
      .where("app_id", "=", appId);

    if (element.text !== undefined) {
      query = query.where("text", "=", element.text);
    }
    if (element.resourceId !== undefined) {
      query = query.where("resource_id", "=", element.resourceId);
    }
    if (element.contentDescription !== undefined) {
      query = query.where("content_description", "=", element.contentDescription);
    }
    if (element.className !== undefined) {
      query = query.where("class_name", "=", element.className);
    }
    if (element.bounds) {
      query = query
        .where("bounds_left", "=", element.bounds.left)
        .where("bounds_top", "=", element.bounds.top)
        .where("bounds_right", "=", element.bounds.right)
        .where("bounds_bottom", "=", element.bounds.bottom);
    }

    const existing = await query.executeTakeFirst();

    if (existing) {
      // Update last_seen_at
      await db
        .updateTable("ui_elements")
        .set({ last_seen_at: timestamp })
        .where("id", "=", existing.id)
        .execute();

      return {
        ...existing,
        last_seen_at: timestamp,
      };
    }

    // Create new UI element
    const newElement: NewUIElement = {
      app_id: appId,
      text: element.text || null,
      resource_id: element.resourceId || null,
      content_description: element.contentDescription || null,
      class_name: element.className || null,
      bounds_left: element.bounds?.left || null,
      bounds_top: element.bounds?.top || null,
      bounds_right: element.bounds?.right || null,
      bounds_bottom: element.bounds?.bottom || null,
      clickable: element.clickable !== undefined ? (element.clickable ? 1 : 0) : null,
      scrollable: element.scrollable !== undefined ? (element.scrollable ? 1 : 0) : null,
      first_seen_at: timestamp,
      last_seen_at: timestamp,
    };

    const result = await db
      .insertInto("ui_elements")
      .values(newElement)
      .returningAll()
      .executeTakeFirstOrThrow();

    logger.debug(
      `[NAV_REPO] New UI element: ${element.text || element.resourceId || "unknown"} (id=${result.id})`
    );

    return result;
  }

  /**
   * Link UI elements to an edge.
   */
  async linkUIElementsToEdge(
    edgeId: number,
    uiElementIds: number[]
  ): Promise<void> {
    if (uiElementIds.length === 0) {return;}

    const db = this.getDb();
    const values: NewEdgeUIElement[] = uiElementIds.map((uiElementId, index) => ({
      edge_id: edgeId,
      ui_element_id: uiElementId,
      selection_order: index,
    }));

    await db.insertInto("edge_ui_elements").values(values).execute();
  }

  /**
   * Get UI elements for an edge.
   */
  async getUIElementsForEdge(edgeId: number): Promise<UIElement[]> {
    const db = this.getDb();
    return db
      .selectFrom("edge_ui_elements")
      .innerJoin("ui_elements", "ui_elements.id", "edge_ui_elements.ui_element_id")
      .selectAll("ui_elements")
      .where("edge_id", "=", edgeId)
      .orderBy("selection_order", "asc")
      .execute();
  }

  /**
   * Set modal stack for a node.
   */
  async setNodeModals(nodeId: number, modalStack: string[]): Promise<void> {
    const db = this.getDb();

    // Delete existing modals
    await db
      .deleteFrom("node_modals")
      .where("node_id", "=", nodeId)
      .execute();

    if (modalStack.length === 0) {return;}

    // Insert new modals
    const values: NewNodeModal[] = modalStack.map((modalId, index) => ({
      node_id: nodeId,
      modal_identifier: modalId,
      stack_level: index,
    }));

    await db.insertInto("node_modals").values(values).execute();
  }

  /**
   * Get modal stack for a node.
   */
  async getNodeModals(nodeId: number): Promise<string[]> {
    const db = this.getDb();
    const modals = await db
      .selectFrom("node_modals")
      .select("modal_identifier")
      .where("node_id", "=", nodeId)
      .orderBy("stack_level", "asc")
      .execute();

    return modals.map(m => m.modal_identifier);
  }

  /**
   * Set modal stack for an edge (from or to position).
   */
  async setEdgeModals(
    edgeId: number,
    position: "from" | "to",
    modalStack: string[]
  ): Promise<void> {
    const db = this.getDb();

    // Delete existing modals for this position
    await db
      .deleteFrom("edge_modals")
      .where("edge_id", "=", edgeId)
      .where("position", "=", position)
      .execute();

    if (modalStack.length === 0) {return;}

    // Insert new modals
    const values: NewEdgeModal[] = modalStack.map((modalId, index) => ({
      edge_id: edgeId,
      position,
      modal_identifier: modalId,
      stack_level: index,
    }));

    await db.insertInto("edge_modals").values(values).execute();
  }

  /**
   * Get modal stack for an edge position.
   */
  async getEdgeModals(edgeId: number, position: "from" | "to"): Promise<string[]> {
    const db = this.getDb();
    const modals = await db
      .selectFrom("edge_modals")
      .select("modal_identifier")
      .where("edge_id", "=", edgeId)
      .where("position", "=", position)
      .orderBy("stack_level", "asc")
      .execute();

    return modals.map(m => m.modal_identifier);
  }

  /**
   * Set scroll position for an edge.
   */
  async setScrollPosition(
    edgeId: number,
    targetElementId: number,
    direction: string,
    containerElementId?: number,
    speed?: string,
    swipeCount?: number
  ): Promise<void> {
    const db = this.getDb();

    const scrollPos: NewScrollPosition = {
      edge_id: edgeId,
      target_element_id: targetElementId,
      container_element_id: containerElementId || null,
      direction,
      speed: speed || null,
      swipe_count: swipeCount || null,
    };

    // Upsert: delete if exists, then insert
    await db
      .deleteFrom("scroll_positions")
      .where("edge_id", "=", edgeId)
      .execute();

    await db.insertInto("scroll_positions").values(scrollPos).execute();
  }

  /**
   * Get scroll position for an edge.
   */
  async getScrollPosition(edgeId: number): Promise<{
    targetElement: UIElement;
    containerElement?: UIElement;
    direction: string;
    speed?: string;
    swipeCount?: number;
  } | null> {
    const db = this.getDb();

    const result = await db
      .selectFrom("scroll_positions")
      .innerJoin("ui_elements as target", "target.id", "scroll_positions.target_element_id")
      .leftJoin("ui_elements as container", "container.id", "scroll_positions.container_element_id")
      .select([
        "scroll_positions.direction",
        "scroll_positions.speed",
        "scroll_positions.swipe_count",
      ])
      .selectAll("target")
      .select([
        "container.id as container_id",
        "container.text as container_text",
        "container.resource_id as container_resource_id",
        "container.content_description as container_content_description",
      ])
      .where("edge_id", "=", edgeId)
      .executeTakeFirst();

    if (!result) {return null;}

    const response: {
      targetElement: UIElement;
      containerElement?: UIElement;
      direction: string;
      speed?: string;
      swipeCount?: number;
    } = {
      targetElement: {
        id: result.id,
        app_id: result.app_id,
        text: result.text,
        resource_id: result.resource_id,
        content_description: result.content_description,
        class_name: result.class_name,
        bounds_left: result.bounds_left,
        bounds_top: result.bounds_top,
        bounds_right: result.bounds_right,
        bounds_bottom: result.bounds_bottom,
        clickable: result.clickable,
        scrollable: result.scrollable,
        first_seen_at: result.first_seen_at,
        last_seen_at: result.last_seen_at,
        created_at: result.created_at,
      },
      direction: result.direction,
      speed: result.speed || undefined,
      swipeCount: result.swipe_count || undefined,
    };

    // Add container element if present
    if (result.container_id) {
      response.containerElement = {
        id: result.container_id,
        app_id: result.app_id, // Same app
        text: result.container_text,
        resource_id: result.container_resource_id,
        content_description: result.container_content_description,
        class_name: null,
        bounds_left: null,
        bounds_top: null,
        bounds_right: null,
        bounds_bottom: null,
        clickable: null,
        scrollable: null,
        first_seen_at: 0,
        last_seen_at: 0,
        created_at: "",
      };
    }

    return response;
  }

  /**
   * Get navigation graph statistics for an app.
   */
  async getStats(appId: string): Promise<{
    nodeCount: number;
    edgeCount: number;
    toolEdgeCount: number;
    unknownEdgeCount: number;
  }> {
    const db = this.getDb();

    const nodes = await db
      .selectFrom("navigation_nodes")
      .select(db.fn.countAll<number>().as("count"))
      .where("app_id", "=", appId)
      .executeTakeFirst();

    const edges = await db
      .selectFrom("navigation_edges")
      .select(db.fn.countAll<number>().as("count"))
      .where("app_id", "=", appId)
      .executeTakeFirst();

    const toolEdges = await db
      .selectFrom("navigation_edges")
      .select(db.fn.countAll<number>().as("count"))
      .where("app_id", "=", appId)
      .where("tool_name", "is not", null)
      .executeTakeFirst();

    const unknownEdges = await db
      .selectFrom("navigation_edges")
      .select(db.fn.countAll<number>().as("count"))
      .where("app_id", "=", appId)
      .where("tool_name", "is", null)
      .executeTakeFirst();

    return {
      nodeCount: Number(nodes?.count || 0),
      edgeCount: Number(edges?.count || 0),
      toolEdgeCount: Number(toolEdges?.count || 0),
      unknownEdgeCount: Number(unknownEdges?.count || 0),
    };
  }

  /**
   * Clear all navigation data for an app.
   */
  async clearApp(appId: string): Promise<void> {
    const db = this.getDb();

    // Cascade deletes will handle related tables
    await db
      .deleteFrom("navigation_apps")
      .where("app_id", "=", appId)
      .execute();

    logger.info(`[NAV_REPO] Cleared navigation data for app: ${appId}`);
  }

  /**
   * Update the screenshot path for a navigation node.
   */
  async updateNodeScreenshot(
    appId: string,
    screenName: string,
    screenshotPath: string | null
  ): Promise<void> {
    const db = this.getDb();
    await db
      .updateTable("navigation_nodes")
      .set({ screenshot_path: screenshotPath })
      .where("app_id", "=", appId)
      .where("screen_name", "=", screenName)
      .execute();

    logger.debug(`[NAV_REPO] Updated screenshot for ${screenName}: ${screenshotPath}`);
  }

  /**
   * Update the screenshot path for a navigation node by node ID.
   */
  async updateNodeScreenshotById(
    nodeId: number,
    screenshotPath: string | null
  ): Promise<void> {
    const db = this.getDb();
    await db
      .updateTable("navigation_nodes")
      .set({ screenshot_path: screenshotPath })
      .where("id", "=", nodeId)
      .execute();

    logger.debug(`[NAV_REPO] Updated screenshot for node ${nodeId}: ${screenshotPath}`);
  }

  /**
   * Clear only nodes and edges for an app, keeping the app record.
   * Useful for tests that want to reset graph state without losing the app.
   */
  async clearAppGraph(appId: string): Promise<void> {
    const db = this.getDb();

    // Delete edges first (they reference nodes via screen names, not FK, so no cascade)
    await db
      .deleteFrom("navigation_edges")
      .where("app_id", "=", appId)
      .execute();

    // Delete nodes (cascade will delete node_modals and navigation_node_fingerprints)
    await db
      .deleteFrom("navigation_nodes")
      .where("app_id", "=", appId)
      .execute();

    // Delete any orphaned UI elements for this app
    await db
      .deleteFrom("ui_elements")
      .where("app_id", "=", appId)
      .execute();

    // Delete navigation suggestions for this app
    await db
      .deleteFrom("navigation_suggestions")
      .where("app_id", "=", appId)
      .execute();

    logger.info(`[NAV_REPO] Cleared graph data for app: ${appId}`);
  }

  // ==========================================
  // Fingerprint and Suggestion Methods
  // ==========================================

  /**
   * Get or create a fingerprint record for a node.
   * Fingerprints are scoped per app to prevent cross-app collisions.
   */
  async getOrCreateFingerprint(
    appId: string,
    nodeId: number,
    hash: string,
    data: string,
    timestamp: number
  ): Promise<NavigationNodeFingerprint> {
    const db = this.getDb();

    // Check if fingerprint already exists for this app
    const existing = await db
      .selectFrom("navigation_node_fingerprints")
      .selectAll()
      .where("app_id", "=", appId)
      .where("fingerprint_hash", "=", hash)
      .executeTakeFirst();

    if (existing) {
      // Update last_seen_at and increment occurrence_count
      await db
        .updateTable("navigation_node_fingerprints")
        .set({
          last_seen_at: timestamp,
          occurrence_count: existing.occurrence_count + 1,
        })
        .where("id", "=", existing.id)
        .execute();

      return {
        ...existing,
        last_seen_at: timestamp,
        occurrence_count: existing.occurrence_count + 1,
      };
    }

    // Create new fingerprint record
    const newFingerprint: NewNavigationNodeFingerprint = {
      app_id: appId,
      node_id: nodeId,
      fingerprint_hash: hash,
      fingerprint_data: data,
      first_seen_at: timestamp,
      last_seen_at: timestamp,
      occurrence_count: 1,
    };

    const result = await db
      .insertInto("navigation_node_fingerprints")
      .values(newFingerprint)
      .returningAll()
      .executeTakeFirstOrThrow();

    logger.debug(
      `[NAV_REPO] New fingerprint for node ${nodeId}: ${hash.substring(0, 12)}...`
    );

    return result;
  }

  /**
   * Find a navigation node by fingerprint hash within a specific app.
   * Fingerprints are scoped per app to prevent cross-app collisions.
   */
  async getNodeByFingerprint(appId: string, hash: string): Promise<NavigationNode | undefined> {
    const db = this.getDb();

    const fingerprint = await db
      .selectFrom("navigation_node_fingerprints")
      .select("node_id")
      .where("app_id", "=", appId)
      .where("fingerprint_hash", "=", hash)
      .executeTakeFirst();

    if (!fingerprint) {
      return undefined;
    }

    return db
      .selectFrom("navigation_nodes")
      .selectAll()
      .where("id", "=", fingerprint.node_id)
      .executeTakeFirst();
  }

  /**
   * Get all fingerprints associated with a node.
   */
  async getFingerprintsForNode(nodeId: number): Promise<NavigationNodeFingerprint[]> {
    const db = this.getDb();
    return db
      .selectFrom("navigation_node_fingerprints")
      .selectAll()
      .where("node_id", "=", nodeId)
      .execute();
  }

  /**
   * Add or update a navigation suggestion (uncorrelated fingerprint).
   */
  async addOrUpdateSuggestion(
    appId: string,
    hash: string,
    data: string,
    timestamp: number
  ): Promise<NavigationSuggestion> {
    const db = this.getDb();

    // Check if suggestion already exists for this app and hash
    const existing = await db
      .selectFrom("navigation_suggestions")
      .selectAll()
      .where("app_id", "=", appId)
      .where("fingerprint_hash", "=", hash)
      .executeTakeFirst();

    if (existing) {
      // Update last_seen_at and increment occurrence_count
      await db
        .updateTable("navigation_suggestions")
        .set({
          last_seen_at: timestamp,
          occurrence_count: existing.occurrence_count + 1,
        })
        .where("id", "=", existing.id)
        .execute();

      return {
        ...existing,
        last_seen_at: timestamp,
        occurrence_count: existing.occurrence_count + 1,
      };
    }

    // Create new suggestion
    const newSuggestion: NewNavigationSuggestion = {
      app_id: appId,
      fingerprint_hash: hash,
      fingerprint_data: data,
      first_seen_at: timestamp,
      last_seen_at: timestamp,
      occurrence_count: 1,
      promoted_to_fingerprint_id: null,
    };

    const result = await db
      .insertInto("navigation_suggestions")
      .values(newSuggestion)
      .returningAll()
      .executeTakeFirstOrThrow();

    logger.debug(
      `[NAV_REPO] New suggestion for app ${appId}: ${hash.substring(0, 12)}...`
    );

    return result;
  }

  /**
   * Promote a suggestion to a named node.
   * Creates a fingerprint record for the node and links the suggestion.
   */
  async promoteSuggestion(
    suggestionId: number,
    nodeId: number,
    timestamp: number
  ): Promise<NavigationNodeFingerprint> {
    const db = this.getDb();

    // Get the suggestion
    const suggestion = await db
      .selectFrom("navigation_suggestions")
      .selectAll()
      .where("id", "=", suggestionId)
      .executeTakeFirst();

    if (!suggestion) {
      throw new Error(`Suggestion not found: ${suggestionId}`);
    }

    // Create fingerprint record (using app_id from suggestion)
    const fingerprint = await this.getOrCreateFingerprint(
      suggestion.app_id,
      nodeId,
      suggestion.fingerprint_hash,
      suggestion.fingerprint_data,
      timestamp
    );

    // Link suggestion to fingerprint
    await db
      .updateTable("navigation_suggestions")
      .set({ promoted_to_fingerprint_id: fingerprint.id })
      .where("id", "=", suggestionId)
      .execute();

    logger.info(
      `[NAV_REPO] Promoted suggestion ${suggestionId} to node ${nodeId}`
    );

    return fingerprint;
  }

  /**
   * Check if an app has any named navigation nodes.
   */
  async hasNamedNodes(appId: string): Promise<boolean> {
    const db = this.getDb();
    const result = await db
      .selectFrom("navigation_nodes")
      .select(db.fn.countAll<number>().as("count"))
      .where("app_id", "=", appId)
      .executeTakeFirst();

    return Number(result?.count || 0) > 0;
  }

  /**
   * Get unpromoted suggestions for an app.
   */
  async getSuggestions(appId: string): Promise<NavigationSuggestion[]> {
    const db = this.getDb();
    return db
      .selectFrom("navigation_suggestions")
      .selectAll()
      .where("app_id", "=", appId)
      .where("promoted_to_fingerprint_id", "is", null)
      .orderBy("occurrence_count", "desc")
      .execute();
  }

  /**
   * Update a node's visit count and last_seen_at without creating a new node.
   */
  async updateNodeVisit(nodeId: number, timestamp: number): Promise<void> {
    const db = this.getDb();
    await db
      .updateTable("navigation_nodes")
      .set(eb => ({
        last_seen_at: timestamp,
        visit_count: eb("visit_count", "+", 1),
      }))
      .where("id", "=", nodeId)
      .execute();
  }
}
