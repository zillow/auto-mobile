import type { BootedDevice } from "../../src/models";
import type { AdbClientFactory } from "../../src/utils/android-cmdline-tools/AdbClientFactory";
import type { AdbExecutor } from "../../src/utils/android-cmdline-tools/interfaces/AdbExecutor";
import { FakeAdbClient } from "./FakeAdbClient";

/**
 * Recorded factory call for testing.
 */
export interface RecordedFactoryCall {
  device: BootedDevice | null | undefined;
  timestamp: number;
}

/**
 * Fake AdbClientFactory for testing.
 * Returns FakeAdbClient instances and records all create() calls.
 */
export class FakeAdbClientFactory implements AdbClientFactory {
  private calls: RecordedFactoryCall[] = [];
  private fakeClient: FakeAdbClient;
  private clientsByDevice: Map<string, FakeAdbClient> = new Map();
  private useSharedClient = true;

  constructor(fakeClient?: FakeAdbClient) {
    this.fakeClient = fakeClient ?? new FakeAdbClient();
  }

  /**
   * Create an AdbClient for the given device.
   * Returns the shared FakeAdbClient by default, or per-device clients if configured.
   */
  create(device?: BootedDevice | null): AdbExecutor {
    this.calls.push({
      device: device ?? null,
      timestamp: Date.now(),
    });

    if (this.useSharedClient) {
      return this.fakeClient;
    }

    const deviceId = device?.deviceId ?? "default";
    if (!this.clientsByDevice.has(deviceId)) {
      this.clientsByDevice.set(deviceId, new FakeAdbClient());
    }
    return this.clientsByDevice.get(deviceId)!;
  }

  // Test helpers

  /**
   * Get the shared fake client.
   */
  getFakeClient(): FakeAdbClient {
    return this.fakeClient;
  }

  /**
   * Get a fake client for a specific device.
   */
  getClientForDevice(deviceId: string): FakeAdbClient | undefined {
    return this.clientsByDevice.get(deviceId);
  }

  /**
   * Configure to return separate clients per device.
   */
  useSeparateClientsPerDevice(): void {
    this.useSharedClient = false;
  }

  /**
   * Configure to return the same client for all devices (default).
   */
  useSharedClientForAllDevices(): void {
    this.useSharedClient = true;
  }

  /**
   * Get all recorded create() calls.
   */
  getCalls(): RecordedFactoryCall[] {
    return [...this.calls];
  }

  /**
   * Get the number of create() calls.
   */
  getCallCount(): number {
    return this.calls.length;
  }

  /**
   * Check if create() was called for a specific device.
   */
  wasCalledForDevice(deviceId: string): boolean {
    return this.calls.some(call => call.device?.deviceId === deviceId);
  }

  /**
   * Reset all state.
   */
  reset(): void {
    this.calls = [];
    this.fakeClient = new FakeAdbClient();
    this.clientsByDevice.clear();
    this.useSharedClient = true;
  }
}
