import type { StorageClient } from "../../src/features/observe/interfaces/StorageClient";
import type {
  PreferenceFile,
  KeyValueEntry,
  KeyValueType,
  StorageSubscription,
  StorageChangedEvent,
} from "../../src/features/storage/storageTypes";

/**
 * Recorded operation for verification in tests.
 */
export interface RecordedStorageOperation {
  method: string;
  args: Record<string, unknown>;
  timestamp: number;
}

/**
 * Mock preference file data for testing.
 */
export interface MockPreferenceData {
  file: PreferenceFile;
  entries: KeyValueEntry[];
}

/**
 * Fake implementation of StorageClient for testing.
 *
 * Provides programmatic control over storage responses without
 * actually communicating with a device.
 */
export class FakeStorageClient implements StorageClient {
  private preferenceFiles: Map<string, MockPreferenceData[]> = new Map();
  private operations: RecordedStorageOperation[] = [];
  private failureMode: Map<string, Error> = new Map();
  private subscriptions: Map<string, StorageSubscription> = new Map();
  private subscriptionCounter = 0;
  private storageChangeListeners: Set<(event: StorageChangedEvent) => void> = new Set();

  /**
   * Add mock preference files for a package.
   */
  setPreferenceFiles(packageName: string, files: MockPreferenceData[]): void {
    this.preferenceFiles.set(packageName, files);
  }

  /**
   * Set a failure mode for a specific operation.
   * @param operation - Operation name: "listPreferenceFiles", "getPreferenceEntries", "subscribeStorage", "unsubscribeStorage"
   * @param error - Error to throw, or null to clear failure mode
   */
  setFailureMode(operation: string, error: Error | null): void {
    if (error === null) {
      this.failureMode.delete(operation);
    } else {
      this.failureMode.set(operation, error);
    }
  }

  /**
   * Simulate a storage change event being pushed from the device.
   */
  simulateStorageChange(event: StorageChangedEvent): void {
    for (const listener of this.storageChangeListeners) {
      listener(event);
    }
  }

  /**
   * List preference files for a package.
   */
  async listPreferenceFiles(packageName: string): Promise<PreferenceFile[]> {
    this.recordOperation("listPreferenceFiles", { packageName });

    const error = this.failureMode.get("listPreferenceFiles");
    if (error) {
      throw error;
    }

    const data = this.preferenceFiles.get(packageName);
    if (!data) {
      return [];
    }

    return data.map(d => d.file);
  }

  /**
   * Get entries from a preference file.
   */
  async getPreferenceEntries(packageName: string, fileName: string): Promise<KeyValueEntry[]> {
    this.recordOperation("getPreferenceEntries", { packageName, fileName });

    const error = this.failureMode.get("getPreferenceEntries");
    if (error) {
      throw error;
    }

    const data = this.preferenceFiles.get(packageName);
    if (!data) {
      return [];
    }

    const file = data.find(d => d.file.name === fileName);
    if (!file) {
      return [];
    }

    return file.entries;
  }

  /**
   * Subscribe to storage changes for a file.
   */
  async subscribeStorage(packageName: string, fileName: string): Promise<StorageSubscription> {
    this.recordOperation("subscribeStorage", { packageName, fileName });

    const error = this.failureMode.get("subscribeStorage");
    if (error) {
      throw error;
    }

    const subscriptionId = `sub-${++this.subscriptionCounter}`;
    const subscription: StorageSubscription = {
      packageName,
      fileName,
      subscriptionId,
    };

    this.subscriptions.set(subscriptionId, subscription);
    return subscription;
  }

  /**
   * Unsubscribe from storage changes.
   */
  async unsubscribeStorage(subscriptionId: string): Promise<void> {
    this.recordOperation("unsubscribeStorage", { subscriptionId });

    const error = this.failureMode.get("unsubscribeStorage");
    if (error) {
      throw error;
    }

    this.subscriptions.delete(subscriptionId);
  }

  /**
   * Add a listener for storage change events.
   */
  addStorageChangeListener(callback: (event: StorageChangedEvent) => void): () => void {
    this.storageChangeListeners.add(callback);
    return () => {
      this.storageChangeListeners.delete(callback);
    };
  }

  /**
   * Get a single preference entry by key.
   */
  async getPreference(packageName: string, fileName: string, key: string): Promise<KeyValueEntry | null> {
    this.recordOperation("getPreference", { packageName, fileName, key });

    const error = this.failureMode.get("getPreference");
    if (error) {
      throw error;
    }

    const data = this.preferenceFiles.get(packageName);
    if (!data) {
      return null;
    }

    const file = data.find(d => d.file.name === fileName);
    if (!file) {
      return null;
    }

    const entry = file.entries.find(e => e.key === key);
    return entry || null;
  }

  /**
   * Set a preference value.
   */
  async setPreference(
    packageName: string,
    fileName: string,
    key: string,
    value: string | null,
    type: KeyValueType
  ): Promise<void> {
    this.recordOperation("setPreference", { packageName, fileName, key, value, type });

    const error = this.failureMode.get("setPreference");
    if (error) {
      throw error;
    }

    const data = this.preferenceFiles.get(packageName);
    if (!data) {
      return;
    }

    const file = data.find(d => d.file.name === fileName);
    if (!file) {
      return;
    }

    const existingIndex = file.entries.findIndex(e => e.key === key);
    const entry: KeyValueEntry = { key, value, type };
    if (existingIndex >= 0) {
      file.entries[existingIndex] = entry;
    } else {
      file.entries.push(entry);
      file.file.entryCount++;
    }
  }

  /**
   * Remove a preference entry.
   */
  async removePreference(packageName: string, fileName: string, key: string): Promise<void> {
    this.recordOperation("removePreference", { packageName, fileName, key });

    const error = this.failureMode.get("removePreference");
    if (error) {
      throw error;
    }

    const data = this.preferenceFiles.get(packageName);
    if (!data) {
      return;
    }

    const file = data.find(d => d.file.name === fileName);
    if (!file) {
      return;
    }

    const index = file.entries.findIndex(e => e.key === key);
    if (index >= 0) {
      file.entries.splice(index, 1);
      file.file.entryCount--;
    }
  }

  /**
   * Clear all preferences in a file.
   */
  async clearPreferenceStore(packageName: string, fileName: string): Promise<void> {
    this.recordOperation("clearPreferenceStore", { packageName, fileName });

    const error = this.failureMode.get("clearPreferenceStore");
    if (error) {
      throw error;
    }

    const data = this.preferenceFiles.get(packageName);
    if (!data) {
      return;
    }

    const file = data.find(d => d.file.name === fileName);
    if (!file) {
      return;
    }

    file.entries = [];
    file.file.entryCount = 0;
  }

  // Test utility methods

  /**
   * Get all recorded operations.
   */
  getOperations(): RecordedStorageOperation[] {
    return [...this.operations];
  }

  /**
   * Get the history of listPreferenceFiles calls.
   */
  getListPreferenceFilesHistory(): Array<{ packageName: string }> {
    return this.operations
      .filter(op => op.method === "listPreferenceFiles")
      .map(op => ({ packageName: op.args.packageName as string }));
  }

  /**
   * Get the history of getPreferenceEntries calls.
   */
  getGetPreferenceEntriesHistory(): Array<{ packageName: string; fileName: string }> {
    return this.operations
      .filter(op => op.method === "getPreferenceEntries")
      .map(op => ({
        packageName: op.args.packageName as string,
        fileName: op.args.fileName as string,
      }));
  }

  /**
   * Get the history of subscribeStorage calls.
   */
  getSubscribeStorageHistory(): Array<{ packageName: string; fileName: string }> {
    return this.operations
      .filter(op => op.method === "subscribeStorage")
      .map(op => ({
        packageName: op.args.packageName as string,
        fileName: op.args.fileName as string,
      }));
  }

  /**
   * Get the history of unsubscribeStorage calls.
   */
  getUnsubscribeStorageHistory(): Array<{ subscriptionId: string }> {
    return this.operations
      .filter(op => op.method === "unsubscribeStorage")
      .map(op => ({ subscriptionId: op.args.subscriptionId as string }));
  }

  /**
   * Get the history of getPreference calls.
   */
  getGetPreferenceHistory(): Array<{ packageName: string; fileName: string; key: string }> {
    return this.operations
      .filter(op => op.method === "getPreference")
      .map(op => ({
        packageName: op.args.packageName as string,
        fileName: op.args.fileName as string,
        key: op.args.key as string,
      }));
  }

  /**
   * Get the history of setPreference calls.
   */
  getSetPreferenceHistory(): Array<{ packageName: string; fileName: string; key: string; value: string | null; type: KeyValueType }> {
    return this.operations
      .filter(op => op.method === "setPreference")
      .map(op => ({
        packageName: op.args.packageName as string,
        fileName: op.args.fileName as string,
        key: op.args.key as string,
        value: op.args.value as string | null,
        type: op.args.type as KeyValueType,
      }));
  }

  /**
   * Get the history of removePreference calls.
   */
  getRemovePreferenceHistory(): Array<{ packageName: string; fileName: string; key: string }> {
    return this.operations
      .filter(op => op.method === "removePreference")
      .map(op => ({
        packageName: op.args.packageName as string,
        fileName: op.args.fileName as string,
        key: op.args.key as string,
      }));
  }

  /**
   * Get the history of clearPreferenceStore calls.
   */
  getClearPreferenceStoreHistory(): Array<{ packageName: string; fileName: string }> {
    return this.operations
      .filter(op => op.method === "clearPreferenceStore")
      .map(op => ({
        packageName: op.args.packageName as string,
        fileName: op.args.fileName as string,
      }));
  }

  /**
   * Check if a specific method was called.
   */
  wasMethodCalled(method: string): boolean {
    return this.operations.some(op => op.method === method);
  }

  /**
   * Get count of times a method was called.
   */
  getMethodCallCount(method: string): number {
    return this.operations.filter(op => op.method === method).length;
  }

  /**
   * Get active subscriptions.
   */
  getActiveSubscriptions(): StorageSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Get the number of registered storage change listeners.
   */
  getStorageChangeListenerCount(): number {
    return this.storageChangeListeners.size;
  }

  /**
   * Clear all recorded operations.
   */
  clearOperations(): void {
    this.operations = [];
  }

  /**
   * Reset all state.
   */
  reset(): void {
    this.preferenceFiles.clear();
    this.operations = [];
    this.failureMode.clear();
    this.subscriptions.clear();
    this.subscriptionCounter = 0;
    this.storageChangeListeners.clear();
  }

  private recordOperation(method: string, args: Record<string, unknown>): void {
    this.operations.push({ method, args, timestamp: Date.now() });
  }
}
