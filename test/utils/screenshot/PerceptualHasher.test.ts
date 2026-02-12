import { describe, expect, test } from "bun:test";
import { PerceptualHasher } from "../../../src/utils/screenshot/PerceptualHasher";

describe("PerceptualHasher", () => {
  describe("calculateHammingDistance", () => {
    test("returns 0 for identical hashes", () => {
      expect(PerceptualHasher.calculateHammingDistance("1010", "1010")).toBe(0);
    });

    test("returns correct distance for different hashes", () => {
      expect(PerceptualHasher.calculateHammingDistance("1010", "1001")).toBe(2);
    });

    test("returns max length for completely different hashes", () => {
      expect(PerceptualHasher.calculateHammingDistance("1111", "0000")).toBe(4);
    });

    test("returns max length for different length hashes", () => {
      expect(PerceptualHasher.calculateHammingDistance("111", "00000")).toBe(5);
    });

    test("handles empty strings", () => {
      expect(PerceptualHasher.calculateHammingDistance("", "")).toBe(0);
    });

    test("returns max when one hash is empty", () => {
      expect(PerceptualHasher.calculateHammingDistance("", "1010")).toBe(4);
    });

    test("single bit difference", () => {
      expect(PerceptualHasher.calculateHammingDistance("10000000", "10000001")).toBe(1);
    });
  });

  describe("getPerceptualSimilarity", () => {
    test("returns 100 for identical hashes", () => {
      expect(PerceptualHasher.getPerceptualSimilarity("1010", "1010")).toBe(100);
    });

    test("returns 0 for completely different hashes", () => {
      expect(PerceptualHasher.getPerceptualSimilarity("1111", "0000")).toBe(0);
    });

    test("returns 50 for half-different hashes", () => {
      expect(PerceptualHasher.getPerceptualSimilarity("1100", "1001")).toBe(50);
    });

    test("returns 75 for one-quarter different hashes", () => {
      expect(PerceptualHasher.getPerceptualSimilarity("1111", "1110")).toBe(75);
    });

    test("handles different-length hashes", () => {
      // max distance = 5 (length of longer), distance = 5
      const similarity = PerceptualHasher.getPerceptualSimilarity("111", "00000");
      expect(similarity).toBe(0);
    });
  });

  describe("generatePerceptualHash", () => {
    test("returns empty string for invalid buffer", async () => {
      const result = await PerceptualHasher.generatePerceptualHash(Buffer.from("not an image"));
      expect(result).toBe("");
    });

    test("returns 64-char binary hash for valid image", async () => {
      // Create a minimal valid PNG-like buffer via sharp
      const sharp = (await import("sharp")).default;
      const buffer = await sharp({
        create: { width: 16, height: 16, channels: 3, background: { r: 128, g: 128, b: 128 } }
      }).png().toBuffer();

      const hash = await PerceptualHasher.generatePerceptualHash(buffer);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[01]+$/);
    });

    test("similar images produce similar hashes", async () => {
      const sharp = (await import("sharp")).default;
      const buffer1 = await sharp({
        create: { width: 16, height: 16, channels: 3, background: { r: 100, g: 100, b: 100 } }
      }).png().toBuffer();

      const buffer2 = await sharp({
        create: { width: 16, height: 16, channels: 3, background: { r: 105, g: 105, b: 105 } }
      }).png().toBuffer();

      const hash1 = await PerceptualHasher.generatePerceptualHash(buffer1);
      const hash2 = await PerceptualHasher.generatePerceptualHash(buffer2);
      const similarity = PerceptualHasher.getPerceptualSimilarity(hash1, hash2);
      expect(similarity).toBeGreaterThan(80);
    });
  });
});
