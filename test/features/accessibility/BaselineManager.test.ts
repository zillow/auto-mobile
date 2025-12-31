/**
 * Unit tests for BaselineManager
 * Tests baseline CRUD operations and database interactions
 */

import { expect, describe, it, beforeEach, afterEach } from "bun:test";
import type { WcagViolation } from "../../../src/models/AccessibilityAudit";
import { createTestDatabase, destroyTestDatabase } from "../../helpers/test-database";
import type { Kysely } from "kysely";
import type { Database as DatabaseSchema } from "../../../src/db/types";

// We'll create a test-specific BaselineManager that uses our test database
let testDb: Kysely<DatabaseSchema>;

// Create a custom BaselineManager class that uses our test database instead of the singleton
class TestBaselineManager {
  private db: Kysely<DatabaseSchema>;

  constructor(db: Kysely<DatabaseSchema>) {
    this.db = db;
  }

  async getBaseline(screenId: string) {
    const result = await this.db
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

  async saveBaseline(screenId: string, violations: WcagViolation[]) {
    const now = new Date().toISOString();

    const existing = await this.db
      .selectFrom("accessibility_baselines")
      .select("id")
      .where("screen_id", "=", screenId)
      .executeTakeFirst();

    if (existing) {
      await this.db
        .updateTable("accessibility_baselines")
        .set({
          violations_json: JSON.stringify(violations),
          updated_at: now,
        })
        .where("screen_id", "=", screenId)
        .execute();
    } else {
      await this.db
        .insertInto("accessibility_baselines")
        .values({
          screen_id: screenId,
          violations_json: JSON.stringify(violations),
          created_at: now,
          updated_at: now,
        })
        .execute();
    }
  }

  async clearBaseline(screenId: string) {
    await this.db
      .deleteFrom("accessibility_baselines")
      .where("screen_id", "=", screenId)
      .execute();
  }

  async listBaselines() {
    const results = await this.db
      .selectFrom("accessibility_baselines")
      .selectAll()
      .execute();

    return results.map(row => ({
      screenId: row.screen_id,
      violations: JSON.parse(row.violations_json),
      updatedAt: row.updated_at,
    }));
  }

  async clearAllBaselines() {
    await this.db.deleteFrom("accessibility_baselines").execute();
  }

  async cleanupOldBaselines(daysOld: number) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffIso = cutoffDate.toISOString();

    const result = await this.db
      .deleteFrom("accessibility_baselines")
      .where("updated_at", "<", cutoffIso)
      .executeTakeFirst();

    return Number(result.numDeletedRows) || 0;
  }
}

describe("BaselineManager", function() {
  let manager: TestBaselineManager;

  beforeEach(async function() {
    // Create in-memory test database
    testDb = await createTestDatabase();
    manager = new TestBaselineManager(testDb);
  });

  afterEach(async function() {
    // Destroy test database
    await destroyTestDatabase(testDb);
  });

  describe("CRUD Operations", function() {
    const mockViolations: WcagViolation[] = [
      {
        type: "missing-content-description",
        severity: "error",
        criterion: "1.1.1",
        message: "Interactive element lacks content description",
        element: {
          bounds: { left: 0, top: 0, right: 100, bottom: 50 },
          clickable: true,
        },
        fingerprint: "abc123",
      },
      {
        type: "insufficient-contrast",
        severity: "error",
        criterion: "1.4.3",
        message: "Text contrast ratio too low",
        element: {
          bounds: { left: 0, top: 50, right: 100, bottom: 100 },
          text: "Low contrast text",
        },
        details: { ratio: 2.5, required: 4.5 },
        fingerprint: "def456",
      },
    ];

    it("should save baseline to database", async function() {
      const screenId = "com.example.app.MainActivity";

      await manager.saveBaseline(screenId, mockViolations);

      const baseline = await manager.getBaseline(screenId);
      expect(baseline).not.toBeNull();
      expect(baseline!.screenId).toBe(screenId);
      expect(baseline!.violations).toHaveLength(2);
      expect(baseline!.violations[0].fingerprint).toBe("abc123");
    });

    it("should retrieve baseline by screen ID", async function() {
      const screenId = "com.example.app.SettingsActivity";

      await manager.saveBaseline(screenId, mockViolations);
      const baseline = await manager.getBaseline(screenId);

      expect(baseline).not.toBeNull();
      expect(baseline!.screenId).toBe(screenId);
      expect(baseline!.violations).toEqual(mockViolations);
    });

    it("should update existing baseline", async function() {
      const screenId = "com.example.app.MainActivity";

      // Save initial baseline
      await manager.saveBaseline(screenId, mockViolations);

      // Update with new violations
      const newViolations: WcagViolation[] = [
        {
          type: "touch-target-too-small",
          severity: "warning",
          criterion: "2.5.5",
          message: "Touch target smaller than 44x44dp",
          element: {
            bounds: { left: 0, top: 0, right: 30, bottom: 30 },
            clickable: true,
          },
          fingerprint: "ghi789",
        },
      ];

      await manager.saveBaseline(screenId, newViolations);

      const baseline = await manager.getBaseline(screenId);
      expect(baseline).not.toBeNull();
      expect(baseline!.violations).toHaveLength(1);
      expect(baseline!.violations[0].fingerprint).toBe("ghi789");
    });

    it("should delete baseline", async function() {
      const screenId = "com.example.app.MainActivity";

      await manager.saveBaseline(screenId, mockViolations);
      await manager.clearBaseline(screenId);

      const baseline = await manager.getBaseline(screenId);
      expect(baseline).toBeNull();
    });

    it("should list all baselines", async function() {
      await manager.saveBaseline("screen1", mockViolations.slice(0, 1));
      await manager.saveBaseline("screen2", mockViolations.slice(1, 2));
      await manager.saveBaseline("screen3", mockViolations);

      const baselines = await manager.listBaselines();
      expect(baselines).toHaveLength(3);

      const screenIds = baselines.map(b => b.screenId);
      expect(screenIds).toEqual(expect.arrayContaining(["screen1", "screen2", "screen3"]));
    });

    it("should clear all baselines", async function() {
      await manager.saveBaseline("screen1", mockViolations);
      await manager.saveBaseline("screen2", mockViolations);
      await manager.saveBaseline("screen3", mockViolations);

      await manager.clearAllBaselines();

      const baselines = await manager.listBaselines();
      expect(baselines).toHaveLength(0);
    });
  });

  describe("Filtering", function() {
    it("should handle empty baseline", async function() {
      const baseline = await manager.getBaseline("nonexistent");
      expect(baseline).toBeNull();
    });

    it("should handle baseline with empty violations array", async function() {
      const screenId = "com.example.app.EmptyScreen";

      await manager.saveBaseline(screenId, []);

      const baseline = await manager.getBaseline(screenId);
      expect(baseline).not.toBeNull();
      expect(baseline!.violations).toHaveLength(0);
    });
  });

  describe("Cleanup", function() {
    it("should cleanup old baselines", async function() {
      // Create a baseline with an old updated_at timestamp
      const now = new Date();
      const oldDate = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000); // 31 days ago

      // Insert directly into database with old timestamp
      await testDb
        .insertInto("accessibility_baselines")
        .values({
          screen_id: "old_screen",
          violations_json: JSON.stringify([]),
          created_at: oldDate.toISOString(),
          updated_at: oldDate.toISOString(),
        })
        .execute();

      // Insert a recent one
      await manager.saveBaseline("recent_screen", []);

      // Clean up baselines older than 30 days
      const deletedCount = await manager.cleanupOldBaselines(30);

      expect(deletedCount).toBe(1);

      // Verify old one is gone but recent one remains
      const oldBaseline = await manager.getBaseline("old_screen");
      const recentBaseline = await manager.getBaseline("recent_screen");

      expect(oldBaseline).toBeNull();
      expect(recentBaseline).not.toBeNull();
    });

    it("should return 0 when no baselines to cleanup", async function() {
      await manager.saveBaseline("recent_screen", []);

      const deletedCount = await manager.cleanupOldBaselines(30);

      expect(deletedCount).toBe(0);
    });
  });

  describe("Data Integrity", function() {
    it("should preserve violation structure in JSON serialization", async function() {
      const screenId = "test_screen";
      const violations: WcagViolation[] = [
        {
          type: "insufficient-contrast",
          severity: "error",
          criterion: "1.4.3",
          message: "Low contrast",
          element: {
            bounds: { left: 10, top: 20, right: 30, bottom: 40 },
            text: "Sample",
          },
          details: {
            ratio: 3.2,
            required: 4.5,
            textColor: { r: 128, g: 128, b: 128 },
            backgroundColor: { r: 255, g: 255, b: 255 },
          },
          fingerprint: "test123",
        },
      ];

      await manager.saveBaseline(screenId, violations);
      const baseline = await manager.getBaseline(screenId);

      expect(baseline).not.toBeNull();
      expect(baseline!.violations[0]).toEqual(violations[0]);
      expect(baseline!.violations[0].details).toEqual(violations[0].details);
    });

    it("should handle special characters in screen IDs", async function() {
      const screenId = "com.example/MainActivity:Fragment@123";

      await manager.saveBaseline(screenId, []);

      const baseline = await manager.getBaseline(screenId);
      expect(baseline).not.toBeNull();
      expect(baseline!.screenId).toBe(screenId);
    });

    it("should store and retrieve updated_at timestamp", async function() {
      const screenId = "test_screen";
      const beforeSave = new Date();

      await manager.saveBaseline(screenId, []);

      const baseline = await manager.getBaseline(screenId);
      expect(baseline).not.toBeNull();

      const updatedAt = new Date(baseline!.updatedAt);
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(beforeSave.getTime());
      expect(updatedAt.getTime()).toBeLessThanOrEqual(new Date().getTime());
    });
  });
});
