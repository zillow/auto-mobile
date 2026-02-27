import { DeviceClientProvider } from "../../src/utils/DeviceSessionManager";
import { AdbExecutor } from "../../src/utils/android-cmdline-tools/interfaces/AdbExecutor";
import { SimCtlClient } from "../../src/utils/ios-cmdline-tools/SimCtlClient";
import { AndroidEmulatorClient } from "../../src/utils/android-cmdline-tools/AndroidEmulatorClient";
import { PlatformDeviceManager } from "../../src/utils/interfaces/DeviceUtils";

/**
 * Fake provider for testing - returns injected fakes instead of real clients
 */
export class FakeDeviceClientProvider implements DeviceClientProvider {
  constructor(
    private readonly fakeAdb: AdbExecutor,
    private readonly fakeDeviceUtils: PlatformDeviceManager,
    private readonly fakeSimctl?: SimCtlClient
  ) {}

  getAdb(): AdbExecutor {
    return this.fakeAdb;
  }

  getSimctl(): SimCtlClient | undefined {
    return this.fakeSimctl;
  }

  getAndroidEmulator(): AndroidEmulatorClient | undefined {
    // Tests use fakeDeviceUtils instead
    return undefined;
  }

  getDeviceUtils(): PlatformDeviceManager {
    return this.fakeDeviceUtils;
  }
}
