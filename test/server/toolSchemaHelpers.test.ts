import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { addDeviceTargetingToSchema } from "../../src/server/toolSchemaHelpers";

describe("addDeviceTargetingToSchema", () => {
  const baseSchema = z.object({
    bundleId: z.string(),
  }).strict();

  const extended = addDeviceTargetingToSchema(baseSchema);

  test("accepts base fields without device targeting", () => {
    const result = extended.safeParse({ bundleId: "com.example.app" });
    expect(result.success).toBe(true);
  });

  test("accepts deviceId injected by plan executor", () => {
    const result = extended.safeParse({
      bundleId: "com.example.app",
      deviceId: "emulator-5554",
    });
    expect(result.success).toBe(true);
  });

  test("accepts device label for multi-device plans", () => {
    const result = extended.safeParse({
      bundleId: "com.example.app",
      device: "A",
    });
    expect(result.success).toBe(true);
  });

  test("accepts sessionUuid for session-based targeting", () => {
    const result = extended.safeParse({
      bundleId: "com.example.app",
      sessionUuid: "abc-123",
    });
    expect(result.success).toBe(true);
  });

  test("accepts all device targeting fields together", () => {
    const result = extended.safeParse({
      bundleId: "com.example.app",
      deviceId: "emulator-5554",
      device: "A",
      sessionUuid: "abc-123",
      keepScreenAwake: true,
    });
    expect(result.success).toBe(true);
  });

  test("rejects unknown fields not in base or device targeting", () => {
    const result = extended.safeParse({
      bundleId: "com.example.app",
      unknownField: "surprise",
    });
    expect(result.success).toBe(false);
  });
});
