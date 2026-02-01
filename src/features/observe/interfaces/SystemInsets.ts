import type { SystemInsets as SystemInsetsModel, ExecResult } from "../../../models";

/**
 * Interface for retrieving system UI insets (status bar, navigation bar, gesture areas).
 */
export interface SystemInsets {
  /**
   * Get the system UI insets using cached dumpsys window output.
   * @param dumpsysWindow - Pre-fetched dumpsys window output
   * @returns Promise with inset values for top (status bar), bottom (nav bar), left/right (gesture areas)
   */
  execute(dumpsysWindow: ExecResult): Promise<SystemInsetsModel>;
}
