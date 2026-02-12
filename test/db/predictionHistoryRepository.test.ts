import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types";
import { PredictionHistoryRepository } from "../../src/db/predictionHistoryRepository";
import type { PredictionOutcomeRecord, TransitionKey } from "../../src/db/predictionHistoryRepository";
import { createTestDatabase } from "./testDbHelper";

describe("PredictionHistoryRepository", () => {
  let db: Kysely<Database>;
  let repo: PredictionHistoryRepository;

  beforeEach(async () => {
    db = await createTestDatabase();
    repo = new PredictionHistoryRepository(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  function makeOutcome(overrides: Partial<PredictionOutcomeRecord> = {}): PredictionOutcomeRecord {
    return {
      appId: "com.example.app",
      predictionId: "pred-1",
      timestamp: 1000,
      fromScreen: "LoginScreen",
      predictedScreen: "HomeScreen",
      actualScreen: "HomeScreen",
      toolName: "tapOn",
      predictedElements: ["button_login"],
      foundElements: ["button_login"],
      confidence: 0.9,
      matchScore: 1.0,
      correct: true,
      partialMatch: false,
      ...overrides,
    };
  }

  describe("recordOutcome", () => {
    test("inserts outcome and creates transition stats", async () => {
      await repo.recordOutcome(makeOutcome());

      const outcomes = await db.selectFrom("prediction_outcomes").selectAll().execute();
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].app_id).toBe("com.example.app");
      expect(outcomes[0].correct).toBe(1);

      const stats = await db.selectFrom("prediction_transition_stats").selectAll().execute();
      expect(stats).toHaveLength(1);
      expect(stats[0].attempts).toBe(1);
      expect(stats[0].successes).toBe(1);
    });

    test("records incorrect prediction", async () => {
      await repo.recordOutcome(makeOutcome({
        correct: false,
        actualScreen: "ErrorScreen",
        errorType: "wrong_screen",
      }));

      const outcomes = await db.selectFrom("prediction_outcomes").selectAll().execute();
      expect(outcomes[0].correct).toBe(0);
      expect(outcomes[0].error_type).toBe("wrong_screen");
    });
  });

  describe("upsertTransitionStats", () => {
    test("creates new stats on first call", async () => {
      const key: TransitionKey = {
        appId: "com.example.app",
        fromScreen: "Login",
        toScreen: "Home",
        toolName: "tapOn",
      };

      const result = await repo.upsertTransitionStats(key, 0.9, true);
      expect(result.attempts).toBe(1);
      expect(result.successes).toBe(1);
      expect(result.total_confidence).toBe(0.9);
    });

    test("updates existing stats on subsequent calls", async () => {
      const key: TransitionKey = {
        appId: "com.example.app",
        fromScreen: "Login",
        toScreen: "Home",
        toolName: "tapOn",
      };

      await repo.upsertTransitionStats(key, 0.9, true);
      const result = await repo.upsertTransitionStats(key, 0.7, false);

      expect(result.attempts).toBe(2);
      expect(result.successes).toBe(1);
      expect(result.total_confidence).toBeCloseTo(1.6, 5);
    });

    test("computes brier score sum", async () => {
      const key: TransitionKey = {
        appId: "com.example.app",
        fromScreen: "Login",
        toScreen: "Home",
        toolName: "tapOn",
      };

      // correct=true, confidence=0.9 => brier = (0.9-1)^2 = 0.01
      const result = await repo.upsertTransitionStats(key, 0.9, true);
      expect(result.brier_score_sum).toBeCloseTo(0.01, 5);
    });
  });

  describe("getTransitionStatsForScreen", () => {
    test("returns stats for a specific screen", async () => {
      const key1: TransitionKey = {
        appId: "com.example.app",
        fromScreen: "Login",
        toScreen: "Home",
        toolName: "tapOn",
      };
      const key2: TransitionKey = {
        appId: "com.example.app",
        fromScreen: "Login",
        toScreen: "Settings",
        toolName: "tapOn",
      };
      const key3: TransitionKey = {
        appId: "com.example.app",
        fromScreen: "Home",
        toScreen: "Profile",
        toolName: "tapOn",
      };

      await repo.upsertTransitionStats(key1, 0.9, true);
      await repo.upsertTransitionStats(key2, 0.8, true);
      await repo.upsertTransitionStats(key3, 0.7, true);

      const stats = await repo.getTransitionStatsForScreen("com.example.app", "Login");
      expect(stats).toHaveLength(2);
    });

    test("returns empty for unknown screen", async () => {
      const stats = await repo.getTransitionStatsForScreen("com.example.app", "Unknown");
      expect(stats).toHaveLength(0);
    });
  });
});
