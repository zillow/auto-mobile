/**
 * CtrlProxyStorage - Delegate for SharedPreferences operations.
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
  KeyValueType,
  StorageSubscription,
  StorageChangedEvent,
  ListPreferenceFilesResult,
  GetPreferencesResult,
  GetPreferenceResult,
  SetPreferenceResult,
  RemovePreferenceResult,
  ClearPreferencesResult,
  SubscribeStorageResult,
  UnsubscribeStorageResult,
} from "../../storage/storageTypes";

/**
 * Delegate class for handling SharedPreferences operations.
 */
export class CtrlProxyStorage {
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
    const startTime = this.context.timer.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await this.context.ensureConnected();
      if (!connected) {
        logger.warn("[CTRL_PROXY] Failed to establish WebSocket connection for listPreferenceFiles");
        throw new Error("Failed to connect to accessibility service");
      }

      const requestId = `list_preference_files_${this.context.timer.now()}_${generateSecureId()}`;

      // Create promise that will be resolved when we receive the result
      const resultPromise = this.context.requestManager.register<ListPreferenceFilesResult>(
        requestId,
        "list_preference_files",
        timeoutMs,
        (_id, _type, _timeout) => ({
          success: false,
          totalTimeMs: this.context.timer.now() - startTime,
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
      logger.info(`[CTRL_PROXY] Sending list_preference_files request (requestId: ${requestId}, packageName: ${packageName}, wsReadyState: ${ws.readyState})`);
      ws.send(message);
      logger.info(`[CTRL_PROXY] Sent list_preference_files request successfully`);

      // Wait for response
      const result = await resultPromise;

      if (!result.success) {
        throw new Error(result.error || "Failed to list preference files");
      }

      return result.files || [];
    } catch (error) {
      const duration = this.context.timer.now() - startTime;
      logger.warn(`[CTRL_PROXY] listPreferenceFiles failed after ${duration}ms: ${error}`);
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
    const startTime = this.context.timer.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await this.context.ensureConnected();
      if (!connected) {
        logger.warn("[CTRL_PROXY] Failed to establish WebSocket connection for getPreferenceEntries");
        throw new Error("Failed to connect to accessibility service");
      }

      const requestId = `get_preferences_${this.context.timer.now()}_${generateSecureId()}`;

      // Create promise that will be resolved when we receive the result
      const resultPromise = this.context.requestManager.register<GetPreferencesResult>(
        requestId,
        "get_preferences",
        timeoutMs,
        (_id, _type, _timeout) => ({
          success: false,
          totalTimeMs: this.context.timer.now() - startTime,
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
      logger.debug(`[CTRL_PROXY] Sent get_preferences request (requestId: ${requestId}, packageName: ${packageName}, fileName: ${fileName})`);

      // Wait for response
      const result = await resultPromise;

      if (!result.success) {
        throw new Error(result.error || "Failed to get preference entries");
      }

      return result.entries || [];
    } catch (error) {
      const duration = this.context.timer.now() - startTime;
      logger.warn(`[CTRL_PROXY] getPreferenceEntries failed after ${duration}ms: ${error}`);
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
    const startTime = this.context.timer.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await this.context.ensureConnected();
      if (!connected) {
        logger.warn("[CTRL_PROXY] Failed to establish WebSocket connection for subscribeStorage");
        throw new Error("Failed to connect to accessibility service");
      }

      const requestId = `subscribe_storage_${this.context.timer.now()}_${generateSecureId()}`;

      // Create promise that will be resolved when we receive the result
      const resultPromise = this.context.requestManager.register<SubscribeStorageResult>(
        requestId,
        "subscribe_storage",
        timeoutMs,
        (_id, _type, _timeout) => ({
          success: false,
          totalTimeMs: this.context.timer.now() - startTime,
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
      logger.debug(`[CTRL_PROXY] Sent subscribe_storage request (requestId: ${requestId}, packageName: ${packageName}, fileName: ${fileName})`);

      // Wait for response
      const result = await resultPromise;

      if (!result.success || !result.subscription) {
        throw new Error(result.error || "Failed to subscribe to storage");
      }

      logger.info(`[CTRL_PROXY] Subscribed to storage changes: ${packageName}/${fileName} (subscriptionId: ${result.subscription.subscriptionId})`);
      return result.subscription;
    } catch (error) {
      const duration = this.context.timer.now() - startTime;
      logger.warn(`[CTRL_PROXY] subscribeStorage failed after ${duration}ms: ${error}`);
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
    const startTime = this.context.timer.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await this.context.ensureConnected();
      if (!connected) {
        logger.warn("[CTRL_PROXY] Failed to establish WebSocket connection for unsubscribeStorage");
        throw new Error("Failed to connect to accessibility service");
      }

      const requestId = `unsubscribe_storage_${this.context.timer.now()}_${generateSecureId()}`;

      // Create promise that will be resolved when we receive the result
      const resultPromise = this.context.requestManager.register<UnsubscribeStorageResult>(
        requestId,
        "unsubscribe_storage",
        timeoutMs,
        (_id, _type, _timeout) => ({
          success: false,
          totalTimeMs: this.context.timer.now() - startTime,
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
      logger.debug(`[CTRL_PROXY] Sent unsubscribe_storage request (requestId: ${requestId}, subscriptionId: ${subscriptionId})`);

      // Wait for response
      const result = await resultPromise;

      if (!result.success) {
        throw new Error(result.error || "Failed to unsubscribe from storage");
      }

      logger.info(`[CTRL_PROXY] Unsubscribed from storage changes (subscriptionId: ${subscriptionId})`);
    } catch (error) {
      const duration = this.context.timer.now() - startTime;
      logger.warn(`[CTRL_PROXY] unsubscribeStorage failed after ${duration}ms: ${error}`);
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
        logger.warn(`[CTRL_PROXY] Storage change listener error: ${error}`);
      }
    }
  }

  /**
   * Get a single preference entry by key.
   *
   * @param packageName - The package name of the app
   * @param fileName - Name of the preference file
   * @param key - The key to retrieve
   * @param timeoutMs - Maximum time to wait for response in milliseconds
   * @returns Promise resolving to the entry if found, null if not found
   */
  async getPreference(
    packageName: string,
    fileName: string,
    key: string,
    timeoutMs: number = 5000
  ): Promise<KeyValueEntry | null> {
    const startTime = this.context.timer.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await this.context.ensureConnected();
      if (!connected) {
        logger.warn("[CTRL_PROXY] Failed to establish WebSocket connection for getPreference");
        throw new Error("Failed to connect to accessibility service");
      }

      const requestId = `get_preference_${this.context.timer.now()}_${generateSecureId()}`;

      // Create promise that will be resolved when we receive the result
      const resultPromise = this.context.requestManager.register<GetPreferenceResult>(
        requestId,
        "get_preference",
        timeoutMs,
        (_id, _type, _timeout) => ({
          success: false,
          found: false,
          totalTimeMs: this.context.timer.now() - startTime,
          error: `Get preference timeout after ${timeoutMs}ms`
        })
      );

      // Send the request
      const ws = this.context.getWebSocket();
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket not connected");
      }
      const message = JSON.stringify({
        type: "get_preference",
        requestId,
        packageName,
        fileName,
        key
      });
      ws.send(message);
      logger.debug(`[CTRL_PROXY] Sent get_preference request (requestId: ${requestId}, packageName: ${packageName}, fileName: ${fileName}, key: ${key})`);

      // Wait for response
      const result = await resultPromise;

      if (!result.success) {
        throw new Error(result.error || "Failed to get preference");
      }

      return result.found && result.entry ? result.entry : null;
    } catch (error) {
      const duration = this.context.timer.now() - startTime;
      logger.warn(`[CTRL_PROXY] getPreference failed after ${duration}ms: ${error}`);
      throw error;
    }
  }

  /**
   * Set a preference value.
   *
   * @param packageName - The package name of the app
   * @param fileName - Name of the preference file
   * @param key - The key to set
   * @param value - The value to set (serialized as string, or null)
   * @param type - The type of the value (STRING, INT, LONG, FLOAT, BOOLEAN, STRING_SET)
   * @param timeoutMs - Maximum time to wait for response in milliseconds
   */
  async setPreference(
    packageName: string,
    fileName: string,
    key: string,
    value: string | null,
    type: KeyValueType,
    timeoutMs: number = 5000
  ): Promise<void> {
    const startTime = this.context.timer.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await this.context.ensureConnected();
      if (!connected) {
        logger.warn("[CTRL_PROXY] Failed to establish WebSocket connection for setPreference");
        throw new Error("Failed to connect to accessibility service");
      }

      const requestId = `set_preference_${this.context.timer.now()}_${generateSecureId()}`;

      // Create promise that will be resolved when we receive the result
      const resultPromise = this.context.requestManager.register<SetPreferenceResult>(
        requestId,
        "set_preference",
        timeoutMs,
        (_id, _type, _timeout) => ({
          success: false,
          totalTimeMs: this.context.timer.now() - startTime,
          error: `Set preference timeout after ${timeoutMs}ms`
        })
      );

      // Send the request
      const ws = this.context.getWebSocket();
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket not connected");
      }
      const message = JSON.stringify({
        type: "set_preference",
        requestId,
        packageName,
        fileName,
        key,
        value,
        valueType: type
      });
      ws.send(message);
      logger.debug(`[CTRL_PROXY] Sent set_preference request (requestId: ${requestId}, packageName: ${packageName}, fileName: ${fileName}, key: ${key})`);

      // Wait for response
      const result = await resultPromise;

      if (!result.success) {
        throw new Error(result.error || "Failed to set preference");
      }

      logger.info(`[CTRL_PROXY] Set preference: ${packageName}/${fileName}/${key}`);
    } catch (error) {
      const duration = this.context.timer.now() - startTime;
      logger.warn(`[CTRL_PROXY] setPreference failed after ${duration}ms: ${error}`);
      throw error;
    }
  }

  /**
   * Remove a preference entry.
   *
   * @param packageName - The package name of the app
   * @param fileName - Name of the preference file
   * @param key - The key to remove
   * @param timeoutMs - Maximum time to wait for response in milliseconds
   */
  async removePreference(
    packageName: string,
    fileName: string,
    key: string,
    timeoutMs: number = 5000
  ): Promise<void> {
    const startTime = this.context.timer.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await this.context.ensureConnected();
      if (!connected) {
        logger.warn("[CTRL_PROXY] Failed to establish WebSocket connection for removePreference");
        throw new Error("Failed to connect to accessibility service");
      }

      const requestId = `remove_preference_${this.context.timer.now()}_${generateSecureId()}`;

      // Create promise that will be resolved when we receive the result
      const resultPromise = this.context.requestManager.register<RemovePreferenceResult>(
        requestId,
        "remove_preference",
        timeoutMs,
        (_id, _type, _timeout) => ({
          success: false,
          totalTimeMs: this.context.timer.now() - startTime,
          error: `Remove preference timeout after ${timeoutMs}ms`
        })
      );

      // Send the request
      const ws = this.context.getWebSocket();
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket not connected");
      }
      const message = JSON.stringify({
        type: "remove_preference",
        requestId,
        packageName,
        fileName,
        key
      });
      ws.send(message);
      logger.debug(`[CTRL_PROXY] Sent remove_preference request (requestId: ${requestId}, packageName: ${packageName}, fileName: ${fileName}, key: ${key})`);

      // Wait for response
      const result = await resultPromise;

      if (!result.success) {
        throw new Error(result.error || "Failed to remove preference");
      }

      logger.info(`[CTRL_PROXY] Removed preference: ${packageName}/${fileName}/${key}`);
    } catch (error) {
      const duration = this.context.timer.now() - startTime;
      logger.warn(`[CTRL_PROXY] removePreference failed after ${duration}ms: ${error}`);
      throw error;
    }
  }

  /**
   * Clear all preferences in a file.
   *
   * @param packageName - The package name of the app
   * @param fileName - Name of the preference file to clear
   * @param timeoutMs - Maximum time to wait for response in milliseconds
   */
  async clearPreferenceStore(
    packageName: string,
    fileName: string,
    timeoutMs: number = 5000
  ): Promise<void> {
    const startTime = this.context.timer.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await this.context.ensureConnected();
      if (!connected) {
        logger.warn("[CTRL_PROXY] Failed to establish WebSocket connection for clearPreferenceStore");
        throw new Error("Failed to connect to accessibility service");
      }

      const requestId = `clear_preferences_${this.context.timer.now()}_${generateSecureId()}`;

      // Create promise that will be resolved when we receive the result
      const resultPromise = this.context.requestManager.register<ClearPreferencesResult>(
        requestId,
        "clear_preferences",
        timeoutMs,
        (_id, _type, _timeout) => ({
          success: false,
          totalTimeMs: this.context.timer.now() - startTime,
          error: `Clear preferences timeout after ${timeoutMs}ms`
        })
      );

      // Send the request
      const ws = this.context.getWebSocket();
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket not connected");
      }
      const message = JSON.stringify({
        type: "clear_preferences",
        requestId,
        packageName,
        fileName
      });
      ws.send(message);
      logger.debug(`[CTRL_PROXY] Sent clear_preferences request (requestId: ${requestId}, packageName: ${packageName}, fileName: ${fileName})`);

      // Wait for response
      const result = await resultPromise;

      if (!result.success) {
        throw new Error(result.error || "Failed to clear preferences");
      }

      logger.info(`[CTRL_PROXY] Cleared preferences: ${packageName}/${fileName}`);
    } catch (error) {
      const duration = this.context.timer.now() - startTime;
      logger.warn(`[CTRL_PROXY] clearPreferenceStore failed after ${duration}ms: ${error}`);
      throw error;
    }
  }
}
