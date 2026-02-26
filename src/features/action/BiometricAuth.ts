import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, BiometricAuthResult } from "../../models";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";
import { logger } from "../../utils/logger";
import { Timer, defaultTimer } from "../../utils/SystemTimer";

export interface BiometricAuthOptions {
  action: "match" | "fail" | "cancel" | "error";
  modality?: "any" | "fingerprint" | "face";
  fingerprintId?: number;
  errorCode?: number;
  ttlMs?: number;
}

/** Broadcast action received by AutoMobileBiometrics in the app-under-test SDK. */
const SDK_BROADCAST_ACTION = "dev.jasonpearson.automobile.sdk.BIOMETRIC_OVERRIDE";

/** Default TTL for SDK overrides in milliseconds. */
const DEFAULT_TTL_MS = 5000;

export class BiometricAuth extends BaseVisualChange {
  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null,
    timer: Timer = defaultTimer
  ) {
    super(device, adb, timer);
    this.device = device;
  }

  async execute(
    options: BiometricAuthOptions,
    progress?: ProgressCallback
  ): Promise<BiometricAuthResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("biometricAuth");

    // Only Android is supported
    if (this.device.platform !== "android") {
      perf.end();
      return {
        success: false,
        action: options.action,
        modality: options.modality ?? "any",
        fingerprintId: options.fingerprintId,
        errorCode: options.errorCode,
        supported: false,
        error: "Biometric authentication is only supported on Android devices"
      };
    }

    // Check modality before capability check (fail fast)
    const modality = options.modality ?? "any";
    if (modality === "face") {
      perf.end();
      return {
        success: false,
        action: options.action,
        modality,
        fingerprintId: options.fingerprintId,
        errorCode: options.errorCode,
        supported: false,
        error: "Face biometric modality is not supported. Only 'any' and 'fingerprint' are supported on Android emulators."
      };
    }

    // Send SDK override broadcast (works on emulators and physical devices)
    const broadcastOk = await this.sendSdkOverrideBroadcast(options);
    if (!broadcastOk) {
      logger.warn("SDK override broadcast failed; app may not have AutoMobileBiometrics integrated");
    }

    // Check if device is an emulator
    const capabilityResult = await this.checkCapability();

    if (!capabilityResult.isEmulator) {
      perf.end();
      if (!broadcastOk) {
        return {
          success: false,
          action: options.action,
          modality,
          fingerprintId: options.fingerprintId,
          errorCode: options.errorCode,
          supported: "partial",
          error:
            "SDK override broadcast failed; verify the app has AutoMobileBiometrics integrated and ADB is connected."
        };
      }
      return {
        success: true,
        action: options.action,
        modality,
        fingerprintId: options.fingerprintId,
        errorCode: options.errorCode,
        supported: "partial",
        message:
          "SDK override broadcast sent. Emulator emu finger commands are not available on physical devices. " +
          "Ensure the app integrates AutoMobileBiometrics.consumeOverride() in its BiometricPrompt.AuthenticationCallback."
      };
    }

    if (!capabilityResult.supportsEmuFinger) {
      perf.end();
      return {
        success: false,
        action: options.action,
        modality,
        fingerprintId: options.fingerprintId,
        errorCode: options.errorCode,
        supported: false,
        error: "This emulator does not support 'emu finger' commands"
      };
    }

    return this.observedInteraction(
      async () => {
        const result = await perf.track("executeBiometricAction", () =>
          this.executeBiometricAction(options)
        );
        return result;
      },
      {
        changeExpected: false,
        timeoutMs: 5000,
        progress,
        perf
      }
    );
  }

  /**
   * Send an ADB broadcast that AutoMobileBiometrics (in the app-under-test) will receive
   * and use to override the next biometric callback result.
   *
   * Returns true if the broadcast command succeeded, false on error.
   */
  private async sendSdkOverrideBroadcast(options: BiometricAuthOptions): Promise<boolean> {
    try {
      if (options.action === "error" && options.errorCode === undefined) {
        logger.warn(
          "action 'error' sent without errorCode; app will receive BiometricResult.Error(-1) " +
          "which is not a valid BiometricPrompt.ERROR_* constant (valid values start at 1)"
        );
      }

      const resultValue = this.actionToSdkResult(options.action);
      const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

      let cmd =
        `shell am broadcast -a ${SDK_BROADCAST_ACTION}` +
        ` --es result ${resultValue}` +
        ` --el ttlMs ${ttlMs}`;

      if (options.action === "error" && options.errorCode !== undefined) {
        cmd += ` --ei errorCode ${options.errorCode}`;
      }

      await this.adb.executeCommand(cmd);
      return true;
    } catch (error) {
      logger.warn(`Failed to send SDK biometric override broadcast: ${error}`);
      return false;
    }
  }

  /** Map MCP action name to the string expected by AutoMobileBiometrics broadcast receiver. */
  private actionToSdkResult(action: BiometricAuthOptions["action"]): string {
    switch (action) {
      case "match":  return "SUCCESS";
      case "fail":   return "FAILURE";
      case "cancel": return "CANCEL";
      case "error":  return "ERROR";
    }
  }

  /**
   * Check if the device is an emulator and supports emu finger commands
   */
  private async checkCapability(): Promise<{ isEmulator: boolean; supportsEmuFinger: boolean }> {
    try {
      const qemuResult = await this.adb.executeCommand("shell getprop ro.kernel.qemu");
      const isEmulator = qemuResult.trim() === "1";

      if (!isEmulator) {
        return { isEmulator: false, supportsEmuFinger: false };
      }

      try {
        const emuHelpResult = await this.adb.executeCommand("emu help");
        const supportsEmuFinger = emuHelpResult.includes("finger");
        return { isEmulator: true, supportsEmuFinger };
      } catch (error) {
        logger.warn("Failed to check emu help:", error);
        return { isEmulator: true, supportsEmuFinger: false };
      }
    } catch (error) {
      logger.warn("Failed to check device capability:", error);
      return { isEmulator: false, supportsEmuFinger: false };
    }
  }

  /**
   * Execute the biometric action via emu finger commands.
   *
   * For match:  touch enrolled ID 1  → onAuthenticationSucceeded
   * For fail:   touch unenrolled ID 2 → onAuthenticationFailed
   * For cancel: touch unenrolled ID 2 → onAuthenticationFailed (override converts to cancel)
   * For error:  touch enrolled ID 1   → onAuthenticationSucceeded (override converts to error)
   */
  private async executeBiometricAction(options: BiometricAuthOptions): Promise<BiometricAuthResult> {
    const modality: "any" | "fingerprint" | "face" = options.modality ?? "any";

    // Determine fingerprint ID
    let fingerprintId = options.fingerprintId;
    if (fingerprintId === undefined) {
      // match and error use enrolled ID 1 to reliably trigger the success callback;
      // fail and cancel use unenrolled ID 2.
      fingerprintId = (options.action === "match" || options.action === "error") ? 1 : 2;
    }

    try {
      const touchResult = await this.adb.executeCommand(`emu finger touch ${fingerprintId}`);

      if (touchResult.stderr && touchResult.stderr.trim().length > 0) {
        return {
          success: false,
          action: options.action,
          modality,
          fingerprintId,
          errorCode: options.errorCode,
          supported: true,
          error: `emu finger touch failed: ${touchResult.stderr}`
        };
      }

      await this.timer.sleep(100);

      const removeResult = await this.adb.executeCommand(`emu finger remove ${fingerprintId}`);

      if (removeResult.stderr && removeResult.stderr.trim().length > 0) {
        return {
          success: false,
          action: options.action,
          modality,
          fingerprintId,
          errorCode: options.errorCode,
          supported: true,
          error: `emu finger remove failed: ${removeResult.stderr}`
        };
      }

      return this.buildSuccessResult(options, modality, fingerprintId);
    } catch (error) {
      logger.error(`Failed to execute biometric action: ${error}`);
      return {
        success: false,
        action: options.action,
        modality,
        fingerprintId,
        errorCode: options.errorCode,
        supported: true,
        error: `Failed to execute emu finger commands: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private buildSuccessResult(
    options: BiometricAuthOptions,
    modality: "any" | "fingerprint" | "face",
    fingerprintId: number
  ): BiometricAuthResult {
    const base = {
      success: true,
      action: options.action,
      modality,
      fingerprintId,
      errorCode: options.errorCode,
      supported: true as const
    };

    switch (options.action) {
      case "fail":
        return {
          ...base,
          message: `Simulated biometric ${options.action} with fingerprint ID ${fingerprintId}. Note: Some emulators may not differentiate between enrolled and non-enrolled fingerprint IDs.`
        };
      case "cancel":
        return {
          ...base,
          message: `Biometric cancellation dispatched (fingerprint ID ${fingerprintId}).`
        };
      case "error":
        return {
          ...base,
          message:
            `SDK override broadcast sent with ERROR (errorCode=${options.errorCode ?? -1}) and emu finger touch ${fingerprintId} fired. ` +
            `App must call AutoMobileBiometrics.consumeOverride() in its BiometricPrompt.AuthenticationCallback.`
        };
      default:
        return {
          ...base,
          message: `Successfully simulated biometric ${options.action} with fingerprint ID ${fingerprintId}`
        };
    }
  }
}
