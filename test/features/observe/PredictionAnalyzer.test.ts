import { describe, expect, it } from "bun:test";
import { PredictionAnalyzer } from "../../../src/features/observe/PredictionAnalyzer";
import type { PredictionOutcomeRecord } from "../../../src/db/predictionHistoryRepository";
import type { ObserveResult, PredictedAction } from "../../../src/models";

class FakePredictionHistoryStore {
  outcomes: PredictionOutcomeRecord[] = [];

  async recordOutcome(outcome: PredictionOutcomeRecord): Promise<void> {
    this.outcomes.push(outcome);
  }
}

class FakeNavigationGraph {
  constructor(private screen: string | null) {}

  getCurrentScreen(): string | null {
    return this.screen;
  }
}

const baseObservation: ObserveResult = {
  updatedAt: Date.now(),
  screenSize: { width: 1, height: 1 },
  systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
  viewHierarchy: {
    hierarchy: {
      node: {
        $: {
          bounds: "[0,0][1,1]",
          text: "Settings",
          "resource-id": "id/settings"
        }
      }
    }
  }
};

const buildObservation = (overrides: Partial<ObserveResult>): ObserveResult => ({
  ...baseObservation,
  ...overrides
});

const buildPrediction = (overrides: Partial<PredictedAction>): PredictedAction => ({
  action: "tapOn",
  target: {
    text: "Settings",
    elementId: "id/settings"
  },
  predictedScreen: "SettingsScreen",
  predictedElements: ["Settings", "id/settings"],
  confidence: 0.6,
  ...overrides
});

describe("PredictionAnalyzer", () => {
  it("records a correct prediction with full element match", async () => {
    const history = new FakePredictionHistoryStore();
    const navigation = new FakeNavigationGraph("SettingsScreen");
    const analyzer = new PredictionAnalyzer(history, navigation);

    const previous = buildObservation({
      predictions: {
        likelyActions: [buildPrediction({})],
        interactableElements: []
      }
    });
    const actual = buildObservation({
      viewHierarchy: {
        hierarchy: {
          node: {
            $: {
              bounds: "[0,0][1,1]",
              text: "Settings",
              "resource-id": "id/settings",
              "content-desc": "Settings"
            }
          }
        }
      }
    });

    await analyzer.recordOutcomeForAction(previous, actual, {
      appId: "com.test.app",
      fromScreen: "HomeScreen",
      toolName: "tapOn",
      toolArgs: { text: "Settings" }
    });

    expect(history.outcomes).toHaveLength(1);
    expect(history.outcomes[0].correct).toBe(true);
    expect(history.outcomes[0].partialMatch).toBe(false);
    expect(history.outcomes[0].matchScore).toBe(1);
  });

  it("records a wrong screen prediction", async () => {
    const history = new FakePredictionHistoryStore();
    const navigation = new FakeNavigationGraph("ProfileScreen");
    const analyzer = new PredictionAnalyzer(history, navigation);

    const previous = buildObservation({
      predictions: {
        likelyActions: [buildPrediction({ predictedScreen: "SettingsScreen" })],
        interactableElements: []
      }
    });

    await analyzer.recordOutcomeForAction(previous, baseObservation, {
      appId: "com.test.app",
      fromScreen: "HomeScreen",
      toolName: "tapOn",
      toolArgs: { text: "Settings" }
    });

    expect(history.outcomes).toHaveLength(1);
    expect(history.outcomes[0].correct).toBe(false);
    expect(history.outcomes[0].errorType).toBe("wrong_screen");
    expect(history.outcomes[0].matchScore).toBe(0);
  });

  it("records partial match when elements are missing", async () => {
    const history = new FakePredictionHistoryStore();
    const navigation = new FakeNavigationGraph("SettingsScreen");
    const analyzer = new PredictionAnalyzer(history, navigation);

    const previous = buildObservation({
      predictions: {
        likelyActions: [buildPrediction({ predictedElements: ["Settings", "Missing"] })],
        interactableElements: []
      }
    });

    await analyzer.recordOutcomeForAction(previous, baseObservation, {
      appId: "com.test.app",
      fromScreen: "HomeScreen",
      toolName: "tapOn",
      toolArgs: { text: "Settings" }
    });

    expect(history.outcomes).toHaveLength(1);
    expect(history.outcomes[0].correct).toBe(false);
    expect(history.outcomes[0].partialMatch).toBe(true);
    expect(history.outcomes[0].errorType).toBe("missing_elements");
    expect(history.outcomes[0].matchScore).toBe(0.5);
  });
});
