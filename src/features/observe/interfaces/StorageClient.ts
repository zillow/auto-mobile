import type {
  PreferenceFile,
  KeyValueEntry,
  StorageSubscription,
  StorageChangedEvent,
} from "../../storage/storageTypes";

/**
 * Interface for storage inspection operations.
 * Provides access to SharedPreferences and DataStore files on Android devices.
 */
export interface StorageClient {
  /**
   * List all preference files for a package.
   * Returns SharedPreferences and DataStore files accessible to the app.
   *
   * @param packageName - The package name of the app to inspect
   * @returns Promise resolving to array of preference files
   */
  listPreferenceFiles(packageName: string): Promise<PreferenceFile[]>;

  /**
   * Get all key-value entries from a preference file.
   *
   * @param packageName - The package name of the app
   * @param fileName - Name of the preference file
   * @returns Promise resolving to array of key-value entries
   */
  getPreferenceEntries(packageName: string, fileName: string): Promise<KeyValueEntry[]>;

  /**
   * Subscribe to storage changes for a preference file.
   * Returns a subscription that can be used to unsubscribe later.
   *
   * @param packageName - The package name of the app
   * @param fileName - Name of the preference file to observe
   * @returns Promise resolving to the subscription details
   */
  subscribeStorage(packageName: string, fileName: string): Promise<StorageSubscription>;

  /**
   * Unsubscribe from storage changes.
   *
   * @param subscriptionId - The subscription ID returned from subscribeStorage
   */
  unsubscribeStorage(subscriptionId: string): Promise<void>;

  /**
   * Add a listener for storage change events.
   * The listener will be called for all subscribed storage changes.
   *
   * @param callback - Function to call when storage changes occur
   * @returns Function to remove the listener
   */
  addStorageChangeListener(callback: (event: StorageChangedEvent) => void): () => void;
}
