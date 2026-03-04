import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { registerAccessibilityTools, accessibilitySchema } from "../../src/server/accessibilityTools";
import { ToolRegistry } from "../../src/server/toolRegistry";

describe("accessibilityTools", () => {
  beforeEach(() => {
    (ToolRegistry as any).tools.clear();
  });

  afterEach(() => {
    (ToolRegistry as any).tools.clear();
  });

  describe("registration", () => {
    test("registers the accessibility tool", () => {
      registerAccessibilityTools();
      const names = ToolRegistry.getToolDefinitions().map(t => t.name);
      expect(names).toContain("accessibility");
    });
  });

  describe("schema validation", () => {
    test("accepts talkback: true", () => {
      expect(() => accessibilitySchema.parse({ talkback: true })).not.toThrow();
    });

    test("accepts talkback: false", () => {
      expect(() => accessibilitySchema.parse({ talkback: false })).not.toThrow();
    });

    test("accepts empty object (all params optional)", () => {
      expect(() => accessibilitySchema.parse({})).not.toThrow();
    });

    test("rejects talkback as a string", () => {
      expect(() => accessibilitySchema.parse({ talkback: "yes" })).toThrow();
    });

    test("rejects talkback as a number", () => {
      expect(() => accessibilitySchema.parse({ talkback: 1 })).toThrow();
    });

    test("accepts voiceover: true", () => {
      expect(() => accessibilitySchema.parse({ voiceover: true })).not.toThrow();
    });

    test("accepts voiceover: false", () => {
      expect(() => accessibilitySchema.parse({ voiceover: false })).not.toThrow();
    });

    test("rejects voiceover as a string", () => {
      expect(() => accessibilitySchema.parse({ voiceover: "yes" })).toThrow();
    });

    test("rejects voiceover as a number", () => {
      expect(() => accessibilitySchema.parse({ voiceover: 1 })).toThrow();
    });
  });
});
