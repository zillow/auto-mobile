import { describe, expect, test } from "bun:test";
import { FeatureFlagService } from "../../../src/features/featureFlags/FeatureFlagService";
import type { FeatureFlagDefinition } from "../../../src/features/featureFlags/FeatureFlagDefinitions";
import { FakeFeatureFlagRepository } from "../../fakes/FakeFeatureFlagRepository";
import { FakeFeatureFlagApplier } from "../../fakes/FakeFeatureFlagApplier";

const TEST_DEFINITIONS: FeatureFlagDefinition[] = [
  {
    key: "debug",
    label: "Debug mode",
    description: "debug",
    defaultValue: false,
  },
  {
    key: "ui-perf-debug",
    label: "UI perf debug",
    description: "ui debug",
    defaultValue: true,
  },
];

describe("FeatureFlagService", () => {
  test("initializes defaults and applies them", async () => {
    const repository = new FakeFeatureFlagRepository();
    const applier = new FakeFeatureFlagApplier();
    const service = new FeatureFlagService(repository, applier, TEST_DEFINITIONS);

    const flags = await service.listFlags();

    expect(flags).toHaveLength(2);
    expect(flags.find(flag => flag.key === "debug")?.enabled).toBe(false);
    expect(flags.find(flag => flag.key === "ui-perf-debug")?.enabled).toBe(true);
    expect(applier.applied).toContainEqual({ key: "debug", enabled: false, config: null });
    expect(applier.applied).toContainEqual({ key: "ui-perf-debug", enabled: true, config: null });
  });

  test("updates flags and reapplies", async () => {
    const repository = new FakeFeatureFlagRepository();
    const applier = new FakeFeatureFlagApplier();
    const service = new FeatureFlagService(repository, applier, TEST_DEFINITIONS);

    const updated = await service.setFlag("debug", true);

    expect(updated.enabled).toBe(true);
    expect(applier.applied[applier.applied.length - 1]).toEqual({
      key: "debug",
      enabled: true,
      config: null,
    });
  });
});
