import type { ChecksumCalculator, Sha256Source } from "../../src/utils/ChecksumCalculator";

export class FakeChecksumCalculator implements ChecksumCalculator {
  public checksum: string = "fake-checksum";
  public checksumSource: Sha256Source = "node";
  public computedFiles: string[] = [];
  public shouldThrow: Error | null = null;

  public async computeFileSha256(filePath: string): Promise<{ checksum: string; source: Sha256Source }> {
    if (this.shouldThrow) {
      throw this.shouldThrow;
    }
    this.computedFiles.push(filePath);
    return { checksum: this.checksum, source: this.checksumSource };
  }
}
