import type { Kysely } from "kysely";
import { sql } from "kysely";
import { getDatabase } from "./database";
import type {
  Database,
  TestCoverageSession,
  NewTestCoverageSession,
  TestNodeCoverage,
  NewTestNodeCoverage,
  TestEdgeCoverage,
  NewTestEdgeCoverage,
  NavigationNode,
  NavigationEdge,
} from "./types";
import { logger } from "../utils/logger";
import type { Timer } from "../utils/SystemTimer";
import { defaultTimer } from "../utils/SystemTimer";

/**
 * Repository for test coverage tracking database operations.
 * Provides type-safe access to test coverage data.
 */
export class TestCoverageRepository {
  private timer: Timer;
  private db: Kysely<Database> | null;

  constructor(timer: Timer = defaultTimer, db?: Kysely<Database>) {
    this.timer = timer;
    this.db = db ?? null;
  }

  private getDb(): Kysely<Database> {
    if (this.db) {
      return this.db;
    }
    return getDatabase();
  }

  /**
   * Start a new test coverage session for an app.
   */
  async startSession(sessionUuid: string, appId: string): Promise<TestCoverageSession> {
    const db = this.getDb();
    const now = this.timer.now();

    const newSession: NewTestCoverageSession = {
      session_uuid: sessionUuid,
      app_id: appId,
      start_time: now,
      end_time: null,
      total_nodes_visited: 0,
      total_edges_traversed: 0,
    };

    const result = await db
      .insertInto("test_coverage_sessions")
      .values(newSession)
      .returningAll()
      .executeTakeFirstOrThrow();

    logger.info(
      `[TEST_COVERAGE] Started coverage session: ${sessionUuid} for app: ${appId}`
    );

    return result;
  }

  /**
   * Get or create a test coverage session.
   */
  async getOrCreateSession(sessionUuid: string, appId: string): Promise<TestCoverageSession> {
    const db = this.getDb();

    const existing = await db
      .selectFrom("test_coverage_sessions")
      .selectAll()
      .where("session_uuid", "=", sessionUuid)
      .executeTakeFirst();

    if (existing) {
      return existing;
    }

    return this.startSession(sessionUuid, appId);
  }

  /**
   * End a test coverage session.
   */
  async endSession(sessionUuid: string): Promise<void> {
    const db = this.getDb();
    const now = this.timer.now();

    await db
      .updateTable("test_coverage_sessions")
      .set({ end_time: now })
      .where("session_uuid", "=", sessionUuid)
      .execute();

    logger.info(`[TEST_COVERAGE] Ended coverage session: ${sessionUuid}`);
  }

  /**
   * Record a node visit during a test session.
   */
  async recordNodeVisit(sessionId: number, nodeId: number, timestamp: number): Promise<void> {
    const db = this.getDb();

    // Check if this node was already visited in this session
    const existing = await db
      .selectFrom("test_node_coverage")
      .selectAll()
      .where("session_id", "=", sessionId)
      .where("node_id", "=", nodeId)
      .executeTakeFirst();

    if (existing) {
      // Update visit count and last visit time
      await db
        .updateTable("test_node_coverage")
        .set({
          visit_count: existing.visit_count + 1,
          last_visit_time: timestamp,
        })
        .where("id", "=", existing.id)
        .execute();
    } else {
      // Create new coverage record
      const newCoverage: NewTestNodeCoverage = {
        session_id: sessionId,
        node_id: nodeId,
        visit_count: 1,
        first_visit_time: timestamp,
        last_visit_time: timestamp,
      };

      await db
        .insertInto("test_node_coverage")
        .values(newCoverage)
        .execute();
    }

    // Update session totals
    await db
      .updateTable("test_coverage_sessions")
      .set({
        total_nodes_visited: sql`total_nodes_visited + 1`,
      })
      .where("id", "=", sessionId)
      .execute();
  }

  /**
   * Record an edge traversal during a test session.
   */
  async recordEdgeTraversal(
    sessionId: number,
    edgeId: number,
    timestamp: number
  ): Promise<void> {
    const db = this.getDb();

    // Check if this edge was already traversed in this session
    const existing = await db
      .selectFrom("test_edge_coverage")
      .selectAll()
      .where("session_id", "=", sessionId)
      .where("edge_id", "=", edgeId)
      .executeTakeFirst();

    if (existing) {
      // Update traversal count and last traversal time
      await db
        .updateTable("test_edge_coverage")
        .set({
          traversal_count: existing.traversal_count + 1,
          last_traversal_time: timestamp,
        })
        .where("id", "=", existing.id)
        .execute();
    } else {
      // Create new coverage record
      const newCoverage: NewTestEdgeCoverage = {
        session_id: sessionId,
        edge_id: edgeId,
        traversal_count: 1,
        first_traversal_time: timestamp,
        last_traversal_time: timestamp,
      };

      await db
        .insertInto("test_edge_coverage")
        .values(newCoverage)
        .execute();
    }

    // Update session totals
    await db
      .updateTable("test_coverage_sessions")
      .set({
        total_edges_traversed: sql`total_edges_traversed + 1`,
      })
      .where("id", "=", sessionId)
      .execute();
  }

  /**
   * Get all covered nodes for a session.
   */
  async getCoveredNodes(sessionId: number): Promise<TestNodeCoverage[]> {
    const db = this.getDb();
    return db
      .selectFrom("test_node_coverage")
      .selectAll()
      .where("session_id", "=", sessionId)
      .execute();
  }

  /**
   * Get all covered edges for a session.
   */
  async getCoveredEdges(sessionId: number): Promise<TestEdgeCoverage[]> {
    const db = this.getDb();
    return db
      .selectFrom("test_edge_coverage")
      .selectAll()
      .where("session_id", "=", sessionId)
      .execute();
  }

  /**
   * Get test coverage session by UUID.
   */
  async getSession(sessionUuid: string): Promise<TestCoverageSession | undefined> {
    const db = this.getDb();
    return db
      .selectFrom("test_coverage_sessions")
      .selectAll()
      .where("session_uuid", "=", sessionUuid)
      .executeTakeFirst();
  }

  /**
   * Get all test coverage sessions for an app.
   */
  async getSessionsForApp(appId: string): Promise<TestCoverageSession[]> {
    const db = this.getDb();
    return db
      .selectFrom("test_coverage_sessions")
      .selectAll()
      .where("app_id", "=", appId)
      .orderBy("start_time", "desc")
      .execute();
  }

  /**
   * Get coverage analysis for an app (aggregated across all test sessions).
   */
  async getAggregatedCoverageAnalysis(appId: string): Promise<{
    totalNodes: number;
    coveredNodes: number;
    uncoveredNodes: NavigationNode[];
    totalEdges: number;
    coveredEdges: number;
    uncoveredEdges: NavigationEdge[];
    coveragePercentage: number;
  }> {
    const db = this.getDb();

    // Get all nodes for the app
    const allNodes = await db
      .selectFrom("navigation_nodes")
      .selectAll()
      .where("app_id", "=", appId)
      .execute();

    // Get all edges for the app
    const allEdges = await db
      .selectFrom("navigation_edges")
      .selectAll()
      .where("app_id", "=", appId)
      .execute();

    // Get all covered node IDs (from any test session for this app)
    const coveredNodeIds = await db
      .selectFrom("test_node_coverage as tnc")
      .innerJoin("test_coverage_sessions as tcs", "tcs.id", "tnc.session_id")
      .select("tnc.node_id")
      .where("tcs.app_id", "=", appId)
      .distinct()
      .execute();

    const coveredNodeIdSet = new Set(coveredNodeIds.map(row => row.node_id));

    // Get all covered edge IDs (from any test session for this app)
    const coveredEdgeIds = await db
      .selectFrom("test_edge_coverage as tec")
      .innerJoin("test_coverage_sessions as tcs", "tcs.id", "tec.session_id")
      .select("tec.edge_id")
      .where("tcs.app_id", "=", appId)
      .distinct()
      .execute();

    const coveredEdgeIdSet = new Set(coveredEdgeIds.map(row => row.edge_id));

    // Find uncovered nodes and edges
    const uncoveredNodes = allNodes.filter(node => !coveredNodeIdSet.has(node.id));
    const uncoveredEdges = allEdges.filter(edge => !coveredEdgeIdSet.has(edge.id));

    const totalNodes = allNodes.length;
    const coveredNodesCount = coveredNodeIdSet.size;
    const totalEdges = allEdges.length;
    const coveredEdgesCount = coveredEdgeIdSet.size;

    // Calculate overall coverage percentage
    const totalElements = totalNodes + totalEdges;
    const coveredElements = coveredNodesCount + coveredEdgesCount;
    const coveragePercentage = totalElements > 0 ? (coveredElements / totalElements) * 100 : 0;

    return {
      totalNodes,
      coveredNodes: coveredNodesCount,
      uncoveredNodes,
      totalEdges,
      coveredEdges: coveredEdgesCount,
      uncoveredEdges,
      coveragePercentage,
    };
  }

  /**
   * Clear all test coverage data for an app.
   */
  async clearCoverageForApp(appId: string): Promise<void> {
    const db = this.getDb();

    await db
      .deleteFrom("test_coverage_sessions")
      .where("app_id", "=", appId)
      .execute();

    logger.info(`[TEST_COVERAGE] Cleared all coverage data for app: ${appId}`);
  }

  /**
   * Clear test coverage data for a specific session.
   */
  async clearSession(sessionUuid: string): Promise<void> {
    const db = this.getDb();

    await db
      .deleteFrom("test_coverage_sessions")
      .where("session_uuid", "=", sessionUuid)
      .execute();

    logger.info(`[TEST_COVERAGE] Cleared coverage session: ${sessionUuid}`);
  }
}

// Export singleton instance
export const testCoverageRepository = new TestCoverageRepository();
