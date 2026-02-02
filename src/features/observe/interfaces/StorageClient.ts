import type {
  PreferenceFile,
  KeyValueEntry,
  KeyValueType,
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

  /**
   * Get a single preference entry by key.
   *
   * @param packageName - The package name of the app
   * @param fileName - Name of the preference file
   * @param key - The key to retrieve
   * @returns Promise resolving to the entry if found, null if not found
   */
  getPreference(packageName: string, fileName: string, key: string): Promise<KeyValueEntry | null>;

  /**
   * Set a preference value.
   *
   * @param packageName - The package name of the app
   * @param fileName - Name of the preference file
   * @param key - The key to set
   * @param value - The value to set (serialized as string, or null)
   * @param type - The type of the value (STRING, INT, LONG, FLOAT, BOOLEAN, STRING_SET)
   */
  setPreference(
    packageName: string,
    fileName: string,
    key: string,
    value: string | null,
    type: KeyValueType
  ): Promise<void>;

  /**
   * Remove a preference entry.
   *
   * @param packageName - The package name of the app
   * @param fileName - Name of the preference file
   * @param key - The key to remove
   */
  removePreference(packageName: string, fileName: string, key: string): Promise<void>;

  /**
   * Clear all preferences in a file.
   *
   * @param packageName - The package name of the app
   * @param fileName - Name of the preference file to clear
   */
  clearPreferenceStore(packageName: string, fileName: string): Promise<void>;
}
