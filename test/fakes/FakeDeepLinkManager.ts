import {
  DeepLinkResult,
  IntentChooserResult,
  ViewHierarchyResult,
  BootedDevice
} from "../../src/models";
import { DeepLinkManager } from "../../src/utils/DeepLinkManager";

/**
 * Fake implementation of DeepLinkManager for testing
 * Allows configuring deep link responses and asserting method calls
 */
export class FakeDeepLinkManager implements DeepLinkManager {
  private configuredDeepLinks: Map<string, DeepLinkResult> = new Map();
  private configuredIntentChooserResponses: Map<string, IntentChooserResult> = new Map();
  private executedOperations: string[] = [];
  private currentDevice: BootedDevice | null = null;
  private defaultIntentChooserDetected: boolean = false;

  /**
   * Configure deep link response for a specific app
   * @param appId - The application package ID
   * @param result - The deep link result to return
   */
  setDeepLinksForApp(appId: string, result: DeepLinkResult): void {
    this.configuredDeepLinks.set(appId, result);
  }

  /**
   * Configure intent chooser response
   * @param key - Unique key for this response configuration
   * @param result - The intent chooser result to return
   */
  setIntentChooserResponse(key: string, result: IntentChooserResult): void {
    this.configuredIntentChooserResponses.set(key, result);
  }

  /**
   * Set whether intent chooser should be detected by default
   * @param detected - True if intent chooser should be detected
   */
  setDefaultIntentChooserDetected(detected: boolean): void {
    this.defaultIntentChooserDetected = detected;
  }

  /**
   * Get history of executed operations (for test assertions)
   * @returns Array of operation strings that were executed
   */
  getExecutedOperations(): string[] {
    return [...this.executedOperations];
  }

  /**
   * Check if a specific method was called
   * @param operationName - Name of the operation to check
   * @returns true if the operation was called at least once
   */
  wasMethodCalled(operationName: string): boolean {
    return this.executedOperations.some(op => op.includes(operationName));
  }

  /**
   * Get count of times a specific method was called
   * @param operationName - Name of the operation to count
   * @returns Number of times the operation was called
   */
  getCallCount(operationName: string): number {
    return this.executedOperations.filter(op => op.includes(operationName)).length;
  }

  /**
   * Clear operation history
   */
  clearHistory(): void {
    this.executedOperations = [];
  }

  /**
   * Get the current device that was set
   */
  getCurrentDevice(): BootedDevice | null {
    return this.currentDevice;
  }

  // Implementation of DeepLinkManager interface

  setDeviceId(device: BootedDevice): void {
    this.executedOperations.push(`setDeviceId:${device.deviceId}`);
    this.currentDevice = device;
  }

  async getDeepLinks(appId: string): Promise<DeepLinkResult> {
    this.executedOperations.push(`getDeepLinks:${appId}`);

    // Return configured result if exists
    if (this.configuredDeepLinks.has(appId)) {
      return this.configuredDeepLinks.get(appId)!;
    }

    // Return default empty response
    return {
      success: true,
      appId,
      deepLinks: {
        schemes: [],
        hosts: [],
        intentFilters: [],
        supportedMimeTypes: []
      }
    };
  }

  detectIntentChooser(viewHierarchy: ViewHierarchyResult): boolean {
    this.executedOperations.push("detectIntentChooser");
    return this.defaultIntentChooserDetected;
  }

  async handleIntentChooser(
    viewHierarchy: ViewHierarchyResult,
    preference: "always" | "just_once" | "custom" = "just_once",
    customAppPackage?: string
  ): Promise<IntentChooserResult> {
    const key = `${preference}:${customAppPackage || "none"}`;
    this.executedOperations.push(`handleIntentChooser:${key}`);

    // Return configured result if exists
    if (this.configuredIntentChooserResponses.has(key)) {
      return this.configuredIntentChooserResponses.get(key)!;
    }

    // Return default response based on whether intent chooser is detected
    if (this.defaultIntentChooserDetected) {
      return {
        success: true,
        detected: true,
        action: preference,
        appSelected: customAppPackage
      };
    } else {
      return {
        success: true,
        detected: false
      };
    }
  }
}
