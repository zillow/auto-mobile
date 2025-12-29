import {
  SystemImageFilter,
  SystemImage,
  CreateAvdParams,
  AvdInfo,
  DeviceProfile
} from "../avdmanager";

/**
 * Interface for AVD Manager operations
 * Enables dependency injection and testing with fakes
 */
export interface AvdManager {
  /**
   * Accept Android SDK licenses
   * @returns Promise with success status and message
   */
  acceptLicenses(): Promise<{
    success: boolean;
    message: string
  }>;

  /**
   * List available system images
   * @param filter - Optional filter criteria for system images
   * @returns Promise with array of system images
   */
  listSystemImages(filter?: SystemImageFilter): Promise<SystemImage[]>;

  /**
   * Download and install a system image
   * @param packageName - Package name of system image to install
   * @param acceptLicense - Whether to accept license (default: true)
   * @returns Promise with success status and message
   */
  installSystemImage(packageName: string, acceptLicense?: boolean): Promise<{
    success: boolean;
    message: string;
  }>;

  /**
   * List available AVDs
   * @returns Promise with array of AVD info
   */
  listDeviceImages(): Promise<AvdInfo[]>;

  /**
   * Create a new AVD
   * @param params - Parameters for creating AVD
   * @returns Promise with success status, message, and optional AVD name
   */
  createAvd(params: CreateAvdParams): Promise<{
    success: boolean;
    message: string;
    avdName?: string;
  }>;

  /**
   * Delete an AVD
   * @param name - Name of AVD to delete
   * @returns Promise with success status and message
   */
  deleteAvd(name: string): Promise<{
    success: boolean;
    message: string;
  }>;

  /**
   * List available device profiles
   * @returns Promise with array of device profiles
   */
  listDevices(): Promise<DeviceProfile[]>;
}
