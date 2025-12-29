import { AvdManager } from "../../src/utils/android-cmdline-tools/interfaces/AvdManager";
import {
  SystemImageFilter,
  SystemImage,
  CreateAvdParams,
  AvdInfo,
  DeviceProfile
} from "../../src/utils/android-cmdline-tools/avdmanager";

/**
 * Fake implementation of AvdManager for testing
 * Allows configuring responses and asserting method calls
 */
export class FakeAvdManager implements AvdManager {
  private acceptLicensesResponse: { success: boolean; message: string } = {
    success: true,
    message: "Android SDK licenses accepted"
  };
  private listSystemImagesResponse: SystemImage[] = [];
  private installSystemImageResponse: { success: boolean; message: string } = {
    success: true,
    message: "System image installed successfully"
  };
  private listDeviceImagesResponse: AvdInfo[] = [];
  private createAvdResponse: { success: boolean; message: string; avdName?: string } = {
    success: true,
    message: "AVD created successfully"
  };
  private deleteAvdResponse: { success: boolean; message: string } = {
    success: true,
    message: "AVD deleted successfully"
  };
  private listDevicesResponse: DeviceProfile[] = [];

  // Call tracking
  private acceptLicensesCalls: number = 0;
  private listSystemImagesCalls: Array<{ filter?: SystemImageFilter }> = [];
  private installSystemImageCalls: Array<{ packageName: string; acceptLicense?: boolean }> = [];
  private listDeviceImagesCalls: number = 0;
  private createAvdCalls: Array<{ params: CreateAvdParams }> = [];
  private deleteAvdCalls: Array<{ name: string }> = [];
  private listDevicesCalls: number = 0;

  // Configuration setters for responses
  setAcceptLicensesResponse(response: { success: boolean; message: string }): void {
    this.acceptLicensesResponse = response;
  }

  setListSystemImagesResponse(response: SystemImage[]): void {
    this.listSystemImagesResponse = response;
  }

  setInstallSystemImageResponse(response: { success: boolean; message: string }): void {
    this.installSystemImageResponse = response;
  }

  setListDeviceImagesResponse(response: AvdInfo[]): void {
    this.listDeviceImagesResponse = response;
  }

  setCreateAvdResponse(response: { success: boolean; message: string; avdName?: string }): void {
    this.createAvdResponse = response;
  }

  setDeleteAvdResponse(response: { success: boolean; message: string }): void {
    this.deleteAvdResponse = response;
  }

  setListDevicesResponse(response: DeviceProfile[]): void {
    this.listDevicesResponse = response;
  }

  // Call tracking getters for assertions
  getAcceptLicensesCalls(): number {
    return this.acceptLicensesCalls;
  }

  getListSystemImagesCalls(): Array<{ filter?: SystemImageFilter }> {
    return [...this.listSystemImagesCalls];
  }

  getInstallSystemImageCalls(): Array<{ packageName: string; acceptLicense?: boolean }> {
    return [...this.installSystemImageCalls];
  }

  getListDeviceImagesCalls(): number {
    return this.listDeviceImagesCalls;
  }

  getCreateAvdCalls(): Array<{ params: CreateAvdParams }> {
    return [...this.createAvdCalls];
  }

  getDeleteAvdCalls(): Array<{ name: string }> {
    return [...this.deleteAvdCalls];
  }

  getListDevicesCalls(): number {
    return this.listDevicesCalls;
  }

  /**
   * Clear all call tracking
   */
  clearCallHistory(): void {
    this.acceptLicensesCalls = 0;
    this.listSystemImagesCalls = [];
    this.installSystemImageCalls = [];
    this.listDeviceImagesCalls = 0;
    this.createAvdCalls = [];
    this.deleteAvdCalls = [];
    this.listDevicesCalls = 0;
  }

  // Implementation of AvdManager interface

  async acceptLicenses(): Promise<{
    success: boolean;
    message: string
  }> {
    this.acceptLicensesCalls++;
    return this.acceptLicensesResponse;
  }

  async listSystemImages(filter?: SystemImageFilter): Promise<SystemImage[]> {
    this.listSystemImagesCalls.push({ filter });
    return this.listSystemImagesResponse;
  }

  async installSystemImage(packageName: string, acceptLicense = true): Promise<{
    success: boolean;
    message: string;
  }> {
    this.installSystemImageCalls.push({ packageName, acceptLicense });
    return this.installSystemImageResponse;
  }

  async listDeviceImages(): Promise<AvdInfo[]> {
    this.listDeviceImagesCalls++;
    return this.listDeviceImagesResponse;
  }

  async createAvd(params: CreateAvdParams): Promise<{
    success: boolean;
    message: string;
    avdName?: string;
  }> {
    this.createAvdCalls.push({ params });
    return this.createAvdResponse;
  }

  async deleteAvd(name: string): Promise<{
    success: boolean;
    message: string;
  }> {
    this.deleteAvdCalls.push({ name });
    return this.deleteAvdResponse;
  }

  async listDevices(): Promise<DeviceProfile[]> {
    this.listDevicesCalls++;
    return this.listDevicesResponse;
  }
}
