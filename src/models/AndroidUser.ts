/**
 * Represents an Android user profile on a device
 * Android supports multiple users (personal profile, work profiles, etc.)
 */
export interface AndroidUser {
  /**
   * User ID number (e.g., 0 for primary user, 10 for work profile)
   */
  userId: number;

  /**
   * User name/label (e.g., "Owner", "Work profile")
   */
  name: string;

  /**
   * User type flags as reported by Android
   * Common flags:
   * - 13: Primary user (personal profile)
   * - 30: Managed profile (work profile)
   */
  flags: number;

  /**
   * Whether the user is currently running
   */
  running: boolean;
}
