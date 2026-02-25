import * as fs from "fs/promises";
import * as path from "path";
import type { Sha256Source, CtrlProxyIosBundleDownloader } from "../../src/utils/IOSCtrlProxyBundleDownloader";

export class FakeIOSCtrlProxyBundleDownloader implements CtrlProxyIosBundleDownloader {
  public downloadedUrls: string[] = [];
  public extractedPaths: string[] = [];
  public checksum: string = "fake-checksum";
  public checksumSource: Sha256Source = "node";
  public extractedSubdir: string = "";

  public async download(url: string, destination: string): Promise<void> {
    this.downloadedUrls.push(url);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const payload = "a".repeat(12000);
    await fs.writeFile(destination, payload);
  }

  public async computeFileSha256(_filePath: string): Promise<{ checksum: string; source: Sha256Source }> {
    return { checksum: this.checksum, source: this.checksumSource };
  }

  public async extractBundle(_bundlePath: string, destination: string): Promise<void> {
    const extractionRoot = this.extractedSubdir
      ? path.join(destination, this.extractedSubdir)
      : destination;
    this.extractedPaths.push(extractionRoot);
    const productsDir = path.join(extractionRoot, "Build", "Products", "Debug-iphonesimulator");
    await fs.mkdir(productsDir, { recursive: true });
    const xctestrunFile = path.join(extractionRoot, "Build", "Products", "CtrlProxyApp_iphonesimulator.xctestrun");
    await fs.writeFile(xctestrunFile, "fake xctestrun");
    await fs.mkdir(path.join(productsDir, "CtrlProxyApp.app"), { recursive: true });
    await fs.mkdir(path.join(productsDir, "CtrlProxyUITests-Runner.app"), { recursive: true });
    await fs.mkdir(path.join(productsDir, "CtrlProxyTests.xctest"), { recursive: true });
  }
}
