import { logger } from "./logger";

/**
 * Manages port allocation for multi-device support.
 * Each device gets a unique local port for WebSocket forwarding to avoid conflicts
 * when running multiple emulators/devices simultaneously.
 */
export class PortManager {
  private static allocatedPorts: Map<string, number> = new Map();
  private static readonly DEFAULT_BASE_PORT = 8765;
  private static readonly DEFAULT_MAX_DEVICES = 100;
  private static readonly basePort = PortManager.resolveBasePort();
  private static readonly maxDevices = PortManager.resolveMaxDevices();

  /**
   * Allocate a unique local port for a device.
   * Returns existing allocation if device already has a port.
   * @param deviceId - The device identifier
   * @returns The allocated local port number
   * @throws Error if no ports are available
   */
  public static allocate(deviceId: string): number {
    // Return existing allocation
    if (this.allocatedPorts.has(deviceId)) {
      return this.allocatedPorts.get(deviceId)!;
    }

    // Find next available port
    const usedPorts = new Set(this.allocatedPorts.values());
    for (let i = 0; i < this.maxDevices; i++) {
      const port = this.basePort + i;
      if (!usedPorts.has(port)) {
        this.allocatedPorts.set(deviceId, port);
        logger.info(`[PortManager] Allocated port ${port} for device ${deviceId}`);
        return port;
      }
    }

    throw new Error(
      `No available ports for device ${deviceId}. ` +
      `All ${this.maxDevices} ports (${this.basePort}-${this.basePort + this.maxDevices - 1}) are in use.`
    );
  }

  /**
   * Release a port allocation for a device.
   * @param deviceId - The device identifier
   */
  public static release(deviceId: string): void {
    const port = this.allocatedPorts.get(deviceId);
    if (port !== undefined) {
      this.allocatedPorts.delete(deviceId);
      logger.info(`[PortManager] Released port ${port} for device ${deviceId}`);
    }
  }

  /**
   * Get the port allocated to a device, if any.
   * @param deviceId - The device identifier
   * @returns The allocated port or undefined
   */
  public static getPort(deviceId: string): number | undefined {
    return this.allocatedPorts.get(deviceId);
  }

  /**
   * Get WebSocket URL for a device.
   * @param deviceId - The device identifier
   * @returns The WebSocket URL with device-specific port
   */
  public static getWebSocketUrl(deviceId: string): string {
    const port = this.allocate(deviceId);
    return `ws://localhost:${port}/ws`;
  }

  /**
   * Get the number of currently allocated ports.
   * Useful for monitoring and testing.
   */
  public static getAllocatedCount(): number {
    return this.allocatedPorts.size;
  }

  /**
   * Get all current allocations.
   * Useful for debugging.
   */
  public static getAllocations(): Map<string, number> {
    return new Map(this.allocatedPorts);
  }

  /**
   * Reset all port allocations.
   * Should only be used in testing.
   */
  public static reset(): void {
    const count = this.allocatedPorts.size;
    this.allocatedPorts.clear();
    logger.info(`[PortManager] Reset all port allocations (cleared ${count} allocations)`);
  }

  /**
   * The base port number (for reference/testing)
   */
  public static getBasePort(): number {
    return this.basePort;
  }

  /**
   * The device port (port on the Android device side - always the same)
   */
  public static readonly DEVICE_PORT = 8765;

  private static resolveBasePort(): number {
    const envValue = process.env.AUTOMOBILE_PORT_RANGE_START ?? process.env.AUTO_MOBILE_PORT_RANGE_START;
    if (!envValue) {
      return this.DEFAULT_BASE_PORT;
    }
    const parsed = Number.parseInt(envValue, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      logger.warn(`[PortManager] Invalid port range start '${envValue}', using default ${this.DEFAULT_BASE_PORT}`);
      return this.DEFAULT_BASE_PORT;
    }
    return parsed;
  }

  private static resolveMaxDevices(): number {
    const endValue = process.env.AUTOMOBILE_PORT_RANGE_END ?? process.env.AUTO_MOBILE_PORT_RANGE_END;
    if (endValue) {
      const parsedEnd = Number.parseInt(endValue, 10);
      if (!Number.isNaN(parsedEnd) && parsedEnd >= this.basePort) {
        return parsedEnd - this.basePort + 1;
      }
      logger.warn(`[PortManager] Invalid port range end '${endValue}', using default ${this.DEFAULT_MAX_DEVICES}`);
      return this.DEFAULT_MAX_DEVICES;
    }

    const sizeValue = process.env.AUTOMOBILE_PORT_RANGE_SIZE ?? process.env.AUTO_MOBILE_PORT_RANGE_SIZE;
    if (!sizeValue) {
      return this.DEFAULT_MAX_DEVICES;
    }
    const parsedSize = Number.parseInt(sizeValue, 10);
    if (Number.isNaN(parsedSize) || parsedSize <= 0) {
      logger.warn(`[PortManager] Invalid port range size '${sizeValue}', using default ${this.DEFAULT_MAX_DEVICES}`);
      return this.DEFAULT_MAX_DEVICES;
    }
    return parsedSize;
  }
}
