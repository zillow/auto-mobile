import {
  acceptLicenses,
  listSystemImages,
  installSystemImage,
  listDeviceImages,
  createAvd,
  deleteAvd,
  listDevices,
  SystemImageFilter,
  SystemImage,
  CreateAvdParams,
  AvdInfo,
  DeviceProfile,
  AvdManagerDependencies
} from "./avdmanager";

/**
 * Interface for AVD Manager operations
 * Enables dependency injection and testing with fakes
 */
export interface AvdManager {
  acceptLicenses(): Promise<{ success: boolean; message: string }>;
  listSystemImages(filter?: SystemImageFilter): Promise<SystemImage[]>;
  installSystemImage(packageName: string, acceptLicense?: boolean): Promise<{ success: boolean; message: string }>;
  listDeviceImages(): Promise<AvdInfo[]>;
  createAvd(params: CreateAvdParams): Promise<{ success: boolean; message: string; avdName?: string }>;
  deleteAvd(name: string): Promise<{ success: boolean; message: string }>;
  listDevices(): Promise<DeviceProfile[]>;
}

/**
 * Service wrapper for AVD Manager operations
 * Implements AvdManager interface and delegates to functional API
 */
export class AvdManagerService implements AvdManager {
  private dependencies?: AvdManagerDependencies;

  constructor(dependencies?: AvdManagerDependencies) {
    this.dependencies = dependencies;
  }

  async acceptLicenses(): Promise<{
    success: boolean;
    message: string
  }> {
    if (this.dependencies) {
      return acceptLicenses(this.dependencies);
    }
    return acceptLicenses();
  }

  async listSystemImages(filter?: SystemImageFilter): Promise<SystemImage[]> {
    if (this.dependencies) {
      return listSystemImages(filter, this.dependencies);
    }
    return listSystemImages(filter);
  }

  async installSystemImage(packageName: string, acceptLicense = true): Promise<{
    success: boolean;
    message: string;
  }> {
    if (this.dependencies) {
      return installSystemImage(packageName, acceptLicense, this.dependencies);
    }
    return installSystemImage(packageName, acceptLicense);
  }

  async listDeviceImages(): Promise<AvdInfo[]> {
    if (this.dependencies) {
      return listDeviceImages(this.dependencies);
    }
    return listDeviceImages();
  }

  async createAvd(params: CreateAvdParams): Promise<{
    success: boolean;
    message: string;
    avdName?: string;
  }> {
    if (this.dependencies) {
      return createAvd(params, this.dependencies);
    }
    return createAvd(params);
  }

  async deleteAvd(name: string): Promise<{
    success: boolean;
    message: string;
  }> {
    if (this.dependencies) {
      return deleteAvd(name, this.dependencies);
    }
    return deleteAvd(name);
  }

  async listDevices(): Promise<DeviceProfile[]> {
    if (this.dependencies) {
      return listDevices(this.dependencies);
    }
    return listDevices();
  }
}
