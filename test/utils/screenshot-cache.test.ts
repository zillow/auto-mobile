import { expect, describe, test, beforeEach, afterEach } from "bun:test";
import fs from "fs/promises";
import os from "os";
import path from "path";
import sharp from "sharp";
import { ScreenshotCache } from "../../src/utils/screenshot/ScreenshotCache";
import { FakeTimer } from "../fakes/FakeTimer";

const CACHE_TTL_MS = 10 * 60 * 1000;

describe("ScreenshotCache", function() {
  let tempDir: string;
  let fakeTimer: FakeTimer;

  beforeEach(async function() {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "screenshot-cache-"));
    fakeTimer = new FakeTimer();
    ScreenshotCache.clearCache();
  });

  afterEach(async function() {
    ScreenshotCache.clearCache();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("returns cached buffer within TTL", async function() {
    const filePath = path.join(tempDir, "screenshot.png");
    const buffer1 = await createTestImage({ r: 255, g: 0, b: 0 });
    await fs.writeFile(filePath, buffer1);

    const first = await ScreenshotCache.getCachedScreenshot(filePath, fakeTimer);

    const buffer2 = await createTestImage({ r: 0, g: 0, b: 255 });
    await fs.writeFile(filePath, buffer2);

    const second = await ScreenshotCache.getCachedScreenshot(filePath, fakeTimer);

    expect(first.buffer.equals(buffer1)).toBe(true);
    expect(second.buffer.equals(buffer1)).toBe(true);
    expect(second.buffer.equals(buffer2)).toBe(false);
  });

  test("reloads cache after TTL expires", async function() {
    const filePath = path.join(tempDir, "screenshot.png");
    const buffer1 = await createTestImage({ r: 255, g: 255, b: 255 });
    await fs.writeFile(filePath, buffer1);

    await ScreenshotCache.getCachedScreenshot(filePath, fakeTimer);

    const buffer2 = await createTestImage({ r: 0, g: 255, b: 0 });
    await fs.writeFile(filePath, buffer2);

    fakeTimer.advanceTime(CACHE_TTL_MS + 1);

    const refreshed = await ScreenshotCache.getCachedScreenshot(filePath, fakeTimer);

    expect(refreshed.buffer.equals(buffer2)).toBe(true);
  });
});

async function createTestImage(color: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({
    create: {
      width: 10,
      height: 10,
      channels: 3,
      background: color
    }
  }).png().toBuffer();
}
