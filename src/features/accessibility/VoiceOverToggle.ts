import type { BootedDevice } from "../../models";
import type { VoiceOverResult } from "../../models/AccessibilityResult";
import type { IosVoiceOverDetector } from "../../utils/interfaces/IosVoiceOverDetector";
import { iosVoiceOverDetector } from "../../utils/IosVoiceOverDetector";
import type { ProcessExecutor } from "../../utils/ProcessExecutor";
import { DefaultProcessExecutor } from "../../utils/ProcessExecutor";
import { CtrlProxyClient as IOSCtrlProxyClient } from "../observe/ios/CtrlProxyClient";
import type { CtrlProxyService } from "../observe/ios/CtrlProxyClient";

export class VoiceOverToggle {
  private readonly ctrlProxyService: CtrlProxyService;

  constructor(
    private readonly device: BootedDevice,
    private readonly detector: IosVoiceOverDetector = iosVoiceOverDetector,
    ctrlProxyService: CtrlProxyService | null = null,
    private readonly processExecutor: ProcessExecutor = new DefaultProcessExecutor()
  ) {
    this.ctrlProxyService = ctrlProxyService ?? IOSCtrlProxyClient.getInstance(device);
  }

  async toggle(enabled: boolean): Promise<VoiceOverResult> {
    if (!this.isSimulator()) {
      return {
        supported: false,
        applied: false,
        reason: "VoiceOver toggle is only supported on iOS Simulator"
      };
    }

    this.detector.invalidateCache(this.device.deviceId);
    const currentlyEnabled = await this.detector.isVoiceOverEnabled(
      this.device.deviceId,
      this.ctrlProxyService
    );

    if (currentlyEnabled === enabled) {
      return {
        supported: true,
        applied: false,
        currentState: enabled
      };
    }

    const boolValue = enabled ? "YES" : "NO";
    await this.processExecutor.exec(
      `xcrun simctl spawn ${this.device.deviceId} defaults write com.apple.Accessibility VoiceOverTouchEnabled -bool ${boolValue}`
    );
    await this.processExecutor.exec(
      `xcrun simctl spawn ${this.device.deviceId} notifyutil -p com.apple.accessibility.VoiceOverStatusDidChange`
    );

    this.detector.invalidateCache(this.device.deviceId);

    return {
      supported: true,
      applied: true,
      currentState: enabled
    };
  }

  private isSimulator(): boolean {
    return /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(
      this.device.deviceId
    );
  }
}
