import { ObserveResult } from "./ObserveResult";

/**
 * Result of a biometric authentication action
 */
export interface BiometricAuthResult {
  success: boolean;
  action: "match" | "fail" | "cancel" | "error";
  modality: "any" | "fingerprint" | "face";
  fingerprintId?: number;
  errorCode?: number;
  supported: boolean | "partial";
  observation?: ObserveResult;
  error?: string;
  message?: string;
}
