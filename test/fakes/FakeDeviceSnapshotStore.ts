import * as os from "os";
import * as path from "path";

export class FakeDeviceSnapshotStore {
  private basePath: string;
  private sizes = new Map<string, number>();
  private existing = new Set<string>();
  private deleted = new Set<string>();
  private generatedNames: string[] = [];
  private nameCounter = 0;

  constructor(basePath?: string) {
    this.basePath = basePath ?? path.join(os.tmpdir(), "auto-mobile-fake-snapshots");
  }

  getBasePath(): string {
    return this.basePath;
  }

  getSnapshotPath(snapshotName: string): string {
    return path.join(this.basePath, snapshotName);
  }

  setSnapshotSize(snapshotName: string, sizeBytes: number): void {
    this.sizes.set(snapshotName, sizeBytes);
  }

  setSnapshotExists(snapshotName: string, exists: boolean): void {
    if (exists) {
      this.existing.add(snapshotName);
    } else {
      this.existing.delete(snapshotName);
    }
  }

  queueGeneratedName(snapshotName: string): void {
    this.generatedNames.push(snapshotName);
  }

  getDeletedSnapshots(): string[] {
    return Array.from(this.deleted);
  }

  generateSnapshotName(_deviceName?: string): string {
    if (this.generatedNames.length > 0) {
      return this.generatedNames.shift() as string;
    }
    this.nameCounter += 1;
    return `snapshot-${this.nameCounter}`;
  }

  async snapshotDirectoryExists(snapshotName: string): Promise<boolean> {
    return this.existing.has(snapshotName);
  }

  async getSnapshotSizeBytes(snapshotName: string): Promise<number> {
    return this.sizes.get(snapshotName) ?? 0;
  }

  async deleteSnapshotData(snapshotName: string): Promise<void> {
    this.deleted.add(snapshotName);
    this.existing.delete(snapshotName);
    this.sizes.delete(snapshotName);
  }
}
