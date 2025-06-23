import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha";
import { ScreenshotUtils } from "../../src/utils/screenshot-utils";
import { DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT } from "../../src/utils/constants";
import fs from "fs-extra";
import path from "path";
import sharp from "sharp";

describe("ScreenshotUtils", function() {
  const testDir = "/tmp/test-screenshots";

  beforeEach(async function() {
    // Create test directory
    await fs.ensureDir(testDir);
  });

  afterEach(async function() {
    // Clean up test directory
    await fs.remove(testDir);
  });

  describe("Image Format Detection", function() {
    it("should detect PNG buffers correctly", function() {
      const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const notPng = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]); // JPEG header

      expect(ScreenshotUtils.isPngBuffer(pngHeader)).to.be.true;
      expect(ScreenshotUtils.isPngBuffer(notPng)).to.be.false;
      expect(ScreenshotUtils.isPngBuffer(Buffer.alloc(4))).to.be.false;
    });

    it("should convert non-PNG images to PNG", async function() {
      // Create a simple test image
      const testImage = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 255, g: 0, b: 0 }
        }
      }).jpeg().toBuffer();

      const pngBuffer = await ScreenshotUtils.convertToPng(testImage);
      expect(ScreenshotUtils.isPngBuffer(pngBuffer)).to.be.true;
    });
  });

  describe("Image Dimensions", function() {
    it("should get image dimensions correctly", async function() {
      const testImage = await sharp({
        create: {
          width: 200,
          height: 150,
          channels: 3,
          background: { r: 0, g: 255, b: 0 }
        }
      }).png().toBuffer();

      const dimensions = await ScreenshotUtils.getImageDimensions(testImage);
      expect(dimensions.width).to.equal(200);
      expect(dimensions.height).to.equal(150);
    });

    it("should resize images correctly", async function() {
      const testImage = await sharp({
        create: {
          width: 400,
          height: 300,
          channels: 3,
          background: { r: 0, g: 0, b: 255 }
        }
      }).png().toBuffer();

      const resizedBuffer = await ScreenshotUtils.resizeImageIfNeeded(testImage, 200, 150);
      const dimensions = await ScreenshotUtils.getImageDimensions(resizedBuffer);

      expect(dimensions.width).to.equal(200);
      expect(dimensions.height).to.equal(150);
    });

    it("should not resize images that already match target dimensions", async function() {
      const testImage = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 128, g: 128, b: 128 }
        }
      }).png().toBuffer();

      const result = await ScreenshotUtils.resizeImageIfNeeded(testImage, 100, 100);
      expect(result).to.equal(testImage);
    });
  });

  describe("Image Comparison", function() {
    let identicalImage1: Buffer;
    let identicalImage2: Buffer;
    let differentImage: Buffer;

    beforeEach(async function() {
      // Create identical images
      identicalImage1 = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 255, g: 255, b: 255 }
        }
      }).png().toBuffer();

      identicalImage2 = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 255, g: 255, b: 255 }
        }
      }).png().toBuffer();

      // Create different image
      differentImage = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 0, g: 0, b: 0 }
        }
      }).png().toBuffer();
    });

    it("should detect identical images with 100% similarity", async function() {
      const result = await ScreenshotUtils.compareImages(identicalImage1, identicalImage2);

      expect(result.similarity).to.equal(100);
      expect(result.pixelDifference).to.equal(0);
      expect(result.totalPixels).to.equal(10000); // 100x100
    });

    it("should detect completely different images with low similarity", async function() {
      const result = await ScreenshotUtils.compareImages(identicalImage1, differentImage);

      expect(result.similarity).to.be.lessThan(50);
      expect(result.pixelDifference).to.be.greaterThan(0);
      expect(result.totalPixels).to.equal(10000);
    });

    it("should handle comparison of different sized images", async function() {
      const largeImage = await sharp({
        create: {
          width: 200,
          height: 200,
          channels: 3,
          background: { r: 255, g: 255, b: 255 }
        }
      }).png().toBuffer();

      const result = await ScreenshotUtils.compareImages(identicalImage1, largeImage);

      expect(result.similarity).to.equal(100);
      expect(result.totalPixels).to.equal(10000); // Should use smaller dimensions
    });

    it("should handle invalid images gracefully", async function() {
      const invalidBuffer = Buffer.from("not an image");

      const result = await ScreenshotUtils.compareImages(identicalImage1, invalidBuffer);

      expect(result.similarity).to.equal(0);
      expect(result.pixelDifference).to.equal(-1);
      expect(result.totalPixels).to.equal(0);
    });
  });

  describe("File Operations", function() {
    it("should get screenshot files from directory", async function() {
      // Create test files
      await fs.writeFile(path.join(testDir, "screenshot1.png"), Buffer.alloc(10));
      await fs.writeFile(path.join(testDir, "screenshot2.webp"), Buffer.alloc(10));
      await fs.writeFile(path.join(testDir, "not-screenshot.txt"), Buffer.alloc(10));

      const files = await ScreenshotUtils.getScreenshotFiles(testDir);

      expect(files).to.have.length(2);
      expect(files.some(f => f.endsWith("screenshot1.png"))).to.be.true;
      expect(files.some(f => f.endsWith("screenshot2.webp"))).to.be.true;
      expect(files.some(f => f.endsWith("not-screenshot.txt"))).to.be.false;
    });

    it("should return empty array for non-existent directory", async function() {
      const files = await ScreenshotUtils.getScreenshotFiles("/non/existent/path");
      expect(files).to.have.length(0);
    });

    it("should extract hash from filename correctly", function() {
      const timestamp1 = ScreenshotUtils.extractHashFromFilename("/path/to/screenshot_1234567890.png");
      const timestamp2 = ScreenshotUtils.extractHashFromFilename("hierarchy_9876543210.json");
      const legacyHash = ScreenshotUtils.extractHashFromFilename("old_format_hash_789.webp");

      expect(timestamp1).to.equal("1234567890");
      expect(timestamp2).to.equal("9876543210");
      expect(legacyHash).to.equal("789");

      // Test invalid filename
      expect(() => {
        ScreenshotUtils.extractHashFromFilename("notimestamp.png");
      }).to.throw("Unable to extract timestamp from filename");
    });

    it("should generate image hash correctly", function() {
      const buffer = Buffer.from("test image data");
      const hash = ScreenshotUtils.generateImageHash(buffer);

      expect(hash).to.be.a("string");
      expect(hash).to.have.length(32); // MD5 hash length
      expect(hash).to.match(/^[a-f0-9]+$/); // Hex string
    });
  });

  describe("Fuzzy Matching", function() {
    it("should find similar screenshots within tolerance", async function() {
      // Create test images
      const baseImage = await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 3,
          background: { r: 100, g: 150, b: 200 }
        }
      }).png().toBuffer();

      const timestamp = Date.now();
      const testFilename = `screenshot_${timestamp}.png`;
      await fs.writeFile(path.join(testDir, testFilename), baseImage);

      const result = await ScreenshotUtils.findSimilarScreenshots(
        baseImage,
        testDir,
        DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT,
        5
      );

      expect(result.matchFound).to.be.true;
      expect(result.similarity).to.equal(100);
      expect(result.filePath).to.include(testFilename);
    });

    it("should not find matches when no similar screenshots exist", async function() {
      const targetImage = await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 3,
          background: { r: 255, g: 0, b: 0 }
        }
      }).png().toBuffer();

      const differentImage = await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 3,
          background: { r: 0, g: 255, b: 0 }
        }
      }).png().toBuffer();

      // Save a very different image
      const timestamp = Date.now();
      await fs.writeFile(path.join(testDir, `screenshot_${timestamp}.png`), differentImage);

      const result = await ScreenshotUtils.findSimilarScreenshots(
        targetImage,
        testDir,
        DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT,
        5
      );

      expect(result.matchFound).to.be.false;
      expect(result.similarity).to.be.lessThan(100 - DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT);
      expect(result.filePath).to.equal("");
    });

    it("should handle empty cache directory", async function() {
      const testImage = await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 3,
          background: { r: 128, g: 128, b: 128 }
        }
      }).png().toBuffer();

      const result = await ScreenshotUtils.findSimilarScreenshots(
        testImage,
        testDir,
        DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT,
        5
      );

      expect(result.matchFound).to.be.false;
      expect(result.similarity).to.equal(0);
      expect(result.filePath).to.equal("");
    });

    it("should limit the number of comparisons", async function() {
      const testImage = await sharp({
        create: {
          width: 30,
          height: 30,
          channels: 3,
          background: { r: 64, g: 64, b: 64 }
        }
      }).png().toBuffer();

      // Create 10 different screenshot files
      for (let i = 0; i < 10; i++) {
        const timestamp = Date.now() + i;
        const filename = `screenshot_${timestamp}.png`;
        await fs.writeFile(path.join(testDir, filename), testImage);
        // Add small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 1));
      }

      const result = await ScreenshotUtils.findSimilarScreenshots(
        testImage,
        testDir,
        DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT,
        3 // Limit to 3 comparisons
      );

      // Should find a match (since we're comparing identical images)
      expect(result.matchFound).to.be.true;
      expect(result.similarity).to.equal(100);
    });
  });

  describe("Error Handling", function() {
    it("should handle image conversion errors gracefully", async function() {
      const invalidBuffer = Buffer.from("definitely not an image");

      try {
        await ScreenshotUtils.convertToPng(invalidBuffer);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.an("error");
        expect((error as Error).message).to.include("Failed to convert image to PNG");
      }
    });

    it("should handle dimension errors gracefully", async function() {
      const invalidBuffer = Buffer.from("not an image");

      try {
        await ScreenshotUtils.getImageDimensions(invalidBuffer);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.an("error");
        expect((error as Error).message).to.include("Failed to get image dimensions");
      }
    });

    it("should handle resize errors gracefully", async function() {
      const invalidBuffer = Buffer.from("not an image");

      try {
        await ScreenshotUtils.resizeImageIfNeeded(invalidBuffer, 100, 100);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.an("error");
        expect((error as Error).message).to.include("Failed to get image dimensions");
      }
    });
  });
});
