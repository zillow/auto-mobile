import { describe, expect, test } from "bun:test";
import { PlanNormalizer } from "../../../src/utils/plan/PlanNormalizer";

describe("PlanNormalizer", () => {
  test("merges inline fields into params", () => {
    const normalized = PlanNormalizer.normalizeStep(
      { tool: "tapOn", text: "Hello", device: "A" },
      0
    );

    expect(normalized.tool).toBe("tapOn");
    expect(normalized.params).toEqual({ text: "Hello", device: "A" });
  });

  test("prefers explicit params over inline fields", () => {
    const normalized = PlanNormalizer.normalizeStep(
      {
        tool: "tapOn",
        text: "inline",
        params: { text: "params", device: "B" },
        label: "Tap button",
      },
      0
    );

    expect(normalized.params).toEqual({ text: "params", device: "B" });
    expect(normalized.label).toBe("Tap button");
  });
});
