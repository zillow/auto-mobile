import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import type { ProgressCallback } from "./toolRegistry";
import { ActionableError, BootedDevice } from "../models";
import { createJSONToolResponse } from "../utils/toolUtils";
import { addDeviceTargetingToSchema } from "./toolSchemaHelpers";
import { TalkBackToggle } from "../features/accessibility/TalkBackToggle";
import type { AccessibilityResult } from "../models/AccessibilityResult";

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
    if (device.platform !== "android") {
      throw new ActionableError(
        "The accessibility tool currently only supports Android. iOS VoiceOver support is planned."
      );
    }

    const result: AccessibilityResult = {};

    if (args.talkback !== undefined) {
      const toggle = new TalkBackToggle(device);
      result.talkback = await toggle.toggle(args.talkback);
    }

    return createJSONToolResponse(result);
  };

  ToolRegistry.registerDeviceAware(
    "accessibility",
    "Enable or disable accessibility services on the active device. Supports TalkBack on Android (talkback: true/false). Reports whether the operation was supported and applied.",
    accessibilitySchema,
    accessibilityHandler
  );
}
