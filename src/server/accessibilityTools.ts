import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import type { ProgressCallback } from "./toolRegistry";
import { ActionableError, BootedDevice } from "../models";
import { createJSONToolResponse, createStructuredToolResponse } from "../utils/toolUtils";
import { addDeviceTargetingToSchema } from "./toolSchemaHelpers";
import { TalkBackToggle } from "../features/accessibility/TalkBackToggle";
import type { AccessibilityResult } from "../models/AccessibilityResult";
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
      )
  })
);

export interface AccessibilityArgs {
  talkback?: boolean;
}

export function registerAccessibilityTools() {
  const accessibilityHandler = async (
    device: BootedDevice,
    args: AccessibilityArgs,
    _progress?: ProgressCallback
  ) => {
    if (device.platform === "android") {
      if (args.talkback !== undefined) {
        // Toggle TalkBack on Android
        const result: AccessibilityResult = {};
        const toggle = new TalkBackToggle(device);
        result.talkback = await toggle.toggle(args.talkback);
        return createJSONToolResponse(result);
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
    "Check or control accessibility services. On Android: omit talkback to check TalkBack state, or pass talkback: true/false to enable/disable it. On iOS: checks VoiceOver state. Always returns fresh state from the device.",
    accessibilitySchema,
    accessibilityHandler,
    false,
    false,
    { outputSchema: accessibilityStateSchema }
  );
}
