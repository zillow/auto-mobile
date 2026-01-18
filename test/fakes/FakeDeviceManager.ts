import { ChildProcess } from "child_process";
import { BootedDevice, DeviceInfo, SomePlatform } from "../../src/models";
import { PlatformDeviceManager } from "../../src/utils/deviceUtils";

export class FakeDeviceManager implements PlatformDeviceManager {
  deviceImages: DeviceInfo[] = [];
  bootedDevices: BootedDevice[] = [];
  startedDevices: DeviceInfo[] = [];

  constructor(images: DeviceInfo[] = [], booted: BootedDevice[] = []) {
    this.deviceImages = images;
    this.bootedDevices = booted;
  }

  async listDeviceImages(platform: SomePlatform): Promise<DeviceInfo[]> {
    if (platform === "either") {
      return this.deviceImages;
    }
    return this.deviceImages.filter(device => device.platform === platform);
  }

  async isDeviceImageRunning(device: DeviceInfo): Promise<boolean> {
    if (device.isRunning) {
      return true;
    }
    const id = device.deviceId ?? device.name;
    return this.bootedDevices.some(booted => booted.deviceId === id || booted.name === device.name);
  }

  async getBootedDevices(platform: SomePlatform): Promise<BootedDevice[]> {
    if (platform === "either") {
      return this.bootedDevices;
    }
    return this.bootedDevices.filter(device => device.platform === platform);
  }

  async startDevice(device: DeviceInfo): Promise<ChildProcess> {
    this.startedDevices.push(device);
    const id = device.deviceId ?? device.name;
    const alreadyBooted = this.bootedDevices.some(booted => booted.deviceId === id);
    if (!alreadyBooted) {
      this.bootedDevices.push({
        name: device.name,
        platform: device.platform,
        deviceId: id,
        source: device.source
      });
    }
    return { pid: 0 } as ChildProcess;
  }

  async killDevice(_: BootedDevice): Promise<void> {}

  async waitForDeviceReady(device: DeviceInfo): Promise<BootedDevice> {
    const id = device.deviceId ?? device.name;
    return {
      name: device.name,
      platform: device.platform,
      deviceId: id,
      source: device.source
    };
  }
}
