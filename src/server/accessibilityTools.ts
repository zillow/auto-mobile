import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import type { ProgressCallback } from "./toolRegistry";
import { ActionableError, BootedDevice } from "../models";
import { createStructuredToolResponse } from "../utils/toolUtils";
import { addDeviceTargetingToSchema } from "./toolSchemaHelpers";
import { TalkBackToggle } from "../features/accessibility/TalkBackToggle";
import { VoiceOverToggle } from "../features/accessibility/VoiceOverToggle";
import { FeatureFlagService } from "../features/featureFlags/FeatureFlagService";
import { accessibilityDetector } from "../utils/AccessibilityDetector";
import { iosVoiceOverDetector } from "../utils/IosVoiceOverDetector";
import { CtrlProxyClient as IOSCtrlProxyClient } from "../features/observe/ios/CtrlProxyClient";
import { defaultAdbClientFactory } from "../utils/android-cmdline-tools/AdbClientFactory";
import { logger } from "../utils/logger";
import { accessibilityStateSchema } from "./toolOutputSchemas";

export const accessibilitySchema = addDeviceTargetingToSchema(
  z.object({
    talkback: z
      .boolean()
      .optional()
      .describe(
        "Enable (true) or disable (false) TalkBack on the active Android device"
      ),
    voiceover: z
      .boolean()
      .optional()
      .describe(
        "Enable (true) or disable (false) VoiceOver on iOS Simulator"
      )
  })
);

export interface AccessibilityArgs {
  talkback?: boolean;
  voiceover?: boolean;
}

export function registerAccessibilityTools() {
  const accessibilityHandler = async (
    device: BootedDevice,
    args: AccessibilityArgs,
    _progress?: ProgressCallback
  ) => {
    if (device.platform === "android") {
      if (args.voiceover !== undefined) {
        throw new ActionableError("VoiceOver is not supported on Android devices");
      }
      if (args.talkback !== undefined) {
        try {
          const toggle = new TalkBackToggle(device);
          const talkback = await toggle.toggle(args.talkback);
          if (!talkback.supported) {
            throw new ActionableError(talkback.reason ?? "TalkBack toggle is not supported on this device");
          }
          const enabled = talkback.currentState ?? false;
          const service = enabled ? "talkback" as const : "unknown" as const;
          return createStructuredToolResponse({ enabled, service });
        } catch (error) {
          throw error instanceof ActionableError ? error : new ActionableError(`Failed to toggle accessibility services: ${error}`);
        }
      }

      // Detect current TalkBack state on Android
      accessibilityDetector.invalidateCache(device.deviceId);
      const adb = defaultAdbClientFactory.create(device);
      const featureFlags = FeatureFlagService.getInstance();
      const enabled = await accessibilityDetector.isAccessibilityEnabled(device.deviceId, adb, featureFlags);
      const service = await accessibilityDetector.detectMethod(device.deviceId, adb, featureFlags);
      logger.debug(`[accessibility tool] TalkBack state: enabled=${enabled}, service=${service}`);
      return createStructuredToolResponse({ enabled, service });
    }

    if (device.platform === "ios") {
      if (args.talkback !== undefined) {
        throw new ActionableError("TalkBack is not supported on iOS devices");
      }
      if (args.voiceover !== undefined) {
        const toggle = new VoiceOverToggle(device);
        const voiceover = await toggle.toggle(args.voiceover);
        if (!voiceover.supported) {
          throw new ActionableError(voiceover.reason ?? "VoiceOver toggle is not supported on this device");
        }
        const enabled = voiceover.currentState ?? false;
        const service = enabled ? "voiceover" as const : "unknown" as const;
        return createStructuredToolResponse({ enabled, service });
      }

      // Detect current VoiceOver state on iOS
      iosVoiceOverDetector.invalidateCache(device.deviceId);
      const client = IOSCtrlProxyClient.getInstance(device);
      const featureFlags = FeatureFlagService.getInstance();
      const enabled = await iosVoiceOverDetector.isVoiceOverEnabled(device.deviceId, client, featureFlags);
      const service = enabled ? "voiceover" as const : "unknown" as const;
      logger.debug(`[accessibility tool] VoiceOver state: enabled=${enabled}`);
      return createStructuredToolResponse({ enabled, service });
    }

    throw new ActionableError(`Unsupported platform: ${device.platform}`);
  };

  ToolRegistry.registerDeviceAware(
    "accessibility",
    "Check or control accessibility services. On Android: omit talkback to check TalkBack state, or pass talkback: true/false to enable/disable it. On iOS: omit voiceover to check VoiceOver state, or pass voiceover: true/false to enable/disable it (Simulator only). Always returns fresh state from the device.",
    accessibilitySchema,
    accessibilityHandler,
    false,
    false,
    { outputSchema: accessibilityStateSchema }
  );
}
