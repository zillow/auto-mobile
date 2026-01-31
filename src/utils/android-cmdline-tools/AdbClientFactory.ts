import type { BootedDevice } from "../../models";
import type { AdbExecutor } from "./interfaces/AdbExecutor";
import { AdbClient } from "./AdbClient";

/**
 * Factory interface for creating AdbClient instances.
 * Enables dependency injection for testing.
 */
export interface AdbClientFactory {
  /**
   * Create an AdbClient for the given device.
   * @param device - The target device (optional for device-independent operations)
   * @returns An AdbExecutor instance
   */
  create(device?: BootedDevice | null): AdbExecutor;
}

/**
 * Default factory that creates real AdbClient instances.
 */
export class DefaultAdbClientFactory implements AdbClientFactory {
  create(device?: BootedDevice | null): AdbExecutor {
    return new AdbClient(device ?? null);
  }
}

/**
 * Singleton instance of the default factory.
 */
export const defaultAdbClientFactory: AdbClientFactory = new DefaultAdbClientFactory();
