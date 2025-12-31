/**
 * Manages accessibility violation baselines for suppressing known violations
 */

import { getDatabase } from "../../db/database";
import type { WcagViolation } from "../../models/AccessibilityAudit";

interface BaselineData {
  screenId: string;
  violations: WcagViolation[];
  updatedAt: string;
}

export class BaselineManager {
  /**
   * Get baseline for a screen
   */
  async getBaseline(screenId: string): Promise<BaselineData | null> {
    const db = getDatabase();

    const result = await db
      .selectFrom("accessibility_baselines")
      .selectAll()
      .where("screen_id", "=", screenId)
      .executeTakeFirst();

    if (!result) {
      return null;
    }

    return {
      screenId: result.screen_id,
      violations: JSON.parse(result.violations_json),
      updatedAt: result.updated_at,
    };
  }

  /**
   * Save baseline for a screen
   */
  async saveBaseline(screenId: string, violations: WcagViolation[]): Promise<void> {
    const db = getDatabase();
    const now = new Date().toISOString();

    // Upsert baseline
    const existing = await db
      .selectFrom("accessibility_baselines")
      .select("id")
      .where("screen_id", "=", screenId)
      .executeTakeFirst();

    if (existing) {
      // Update existing baseline
      await db
        .updateTable("accessibility_baselines")
        .set({
          violations_json: JSON.stringify(violations),
          updated_at: now,
        })
        .where("screen_id", "=", screenId)
        .execute();
    } else {
      // Insert new baseline
      await db
        .insertInto("accessibility_baselines")
        .values({
          screen_id: screenId,
          violations_json: JSON.stringify(violations),
          updated_at: now,
        })
        .execute();
    }
  }

  /**
   * Clear baseline for a screen
   */
  async clearBaseline(screenId: string): Promise<void> {
    const db = getDatabase();

    await db
      .deleteFrom("accessibility_baselines")
      .where("screen_id", "=", screenId)
      .execute();
  }

  /**
   * List all baselines
   */
  async listBaselines(): Promise<BaselineData[]> {
    const db = getDatabase();

    const results = await db
      .selectFrom("accessibility_baselines")
      .selectAll()
      .execute();

    return results.map(row => ({
      screenId: row.screen_id,
      violations: JSON.parse(row.violations_json),
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Clear all baselines
   */
  async clearAllBaselines(): Promise<void> {
    const db = getDatabase();

    await db.deleteFrom("accessibility_baselines").execute();
  }

  /**
   * Clean up old baselines (older than specified days)
   */
  async cleanupOldBaselines(daysOld: number): Promise<number> {
    const db = getDatabase();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffIso = cutoffDate.toISOString();

    const result = await db
      .deleteFrom("accessibility_baselines")
      .where("updated_at", "<", cutoffIso)
      .executeTakeFirst();

    return Number(result.numDeletedRows) || 0;
  }
}
