/**
 * AccessibilityServiceStorage - Delegate for SharedPreferences operations.
 *
 * This delegate handles listing, reading, and subscribing to SharedPreferences
 * and DataStore changes on the device.
 */

import WebSocket from "ws";
import { logger } from "../../../utils/logger";
import type { DelegateContext } from "./types";
import { generateSecureId } from "./types";
import type {
  PreferenceFile,
  KeyValueEntry,
  StorageSubscription,
  StorageChangedEvent,
  ListPreferenceFilesResult,
  GetPreferencesResult,
  SubscribeStorageResult,
  UnsubscribeStorageResult,
} from "../../storage/storageTypes";

/**
 * Delegate class for handling SharedPreferences operations.
 */
export class AccessibilityServiceStorage {
  private readonly context: DelegateContext;

  // Storage change listeners
  private storageChangeListeners: Set<(event: StorageChangedEvent) => void> = new Set();

  constructor(context: DelegateContext) {
    this.context = context;
  }

  /**
   * List all preference files for a package.
   * Returns SharedPreferences and DataStore files accessible to the app.
   *
   * @param packageName - The package name of the app to inspect
   * @param timeoutMs - Maximum time to wait for response in milliseconds
   * @returns Promise resolving to array of preference files
   */
  async listPreferenceFiles(
    packageName: string,
    timeoutMs: number = 5000
  ): Promise<PreferenceFile[]> {
    const startTime = Date.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await this.context.ensureConnected();
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for listPreferenceFiles");
        throw new Error("Failed to connect to accessibility service");
      }

      const requestId = `list_preference_files_${Date.now()}_${generateSecureId()}`;

      // Create promise that will be resolved when we receive the result
      const resultPromise = this.context.requestManager.register<ListPreferenceFilesResult>(
        requestId,
        "list_preference_files",
        timeoutMs,
        (_id, _type, _timeout) => ({
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: `List preference files timeout after ${timeoutMs}ms`
        })
      );

      // Send the request
      const ws = this.context.getWebSocket();
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket not connected");
      }
      const message = JSON.stringify({
        type: "list_preference_files",
        requestId,
        packageName
      });
      ws.send(message);
      logger.debug(`[ACCESSIBILITY_SERVICE] Sent list_preference_files request (requestId: ${requestId}, packageName: ${packageName})`);

      // Wait for response
      const result = await resultPromise;

      if (!result.success) {
        throw new Error(result.error || "Failed to list preference files");
      }

      return result.files || [];
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] listPreferenceFiles failed after ${duration}ms: ${error}`);
      throw error;
    }
  }

  /**
   * Get all key-value entries from a preference file.
   *
   * @param packageName - The package name of the app
   * @param fileName - Name of the preference file
   * @param timeoutMs - Maximum time to wait for response in milliseconds
   * @returns Promise resolving to array of key-value entries
   */
  async getPreferenceEntries(
    packageName: string,
    fileName: string,
    timeoutMs: number = 5000
  ): Promise<KeyValueEntry[]> {
    const startTime = Date.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await this.context.ensureConnected();
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for getPreferenceEntries");
        throw new Error("Failed to connect to accessibility service");
      }

      const requestId = `get_preferences_${Date.now()}_${generateSecureId()}`;

      // Create promise that will be resolved when we receive the result
      const resultPromise = this.context.requestManager.register<GetPreferencesResult>(
        requestId,
        "get_preferences",
        timeoutMs,
        (_id, _type, _timeout) => ({
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: `Get preferences timeout after ${timeoutMs}ms`
        })
      );

      // Send the request
      const ws = this.context.getWebSocket();
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket not connected");
      }
      const message = JSON.stringify({
        type: "get_preferences",
        requestId,
        packageName,
        fileName
      });
      ws.send(message);
      logger.debug(`[ACCESSIBILITY_SERVICE] Sent get_preferences request (requestId: ${requestId}, packageName: ${packageName}, fileName: ${fileName})`);

      // Wait for response
      const result = await resultPromise;

      if (!result.success) {
        throw new Error(result.error || "Failed to get preference entries");
      }

      return result.entries || [];
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] getPreferenceEntries failed after ${duration}ms: ${error}`);
      throw error;
    }
  }

  /**
   * Subscribe to storage changes for a preference file.
   * Returns a subscription that can be used to unsubscribe later.
   *
   * @param packageName - The package name of the app
   * @param fileName - Name of the preference file to observe
   * @param timeoutMs - Maximum time to wait for response in milliseconds
   * @returns Promise resolving to the subscription details
   */
  async subscribeStorage(
    packageName: string,
    fileName: string,
    timeoutMs: number = 5000
  ): Promise<StorageSubscription> {
    const startTime = Date.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await this.context.ensureConnected();
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for subscribeStorage");
        throw new Error("Failed to connect to accessibility service");
      }

      const requestId = `subscribe_storage_${Date.now()}_${generateSecureId()}`;

      // Create promise that will be resolved when we receive the result
      const resultPromise = this.context.requestManager.register<SubscribeStorageResult>(
        requestId,
        "subscribe_storage",
        timeoutMs,
        (_id, _type, _timeout) => ({
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: `Subscribe storage timeout after ${timeoutMs}ms`
        })
      );

      // Send the request
      const ws = this.context.getWebSocket();
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket not connected");
      }
      const message = JSON.stringify({
        type: "subscribe_storage",
        requestId,
        packageName,
        fileName
      });
      ws.send(message);
      logger.debug(`[ACCESSIBILITY_SERVICE] Sent subscribe_storage request (requestId: ${requestId}, packageName: ${packageName}, fileName: ${fileName})`);

      // Wait for response
      const result = await resultPromise;

      if (!result.success || !result.subscription) {
        throw new Error(result.error || "Failed to subscribe to storage");
      }

      logger.info(`[ACCESSIBILITY_SERVICE] Subscribed to storage changes: ${packageName}/${fileName} (subscriptionId: ${result.subscription.subscriptionId})`);
      return result.subscription;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] subscribeStorage failed after ${duration}ms: ${error}`);
      throw error;
    }
  }

  /**
   * Unsubscribe from storage changes.
   *
   * @param subscriptionId - The subscription ID returned from subscribeStorage
   * @param timeoutMs - Maximum time to wait for response in milliseconds
   */
  async unsubscribeStorage(
    subscriptionId: string,
    timeoutMs: number = 5000
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await this.context.ensureConnected();
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for unsubscribeStorage");
        throw new Error("Failed to connect to accessibility service");
      }

      const requestId = `unsubscribe_storage_${Date.now()}_${generateSecureId()}`;

      // Create promise that will be resolved when we receive the result
      const resultPromise = this.context.requestManager.register<UnsubscribeStorageResult>(
        requestId,
        "unsubscribe_storage",
        timeoutMs,
        (_id, _type, _timeout) => ({
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: `Unsubscribe storage timeout after ${timeoutMs}ms`
        })
      );

      // Send the request
      const ws = this.context.getWebSocket();
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket not connected");
      }
      const message = JSON.stringify({
        type: "unsubscribe_storage",
        requestId,
        subscriptionId
      });
      ws.send(message);
      logger.debug(`[ACCESSIBILITY_SERVICE] Sent unsubscribe_storage request (requestId: ${requestId}, subscriptionId: ${subscriptionId})`);

      // Wait for response
      const result = await resultPromise;

      if (!result.success) {
        throw new Error(result.error || "Failed to unsubscribe from storage");
      }

      logger.info(`[ACCESSIBILITY_SERVICE] Unsubscribed from storage changes (subscriptionId: ${subscriptionId})`);
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] unsubscribeStorage failed after ${duration}ms: ${error}`);
      throw error;
    }
  }

  /**
   * Add a listener for storage change events.
   * The listener will be called for all subscribed storage changes.
   *
   * @param callback - Function to call when storage changes occur
   * @returns Function to remove the listener
   */
  addStorageChangeListener(callback: (event: StorageChangedEvent) => void): () => void {
    this.storageChangeListeners.add(callback);
    return () => {
      this.storageChangeListeners.delete(callback);
    };
  }

  /**
   * Notify all storage change listeners of an event.
   * This is called by the main client when a storage_changed message is received.
   */
  notifyStorageChangeListeners(event: StorageChangedEvent): void {
    for (const listener of this.storageChangeListeners) {
      try {
        listener(event);
      } catch (error) {
        logger.warn(`[ACCESSIBILITY_SERVICE] Storage change listener error: ${error}`);
      }
    }
  }
}
