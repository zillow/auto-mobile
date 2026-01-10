import { ObserveResult } from "./ObserveResult";

/**
 * Result of an install app operation
 */
export interface InstallAppResult {
  success: boolean;
  apkPath: string;
  /** Android user ID where the app was installed (0 for primary user, 10+ for work profiles) */
  userId?: number;
  /** Package name detected for the installed APK, when available */
  packageName?: string;
  /** True if installation replaced an existing package */
  upgrade?: boolean;
  /** Warning message when best-effort detection was required */
  warning?: string;
  observation?: ObserveResult;
  error?: string;
}
