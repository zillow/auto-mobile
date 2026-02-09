import { afterEach, describe, expect, test } from "bun:test";
import { DefaultChecksumCalculator } from "../../src/utils/ChecksumCalculator";
import { FakeChecksumCalculator } from "../fakes/FakeChecksumCalculator";
import * as fs from "fs/promises";
import * as path from "path";
import crypto from "crypto";
import os from "os";

describe("DefaultChecksumCalculator", function() {
  let tempDir: string;

  afterEach(async function() {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("should compute SHA256 of a file using node fallback", async function() {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "checksum-test-"));
    const filePath = path.join(tempDir, "test-file.bin");
    const content = Buffer.from("hello world checksum test");
    await fs.writeFile(filePath, content);

    const expectedChecksum = crypto.createHash("sha256").update(content).digest("hex");
    const calculator = new DefaultChecksumCalculator();
    const result = await calculator.computeFileSha256(filePath);

    expect(result.checksum).toBe(expectedChecksum);
    expect(["sha256sum", "shasum", "node"]).toContain(result.source);
  });

  test("should produce consistent checksums across calls", async function() {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "checksum-test-"));
    const filePath = path.join(tempDir, "test-file.bin");
    const content = crypto.randomBytes(1024);
    await fs.writeFile(filePath, content);

    const calculator = new DefaultChecksumCalculator();
    const result1 = await calculator.computeFileSha256(filePath);
    const result2 = await calculator.computeFileSha256(filePath);

    expect(result1.checksum).toBe(result2.checksum);
  });
});

describe("FakeChecksumCalculator", function() {
  test("should return configured checksum", async function() {
    const calculator = new FakeChecksumCalculator();
    calculator.checksum = "abc123";
    calculator.checksumSource = "sha256sum";

    const result = await calculator.computeFileSha256("/tmp/file.bin");

    expect(result.checksum).toBe("abc123");
    expect(result.source).toBe("sha256sum");
    expect(calculator.computedFiles).toEqual(["/tmp/file.bin"]);
  });

  test("should throw configured error", async function() {
    const calculator = new FakeChecksumCalculator();
    calculator.shouldThrow = new Error("checksum failed");

    await expect(calculator.computeFileSha256("/tmp/file.bin"))
      .rejects.toThrow("checksum failed");
  });
});
