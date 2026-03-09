import type {
  DeviceMetadataSource,
  DeviceMetadata,
} from "../../src/features/observe/interfaces/DeviceMetadataSource";

/**
 * Fake implementation of DeviceMetadataSource for testing.
 * Returns configurable responses and records all calls.
 */
export class FakeDeviceMetadataSource implements DeviceMetadataSource {
  private calls: { signal?: AbortSignal }[] = [];
  private configuredMetadata: DeviceMetadata | null = null;

  async getDeviceMetadata(signal?: AbortSignal): Promise<DeviceMetadata | null> {
    this.calls.push({ signal });
    return this.configuredMetadata;
  }

  /** Configure the metadata that will be returned. */
  setMetadata(metadata: DeviceMetadata | null): void {
    this.configuredMetadata = metadata;
  }

  /** Get the number of calls made. */
  getCallCount(): number {
    return this.calls.length;
  }

  /** Reset recorded calls. */
  reset(): void {
    this.calls = [];
  }
}
