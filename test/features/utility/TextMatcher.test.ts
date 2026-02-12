import { describe, expect, test } from "bun:test";
import { DefaultTextMatcher } from "../../../src/features/utility/TextMatcher";

describe("DefaultTextMatcher", () => {
  const matcher = new DefaultTextMatcher();

  describe("partialTextMatch", () => {
    test("returns false for empty first string", () => {
      expect(matcher.partialTextMatch("", "hello")).toBe(false);
    });

    test("returns false for empty second string", () => {
      expect(matcher.partialTextMatch("hello", "")).toBe(false);
    });

    test("returns false for both empty strings", () => {
      expect(matcher.partialTextMatch("", "")).toBe(false);
    });

    test("matches when first string contains second", () => {
      expect(matcher.partialTextMatch("hello world", "world")).toBe(true);
    });

    test("matches when second string contains first", () => {
      expect(matcher.partialTextMatch("world", "hello world")).toBe(true);
    });

    test("matches identical strings", () => {
      expect(matcher.partialTextMatch("hello", "hello")).toBe(true);
    });

    test("case insensitive by default", () => {
      expect(matcher.partialTextMatch("Hello", "hello")).toBe(true);
      expect(matcher.partialTextMatch("WORLD", "world")).toBe(true);
    });

    test("case sensitive when specified", () => {
      expect(matcher.partialTextMatch("Hello", "hello", true)).toBe(false);
      expect(matcher.partialTextMatch("Hello", "Hello", true)).toBe(true);
    });

    test("returns false for non-matching strings", () => {
      expect(matcher.partialTextMatch("abc", "xyz")).toBe(false);
    });
  });

  describe("createTextMatcher", () => {
    test("returns function that always returns false for empty search text", () => {
      const fn = matcher.createTextMatcher("");
      expect(fn("anything")).toBe(false);
      expect(fn("")).toBe(false);
      expect(fn(undefined)).toBe(false);
    });

    test("returned function returns false for undefined input", () => {
      const fn = matcher.createTextMatcher("search");
      expect(fn(undefined)).toBe(false);
    });

    test("returned function returns false for empty input", () => {
      const fn = matcher.createTextMatcher("search");
      expect(fn("")).toBe(false);
    });

    test("partial match (default) finds substring", () => {
      const fn = matcher.createTextMatcher("world");
      expect(fn("hello world")).toBe(true);
      expect(fn("worldly")).toBe(true);
      expect(fn("xyz")).toBe(false);
    });

    test("exact match rejects substring", () => {
      const fn = matcher.createTextMatcher("hello", false);
      expect(fn("hello")).toBe(true);
      expect(fn("hello world")).toBe(false);
    });

    test("case insensitive by default", () => {
      const fn = matcher.createTextMatcher("Hello");
      expect(fn("HELLO WORLD")).toBe(true);
      expect(fn("hello")).toBe(true);
    });

    test("case sensitive when specified", () => {
      const fn = matcher.createTextMatcher("Hello", true, true);
      expect(fn("Hello World")).toBe(true);
      expect(fn("hello world")).toBe(false);
    });

    test("exact match with case sensitivity", () => {
      const fn = matcher.createTextMatcher("Hello", false, true);
      expect(fn("Hello")).toBe(true);
      expect(fn("hello")).toBe(false);
      expect(fn("Hello World")).toBe(false);
    });
  });
});
