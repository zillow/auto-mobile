import type { IosVoiceOverDetector } from "../../src/utils/interfaces/IosVoiceOverDetector";
import type { CtrlProxyService } from "../../src/features/observe/ios/CtrlProxyClient";
import type { FeatureFlagService } from "../../src/features/featureFlags/FeatureFlagService";

/**
 * Fake implementation of IosVoiceOverDetector for testing.
 * Allows configuring VoiceOver state without real device interaction.
 */
export class FakeIosVoiceOverDetector implements IosVoiceOverDetector {
  private voiceOverEnabled: boolean = false;
  private callCount: number = 0;
  private invalidatedDevices: string[] = [];

  /**
   * Configure VoiceOver enabled state for all devices
   */
  setVoiceOverEnabled(enabled: boolean): void {
    this.voiceOverEnabled = enabled;
  }

  /**
   * Get the number of times isVoiceOverEnabled was called
   */
  getCallCount(): number {
    return this.callCount;
  }

  /**
   * Get the list of devices that had their cache invalidated
   */
  getInvalidatedDevices(): string[] {
    return [...this.invalidatedDevices];
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.voiceOverEnabled = false;
    this.callCount = 0;
    this.invalidatedDevices = [];
  }

  async isVoiceOverEnabled(
    _deviceId: string,
    _client: CtrlProxyService,
    _featureFlags?: FeatureFlagService
  ): Promise<boolean> {
    this.callCount++;
    return this.voiceOverEnabled;
  }

  invalidateCache(deviceId: string): void {
    this.invalidatedDevices.push(deviceId);
  }

  clearAllCache(): void {
    this.invalidatedDevices = [];
  }
}
