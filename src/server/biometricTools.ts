import { z } from "zod";
import { ToolRegistry, ProgressCallback } from "./toolRegistry";
import { BiometricAuth, BiometricAuthOptions } from "../features/action/BiometricAuth";
import { ActionableError, BootedDevice } from "../models";
import { createJSONToolResponse } from "../utils/toolUtils";
import { addDeviceTargetingToSchema } from "./toolSchemaHelpers";

// Type definitions for better TypeScript support
export interface BiometricAuthArgs extends BiometricAuthOptions {
  // Device targeting fields are added by addDeviceTargetingToSchema
}

// Schema definition
export const biometricAuthSchema = addDeviceTargetingToSchema(z.object({
  action: z.enum(["match", "fail", "cancel"]).describe(
    "Biometric action: 'match' triggers successful authentication, 'fail' simulates non-matching biometric, 'cancel' cancels the prompt"
  ),
  modality: z.enum(["any", "fingerprint", "face"]).optional().describe(
    "Biometric modality (default: 'any'). Currently only 'fingerprint' is reliably supported on Android emulators. 'face' is not consistently supported."
  ),
  fingerprintId: z.number().optional().describe(
    "Fingerprint ID to simulate (default: 1 for 'match', 2 for 'fail'). Use enrolled ID (typically 1) for match, non-enrolled ID (typically 2) for fail."
  )
}));

/**
 * Register biometric authentication tools
 */
export function registerBiometricTools() {
  // Biometric auth handler
  const biometricAuthHandler = async (
    device: BootedDevice,
    args: BiometricAuthArgs,
    progress?: ProgressCallback
  ) => {
    try {
      const biometricAuth = new BiometricAuth(device);
      const result = await biometricAuth.execute({
        action: args.action,
        modality: args.modality,
        fingerprintId: args.fingerprintId
      }, progress);

      if (!result.success) {
        throw new ActionableError(result.error || `Failed to execute biometric ${args.action}`);
      }

      return createJSONToolResponse({
        message: result.message || `Biometric ${args.action} executed`,
        observation: result.observation,
        ...result
      });
    } catch (error) {
      throw new ActionableError(`Failed to execute biometric authentication: ${error}`);
    }
  };

  // Register the tool
  ToolRegistry.registerDeviceAware(
    "biometricAuth",
    "Simulate biometric authentication (fingerprint) on Android emulators. Trigger match/fail/cancel actions for testing biometric prompts.",
    biometricAuthSchema,
    biometricAuthHandler,
    true // Supports progress notifications
  );
}
