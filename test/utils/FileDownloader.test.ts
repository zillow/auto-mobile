import { describe, expect, test } from "bun:test";
import { FakeFileDownloader } from "../fakes/FakeFileDownloader";

describe("FakeFileDownloader", function() {
  test("should track downloaded urls and destinations", async function() {
    const downloader = new FakeFileDownloader();
    const url = "https://example.com/file.zip";
    const destination = "/tmp/test-file-downloader-output/file.zip";

    await downloader.download(url, destination);

    expect(downloader.downloadedUrls).toEqual([url]);
    expect(downloader.downloadedDestinations).toEqual([destination]);
  });

  test("should throw configured error", async function() {
    const downloader = new FakeFileDownloader();
    downloader.shouldThrow = new Error("download failed");

    await expect(downloader.download("https://example.com/file.zip", "/tmp/test-dl/file.zip"))
      .rejects.toThrow("download failed");
  });
});
