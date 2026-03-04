import type { BootedDevice } from "../../models";
import type { VoiceOverResult } from "../../models/AccessibilityResult";
import type { IosVoiceOverDetector } from "../../utils/interfaces/IosVoiceOverDetector";
import { iosVoiceOverDetector } from "../../utils/IosVoiceOverDetector";
import type { ProcessExecutor } from "../../utils/ProcessExecutor";
import { DefaultProcessExecutor } from "../../utils/ProcessExecutor";

export class VoiceOverToggle {
  constructor(
    private readonly device: BootedDevice,
    private readonly detector: IosVoiceOverDetector = iosVoiceOverDetector,
    private readonly processExecutor: ProcessExecutor = new DefaultProcessExecutor()
  ) {}

  async toggle(enabled: boolean): Promise<VoiceOverResult> {
    if (!this.isSimulator()) {
      return {
        supported: false,
        applied: false,
        reason: "VoiceOver toggle is only supported on iOS Simulator"
      };
    }

    // Always run the simctl commands — they are idempotent and skipping them
    // based on a detection result is unsafe: IosVoiceOverDetector maps
    // detection failures to false, so a CtrlProxy outage would cause
    // toggle(false) to silently no-op when VoiceOver is actually on.
    const boolValue = enabled ? "YES" : "NO";
    await this.processExecutor.exec(
      `xcrun simctl spawn ${this.device.deviceId} defaults write com.apple.Accessibility VoiceOverTouchEnabled -bool ${boolValue}`
    );
    await this.processExecutor.exec(
      `xcrun simctl spawn ${this.device.deviceId} notifyutil -p com.apple.accessibility.VoiceOverStatusDidChange`
    );

    // Flush the detection cache so the next observe() reflects the new state.
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
