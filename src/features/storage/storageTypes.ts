/**
 * Storage inspection types for SharedPreferences and DataStore access.
 * These types match the Android SDK models for storage observation.
 */

/**
 * Information about a preference file (SharedPreferences or DataStore).
 */
export interface PreferenceFile {
  /** Name of the preference file (without path) */
  name: string;
  /** Full path to the preference file on device */
  path: string;
  /** Number of key-value entries in this file */
  entryCount: number;
}

/**
 * Type of value stored in a key-value entry.
 */
export type KeyValueType = "STRING" | "INT" | "LONG" | "FLOAT" | "BOOLEAN" | "STRING_SET";

/**
 * A single key-value entry from a preference file.
 */
export interface KeyValueEntry {
  /** The key name */
  key: string;
  /** JSON-encoded value (null if the entry was deleted) */
  value: string | null;
  /** Type of the stored value */
  type: KeyValueType;
}

/**
 * Active subscription to storage changes for a preference file.
 */
export interface StorageSubscription {
  /** Package name of the app being observed */
  packageName: string;
  /** Name of the preference file being observed */
  fileName: string;
  /** Unique identifier for this subscription */
  subscriptionId: string;
}

/**
 * Event emitted when a storage value changes.
 */
export interface StorageChangedEvent {
  /** Package name of the app where the change occurred */
  packageName: string;
  /** Name of the preference file that changed */
  fileName: string;
  /** Key that changed (null if the entire file was cleared) */
  key: string | null;
  /** New JSON-encoded value (null if the key was deleted or file cleared) */
  value: string | null;
  /** Type of the value */
  valueType: KeyValueType;
  /** Timestamp when the change occurred (milliseconds since epoch) */
  timestamp: number;
  /** Sequence number for ordering events */
  sequenceNumber: number;
}

/**
 * Result of a list_preference_files request.
 */
export interface ListPreferenceFilesResult {
  success: boolean;
  files?: PreferenceFile[];
  totalTimeMs: number;
  error?: string;
}

/**
 * Result of a get_preferences request.
 */
export interface GetPreferencesResult {
  success: boolean;
  entries?: KeyValueEntry[];
  totalTimeMs: number;
  error?: string;
}

/**
 * Result of a subscribe_storage request.
 */
export interface SubscribeStorageResult {
  success: boolean;
  subscription?: StorageSubscription;
  totalTimeMs: number;
  error?: string;
}

/**
 * Result of an unsubscribe_storage request.
 */
export interface UnsubscribeStorageResult {
  success: boolean;
  totalTimeMs: number;
  error?: string;
}

/**
 * Result of a get_preference request.
 */
export interface GetPreferenceResult {
  success: boolean;
  found: boolean;
  entry?: KeyValueEntry;
  totalTimeMs: number;
  error?: string;
}

/**
 * Result of a set_preference request.
 */
export interface SetPreferenceResult {
  success: boolean;
  totalTimeMs: number;
  error?: string;
}

/**
 * Result of a remove_preference request.
 */
export interface RemovePreferenceResult {
  success: boolean;
  totalTimeMs: number;
  error?: string;
}

/**
 * Result of a clear_preferences request.
 */
export interface ClearPreferencesResult {
  success: boolean;
  totalTimeMs: number;
  error?: string;
}
