import type { BootedDevice } from "../../models";
import type { AdbExecutor } from "./interfaces/AdbExecutor";
import { AdbClient } from "./AdbClient";
import type { RetryExecutor } from "../retry/RetryExecutor";

/**
 * Factory interface for creating AdbClient instances.
 * Enables dependency injection for testing.
 */
export interface AdbClientFactory {
  /**
   * Create an AdbClient for the given device.
   * @param device - The target device (optional for device-independent operations)
   * @param retryExecutor - Optional retry executor for command retries
   * @returns An AdbExecutor instance
   */
  create(device?: BootedDevice | null, retryExecutor?: RetryExecutor): AdbExecutor;
}

/**
 * Default factory that creates real AdbClient instances.
 */
class DefaultAdbClientFactory implements AdbClientFactory {
  create(device?: BootedDevice | null, retryExecutor?: RetryExecutor): AdbExecutor {
    return new AdbClient(device ?? null, null, null, retryExecutor);
  }
}

/**
 * Singleton instance of the default factory.
 */
export const defaultAdbClientFactory: AdbClientFactory = new DefaultAdbClientFactory();
