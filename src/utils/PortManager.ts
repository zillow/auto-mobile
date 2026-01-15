import { logger } from "./logger";

/**
 * Manages port allocation for multi-device support.
 * Each device gets a unique local port for WebSocket forwarding to avoid conflicts
 * when running multiple emulators/devices simultaneously.
 */
export class PortManager {
  private static allocatedPorts: Map<string, number> = new Map();
  private static readonly BASE_PORT = 8765;
  private static readonly MAX_DEVICES = 100;

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
    for (let i = 0; i < this.MAX_DEVICES; i++) {
      const port = this.BASE_PORT + i;
      if (!usedPorts.has(port)) {
        this.allocatedPorts.set(deviceId, port);
        logger.info(`[PortManager] Allocated port ${port} for device ${deviceId}`);
        return port;
      }
    }

    throw new Error(
      `No available ports for device ${deviceId}. ` +
      `All ${this.MAX_DEVICES} ports (${this.BASE_PORT}-${this.BASE_PORT + this.MAX_DEVICES - 1}) are in use.`
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
    return this.BASE_PORT;
  }

  /**
   * The device port (port on the Android device side - always the same)
   */
  public static readonly DEVICE_PORT = 8765;
}
