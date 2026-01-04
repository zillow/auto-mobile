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

/**
 * Represents a system app installed across one or more Android user profiles.
 */
export interface SystemInstalledApp {
  /**
   * Package name (e.g., "com.android.settings")
   */
  packageName: string;

  /**
   * Android user IDs where this system app is installed
   */
  userIds: number[];

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

/**
 * Grouped installed apps by profile with system apps deduped.
 */
export interface InstalledAppsByProfile {
  profiles: Record<number, InstalledApp[]>;
  system: SystemInstalledApp[];
}
