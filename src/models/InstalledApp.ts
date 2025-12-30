/**
 * Represents an installed app on Android with user profile information
 */
export interface InstalledApp {
  /**
   * Package name (e.g., "com.example.app")
   */
  packageName: string;

  /**
   * Android user ID where this app is installed
   * - 0: Primary user (personal profile)
   * - 10+: Work profile or other managed profiles
   */
  userId: number;

  /**
   * Whether this app instance is currently in the foreground
   */
  foreground: boolean;

  /**
   * Whether this app instance was recently used
   * (Placeholder for future implementation - currently always false)
   */
  recent: boolean;
}
