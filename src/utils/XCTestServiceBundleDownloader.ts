import * as fs from "fs/promises";
import AdmZip from "adm-zip";
import { type FileDownloader, DefaultFileDownloader } from "./FileDownloader";
import { type ChecksumCalculator, type Sha256Source, DefaultChecksumCalculator } from "./ChecksumCalculator";

export type { Sha256Source };

export interface XCTestServiceBundleDownloader {
  download(url: string, destination: string): Promise<void>;
  computeFileSha256(filePath: string): Promise<{ checksum: string; source: Sha256Source }>;
  extractBundle(bundlePath: string, destination: string): Promise<void>;
}

export class DefaultXCTestServiceBundleDownloader implements XCTestServiceBundleDownloader {
  private readonly fileDownloader: FileDownloader;
  private readonly checksumCalculator: ChecksumCalculator;

  constructor(
    fileDownloader: FileDownloader = new DefaultFileDownloader(),
    checksumCalculator: ChecksumCalculator = new DefaultChecksumCalculator()
  ) {
    this.fileDownloader = fileDownloader;
    this.checksumCalculator = checksumCalculator;
  }

  public async download(url: string, destination: string): Promise<void> {
    return this.fileDownloader.download(url, destination);
  }

  public async computeFileSha256(filePath: string): Promise<{ checksum: string; source: Sha256Source }> {
    return this.checksumCalculator.computeFileSha256(filePath);
  }

  public async extractBundle(bundlePath: string, destination: string): Promise<void> {
    await fs.rm(destination, { recursive: true, force: true });
    await fs.mkdir(destination, { recursive: true });

    const zip = new AdmZip(bundlePath);
    zip.extractAllTo(destination, true);
  }
}
