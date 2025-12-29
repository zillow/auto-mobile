import { expect } from "chai";
import { SharpImageUtils } from "../../src/utils/image-utils";
import { FakeImageUtils } from "../fakes/FakeImageUtils";

describe("ImageUtils", () => {
  let imageUtils: SharpImageUtils;

  beforeEach(() => {
    imageUtils = new SharpImageUtils();
  });

  describe("getOriginalBuffer", () => {
    it("should return a copy of the buffer", () => {
      const originalBuffer = Buffer.from("test data");
      const result = imageUtils.getOriginalBuffer(originalBuffer);

      expect(result).to.deep.equal(originalBuffer);
      expect(result).to.not.equal(originalBuffer); // Should be a copy
    });
  });

  describe("cache management", () => {
    it("should clear cache", () => {
      expect(() => {
        imageUtils.clearCache();
      }).to.not.throw();
    });

    it("should set cache size", () => {
      expect(() => {
        imageUtils.setCacheSize(100);
      }).to.not.throw();
    });
  });

  describe("batchProcess", () => {
    it("should process multiple buffers", async () => {
      const buffers = [Buffer.from("data1"), Buffer.from("data2")];
      const results = await imageUtils.batchProcess(buffers, async buffer => {
        return Buffer.from(buffer.toString() + "_processed");
      });

      expect(results).to.have.lengthOf(2);
      expect(results[0].toString()).to.equal("data1_processed");
      expect(results[1].toString()).to.equal("data2_processed");
    });
  });

  describe("interface implementation", () => {
    it("should implement ImageUtils interface", () => {
      expect(imageUtils).to.have.property("getOriginalBuffer");
      expect(imageUtils).to.have.property("resize");
      expect(imageUtils).to.have.property("crop");
      expect(imageUtils).to.have.property("rotate");
      expect(imageUtils).to.have.property("flip");
      expect(imageUtils).to.have.property("blur");
      expect(imageUtils).to.have.property("toJpeg");
      expect(imageUtils).to.have.property("toPng");
      expect(imageUtils).to.have.property("toWebp");
      expect(imageUtils).to.have.property("getMetadata");
      expect(imageUtils).to.have.property("getExifMetadata");
      expect(imageUtils).to.have.property("clearCache");
      expect(imageUtils).to.have.property("setCacheSize");
      expect(imageUtils).to.have.property("batchProcess");
    });
  });
});

describe("FakeImageUtils", () => {
  let fakeImageUtils: FakeImageUtils;

  beforeEach(() => {
    fakeImageUtils = new FakeImageUtils();
  });

  describe("configuration and defaults", () => {
    it("should return default metadata", async () => {
      const metadata = await fakeImageUtils.getMetadata(Buffer.from("test"));

      expect(metadata.width).to.equal(1080);
      expect(metadata.height).to.equal(2400);
      expect(metadata.format).to.equal("png");
    });

    it("should allow configuring metadata", async () => {
      const customMetadata = {
        width: 800,
        height: 600,
        format: "jpg",
        size: 500000
      };
      fakeImageUtils.setMetadataResult(customMetadata);
      const metadata = await fakeImageUtils.getMetadata(Buffer.from("test"));

      expect(metadata.width).to.equal(800);
      expect(metadata.height).to.equal(600);
      expect(metadata.format).to.equal("jpg");
    });

    it("should return PNG magic bytes by default for toPng", async () => {
      const result = await fakeImageUtils.toPng(Buffer.from("test"));

      expect(result.slice(0, 4).toString("hex")).to.equal("89504e47");
    });

    it("should allow configuring PNG result", async () => {
      const customBuffer = Buffer.from([1, 2, 3, 4]);
      fakeImageUtils.setPngResult(customBuffer);
      const result = await fakeImageUtils.toPng(Buffer.from("test"));

      expect(result).to.deep.equal(customBuffer);
    });
  });

  describe("call tracking", () => {
    it("should track method calls", async () => {
      await fakeImageUtils.resize(Buffer.from("test"), 100, 200);

      expect(fakeImageUtils.wasMethodCalled("resize")).to.be.true;
      expect(fakeImageUtils.getMethodCallCount("resize")).to.equal(1);
    });

    it("should track multiple calls", async () => {
      await fakeImageUtils.resize(Buffer.from("test"), 100);
      await fakeImageUtils.resize(Buffer.from("test"), 200);

      expect(fakeImageUtils.getMethodCallCount("resize")).to.equal(2);
    });

    it("should track call parameters", async () => {
      const buffer = Buffer.from("test data");
      await fakeImageUtils.resize(buffer, 100, 200, false);

      const calls = fakeImageUtils.getMethodCalls("resize");
      expect(calls[0].width).to.equal(100);
      expect(calls[0].height).to.equal(200);
      expect(calls[0].maintainAspectRatio).to.be.false;
    });

    it("should clear call history", async () => {
      await fakeImageUtils.resize(Buffer.from("test"), 100);
      fakeImageUtils.clearCallHistory();

      expect(fakeImageUtils.getMethodCallCount("resize")).to.equal(0);
    });

    it("should track different method calls separately", async () => {
      await fakeImageUtils.resize(Buffer.from("test"), 100);
      await fakeImageUtils.crop(Buffer.from("test"), 50, 50);

      expect(fakeImageUtils.getMethodCallCount("resize")).to.equal(1);
      expect(fakeImageUtils.getMethodCallCount("crop")).to.equal(1);
    });
  });

  describe("error injection", () => {
    it("should throw on getOriginalBuffer when configured", () => {
      fakeImageUtils.setShouldThrowOnGetOriginalBuffer(true);

      expect(() => {
        fakeImageUtils.getOriginalBuffer(Buffer.from("test"));
      }).to.throw("Simulated error in getOriginalBuffer");
    });

    it("should throw on resize when configured", async () => {
      fakeImageUtils.setShouldThrowOnResize(true);

      try {
        await fakeImageUtils.resize(Buffer.from("test"), 100);
        throw new Error("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.equal("Simulated error in resize");
      }
    });

    it("should throw on crop when configured", async () => {
      fakeImageUtils.setShouldThrowOnCrop(true);

      try {
        await fakeImageUtils.crop(Buffer.from("test"), 100, 100);
        throw new Error("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.equal("Simulated error in crop");
      }
    });

    it("should throw on rotate when configured", async () => {
      fakeImageUtils.setShouldThrowOnRotate(true);

      try {
        await fakeImageUtils.rotate(Buffer.from("test"), 90);
        throw new Error("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.equal("Simulated error in rotate");
      }
    });

    it("should throw on flip when configured", async () => {
      fakeImageUtils.setShouldThrowOnFlip(true);

      try {
        await fakeImageUtils.flip(Buffer.from("test"), "horizontal");
        throw new Error("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.equal("Simulated error in flip");
      }
    });

    it("should throw on blur when configured", async () => {
      fakeImageUtils.setShouldThrowOnBlur(true);

      try {
        await fakeImageUtils.blur(Buffer.from("test"), 5);
        throw new Error("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.equal("Simulated error in blur");
      }
    });

    it("should throw on toJpeg when configured", async () => {
      fakeImageUtils.setShouldThrowOnToJpeg(true);

      try {
        await fakeImageUtils.toJpeg(Buffer.from("test"));
        throw new Error("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.equal("Simulated error in toJpeg");
      }
    });

    it("should throw on toPng when configured", async () => {
      fakeImageUtils.setShouldThrowOnToPng(true);

      try {
        await fakeImageUtils.toPng(Buffer.from("test"));
        throw new Error("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.equal("Simulated error in toPng");
      }
    });

    it("should throw on toWebp when configured", async () => {
      fakeImageUtils.setShouldThrowOnToWebp(true);

      try {
        await fakeImageUtils.toWebp(Buffer.from("test"));
        throw new Error("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.equal("Simulated error in toWebp");
      }
    });

    it("should throw on getMetadata when configured", async () => {
      fakeImageUtils.setShouldThrowOnGetMetadata(true);

      try {
        await fakeImageUtils.getMetadata(Buffer.from("test"));
        throw new Error("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.equal("Simulated error in getMetadata");
      }
    });

    it("should throw on getExifMetadata when configured", async () => {
      fakeImageUtils.setShouldThrowOnGetExifMetadata(true);

      try {
        await fakeImageUtils.getExifMetadata(Buffer.from("test"));
        throw new Error("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.equal("Simulated error in getExifMetadata");
      }
    });

    it("should throw on batchProcess when configured", async () => {
      fakeImageUtils.setShouldThrowOnBatchProcess(true);

      try {
        await fakeImageUtils.batchProcess([Buffer.from("test")], async b => b);
        throw new Error("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.equal("Simulated error in batchProcess");
      }
    });
  });

  describe("complex scenarios", () => {
    it("should track all method calls in a sequence", async () => {
      const buffer = Buffer.from("test");

      await fakeImageUtils.resize(buffer, 100);
      await fakeImageUtils.crop(buffer, 50, 50);
      await fakeImageUtils.rotate(buffer, 90);
      await fakeImageUtils.toPng(buffer);

      expect(fakeImageUtils.getMethodCallCount("resize")).to.equal(1);
      expect(fakeImageUtils.getMethodCallCount("crop")).to.equal(1);
      expect(fakeImageUtils.getMethodCallCount("rotate")).to.equal(1);
      expect(fakeImageUtils.getMethodCallCount("toPng")).to.equal(1);
    });

    it("should handle batch process with custom results", async () => {
      const buffer1 = Buffer.from("result1");
      const buffer2 = Buffer.from("result2");
      fakeImageUtils.setBatchProcessResult([buffer1, buffer2]);

      const results = await fakeImageUtils.batchProcess(
        [Buffer.from("input1"), Buffer.from("input2")],
        async b => b
      );

      expect(results).to.deep.equal([buffer1, buffer2]);
      expect(fakeImageUtils.getMethodCallCount("batchProcess")).to.equal(1);
    });

    it("should handle batch process with default transform", async () => {
      const results = await fakeImageUtils.batchProcess(
        [Buffer.from("test1"), Buffer.from("test2")],
        async b => Buffer.from(b.toString() + "_processed")
      );

      expect(results).to.have.lengthOf(2);
      expect(results[0].toString()).to.equal("test1_processed");
      expect(results[1].toString()).to.equal("test2_processed");
    });
  });

  describe("all methods existence", () => {
    it("should have all ImageUtils methods", () => {
      expect(fakeImageUtils).to.have.property("getOriginalBuffer");
      expect(fakeImageUtils).to.have.property("resize");
      expect(fakeImageUtils).to.have.property("crop");
      expect(fakeImageUtils).to.have.property("rotate");
      expect(fakeImageUtils).to.have.property("flip");
      expect(fakeImageUtils).to.have.property("blur");
      expect(fakeImageUtils).to.have.property("toJpeg");
      expect(fakeImageUtils).to.have.property("toPng");
      expect(fakeImageUtils).to.have.property("toWebp");
      expect(fakeImageUtils).to.have.property("getMetadata");
      expect(fakeImageUtils).to.have.property("getExifMetadata");
      expect(fakeImageUtils).to.have.property("clearCache");
      expect(fakeImageUtils).to.have.property("setCacheSize");
      expect(fakeImageUtils).to.have.property("batchProcess");
    });
  });
});
