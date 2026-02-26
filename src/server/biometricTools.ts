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
  action: z.enum(["match", "fail", "cancel", "error"]).describe(
    "Biometric action: 'match' triggers successful authentication, 'fail' simulates a non-matching biometric, " +
    "'cancel' cancels the prompt, 'error' injects a hard error (requires AutoMobileBiometrics SDK integration in the app)."
  ),
  modality: z.enum(["any", "fingerprint", "face"]).optional().describe(
    "Biometric modality (default: 'any'). Currently only 'fingerprint' is reliably supported on Android emulators. 'face' is not consistently supported."
  ),
  fingerprintId: z.number().optional().describe(
    "Fingerprint ID to simulate (default: 1 for 'match'/'error', 2 for 'fail'/'cancel'). Use enrolled ID (typically 1) for match/error, non-enrolled ID (typically 2) for fail/cancel."
  ),
  errorCode: z.number().optional().describe(
    "BiometricPrompt error code to inject (e.g. 7 for ERROR_LOCKOUT, 1 for ERROR_HW_UNAVAILABLE). Only valid when action is 'error'; providing it with any other action is a validation error."
  ),
  ttlMs: z.number().optional().describe(
    "How long the SDK override remains active in milliseconds (default: 5000). The override is cleared after the first authentication callback or when the TTL expires."
  )
}).refine(
  (data) => data.errorCode === undefined || data.action === "error",
  { message: "errorCode is only applicable when action is 'error'", path: ["errorCode"] }
));

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
        fingerprintId: args.fingerprintId,
        errorCode: args.errorCode,
        ttlMs: args.ttlMs
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
    "Simulate biometric authentication (fingerprint) on Android emulators, or inject a deterministic result via the AutoMobile SDK on any device. " +
    "Supports match/fail/cancel/error actions. The SDK broadcast path requires the app to integrate AutoMobileBiometrics.consumeOverride().",
    biometricAuthSchema,
    biometricAuthHandler,
    true // Supports progress notifications
  );
}
