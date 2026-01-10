import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ActionableError, BootedDevice } from "../models";
import { addDeviceTargetingToSchema } from "./toolSchemaHelpers";
import { createJSONToolResponse } from "../utils/toolUtils";
import { startTestRecording, stopTestRecording } from "./testRecordingManager";

export interface StartTestRecordingArgs {
  platform: "android" | "ios";
  deviceId?: string;
  sessionUuid?: string;
  device?: string;
}

export interface StopTestRecordingArgs {
  recordingId?: string;
  planName?: string;
}

const startTestRecordingSchema = addDeviceTargetingToSchema(
  z.object({
    platform: z.enum(["android", "ios"]).describe("Target platform"),
    deviceId: z.string().optional().describe("Optional device ID override"),
  })
);

const stopTestRecordingSchema = z.object({
  recordingId: z.string().optional().describe("Recording ID to stop (defaults to active recording)"),
  planName: z.string().optional().describe("Optional plan name for the generated YAML"),
});

export function registerTestRecordingTools(): void {
  const startHandler = async (device: BootedDevice) => {
    try {
      const result = await startTestRecording(device);
      return createJSONToolResponse({
        message: `Started test recording ${result.recordingId}`,
        ...result,
      });
    } catch (error) {
      throw new ActionableError(`Failed to start test recording: ${error}`);
    }
  };

  const stopHandler = async (args: StopTestRecordingArgs) => {
    try {
      const result = await stopTestRecording(args.recordingId, args.planName);
      return createJSONToolResponse({
        message: `Stopped test recording ${result.recordingId}`,
        ...result,
      });
    } catch (error) {
      throw new ActionableError(`Failed to stop test recording: ${error}`);
    }
  };

  ToolRegistry.registerDeviceAware(
    "startTestRecording",
    "Start recording on-device interactions for a YAML test plan.",
    startTestRecordingSchema,
    startHandler
  );

  ToolRegistry.register(
    "stopTestRecording",
    "Stop an active test recording and return the generated YAML plan.",
    stopTestRecordingSchema,
    stopHandler
  );
}
