import { logger } from "../../utils/logger";
import type { BootedDevice } from "../../models";
import type { TalkBackResult } from "../../models/AccessibilityResult";
import type { AdbExecutor } from "../../utils/android-cmdline-tools/interfaces/AdbExecutor";
import { defaultAdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import type { AccessibilityDetector } from "../../utils/interfaces/AccessibilityDetector";
import { accessibilityDetector } from "../../utils/AccessibilityDetector";
import { type Timer, defaultTimer } from "../../utils/SystemTimer";

const TALKBACK_PACKAGE = "com.google.android.marvin.talkback";
const TALKBACK_SERVICE_FALLBACK = `${TALKBACK_PACKAGE}/${TALKBACK_PACKAGE}.TalkBackService`;
const DIALOG_DISMISS_RETRIES = 3;
const DIALOG_DISMISS_DELAY_MS = 500;

export class TalkBackToggle {
  private readonly adb: AdbExecutor;

  constructor(
    private readonly device: BootedDevice,
    adb: AdbExecutor | null = null,
    private readonly detector: AccessibilityDetector = accessibilityDetector,
    private readonly timer: Timer = defaultTimer
  ) {
    this.adb = adb ?? defaultAdbClientFactory.create(device);
  }

  async toggle(enabled: boolean): Promise<TalkBackResult> {
    // Step 1: Verify TalkBack is installed on this device
    const serviceComponent = await this.detectInstalledService();
    if (!serviceComponent) {
      return {
        supported: false,
        applied: false,
        reason: "TalkBack service not installed on this device"
      };
    }

    // Step 2: Idempotency — invalidate stale cache, then check if TalkBack is
    // already in the requested state.  Use detectMethod rather than
    // isAccessibilityEnabled so that other active services (e.g. CtrlProxy)
    // do not cause a false positive.
    this.detector.invalidateCache(this.device.deviceId);
    const detectedService = await this.detector.detectMethod(
      this.device.deviceId,
      this.adb
    );
    const talkBackCurrentlyEnabled = detectedService === "talkback";
    if (talkBackCurrentlyEnabled === enabled) {
      return {
        supported: true,
        applied: false,
        currentState: enabled
      };
    }

    // Step 3: Apply ADB commands
    if (enabled) {
      await this.enableTalkBack(serviceComponent);
      // Step 4: Best-effort permission dialog dismissal
      await this.dismissPermissionDialog();
    } else {
      await this.disableTalkBack();
    }

    // Step 5: Invalidate detection cache so next check reflects the new state
    this.detector.invalidateCache(this.device.deviceId);

    return {
      supported: true,
      applied: true,
      currentState: enabled
    };
  }

  /**
   * Add TalkBack to the enabled services list while preserving any other
   * active accessibility services (e.g. CtrlProxy).
   */
  private async enableTalkBack(serviceComponent: string): Promise<void> {
    const result = await this.adb.executeCommand(
      "shell settings get secure enabled_accessibility_services"
    );
    const currentServices = result.stdout.trim();

    const otherServices: string[] = [];
    if (currentServices && currentServices !== "null") {
      for (const s of currentServices.split(":")) {
        const trimmed = s.trim();
        if (trimmed && !trimmed.includes(TALKBACK_PACKAGE) && !trimmed.includes("TalkBackService")) {
          otherServices.push(trimmed);
        }
      }
    }

    const updatedServices = [...otherServices, serviceComponent].join(":");
    await this.adb.executeCommand(
      `shell settings put secure enabled_accessibility_services ${updatedServices}`
    );
    await this.adb.executeCommand(
      "shell settings put secure accessibility_enabled 1"
    );
  }

  /**
   * Remove TalkBack from the enabled services list while preserving any other
   * active accessibility services (e.g. CtrlProxy).  Only clears the master
   * accessibility_enabled flag when no other services remain.
   */
  private async disableTalkBack(): Promise<void> {
    const result = await this.adb.executeCommand(
      "shell settings get secure enabled_accessibility_services"
    );
    const currentServices = result.stdout.trim();

    const otherServices: string[] = [];
    if (currentServices && currentServices !== "null") {
      for (const s of currentServices.split(":")) {
        const trimmed = s.trim();
        if (trimmed && !trimmed.includes(TALKBACK_PACKAGE) && !trimmed.includes("TalkBackService")) {
          otherServices.push(trimmed);
        }
      }
    }

    if (otherServices.length === 0) {
      await this.adb.executeCommand(
        "shell settings delete secure enabled_accessibility_services"
      );
      await this.adb.executeCommand(
        "shell settings put secure accessibility_enabled 0"
      );
    } else {
      // Other services are still active — update the list without TalkBack
      // and leave accessibility_enabled at 1
      await this.adb.executeCommand(
        `shell settings put secure enabled_accessibility_services ${otherServices.join(":")}`
      );
    }
  }

  /**
   * Run `dumpsys accessibility` to check whether TalkBack is installed on the
   * device.  Returns the full service component name to use in settings commands,
   * or null if TalkBack is not present.
   */
  private async detectInstalledService(): Promise<string | null> {
    try {
      const result = await this.adb.executeCommand("shell dumpsys accessibility");
      const output = result.stdout;

      if (!output.includes(TALKBACK_PACKAGE) && !output.includes("TalkBackService")) {
        logger.debug("[TalkBackToggle] TalkBack not found in dumpsys output");
        return null;
      }

      // Prefer extracting the exact component name from the dump
      const match = /com\.google\.android\.marvin\.talkback\/[\w.]+TalkBackService/.exec(output);
      if (match) {
        logger.debug(`[TalkBackToggle] Detected service component: ${match[0]}`);
        return match[0];
      }

      // Package found but component name could not be parsed — use known fallback
      logger.debug("[TalkBackToggle] Using hardcoded TalkBack service component name");
      return TALKBACK_SERVICE_FALLBACK;
    } catch (error) {
      logger.error("[TalkBackToggle] Failed to detect TalkBack service via dumpsys:", error);
      return null;
    }
  }

  /**
   * After enabling TalkBack, Android shows a permission dialog that must be
   * accepted before automation can continue.  Check immediately (no initial
   * delay), then retry with delays to allow the dialog time to appear.
   * Match the positive button by resource-id for locale independence.
   */
  private async dismissPermissionDialog(): Promise<void> {
    for (let attempt = 0; attempt < DIALOG_DISMISS_RETRIES; attempt++) {
      if (attempt > 0) {
        await this.timer.sleep(DIALOG_DISMISS_DELAY_MS);
      }
      try {
        const dumpResult = await this.adb.executeCommand(
          "shell uiautomator dump /dev/tty"
        );
        const xml = dumpResult.stdout;

        // Match by resource-id rather than text to support non-English locales
        const nodeMatch = /<node[^>]*resource-id="android:id\/button1"[^>]*\/?>/.exec(xml);
        if (nodeMatch) {
          const boundsMatch = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(
            nodeMatch[0]
          );
          if (boundsMatch) {
            const x = Math.round(
              (parseInt(boundsMatch[1], 10) + parseInt(boundsMatch[3], 10)) / 2
            );
            const y = Math.round(
              (parseInt(boundsMatch[2], 10) + parseInt(boundsMatch[4], 10)) / 2
            );
            await this.adb.executeCommand(`shell input tap ${x} ${y}`);
            logger.debug("[TalkBackToggle] Dismissed TalkBack permission dialog");
            return;
          }
        }
      } catch (error) {
        logger.debug(
          `[TalkBackToggle] Dialog dismissal attempt ${attempt + 1} failed:`,
          error
        );
      }
    }
    logger.warn("[TalkBackToggle] TalkBack permission dialog not found — continuing");
  }
}
