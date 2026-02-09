import * as fs from "fs/promises";
import * as path from "path";
import type { FileDownloader } from "../../src/utils/FileDownloader";

export class FakeFileDownloader implements FileDownloader {
  public downloadedUrls: string[] = [];
  public downloadedDestinations: string[] = [];
  public payload: Buffer = Buffer.from("a".repeat(12000));
  public shouldThrow: Error | null = null;

  public async download(url: string, destination: string): Promise<void> {
    if (this.shouldThrow) {
      throw this.shouldThrow;
    }
    this.downloadedUrls.push(url);
    this.downloadedDestinations.push(destination);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, this.payload);
  }
}
