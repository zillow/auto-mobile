import { expect } from "chai";
import { AvdManagerDependencies } from "../../../src/utils/android-cmdline-tools/avdmanager";

describe("AVDManager", function() {
  this.timeout(15000);
  let mockLocation: any;
  let avdmanager: any;

  beforeEach(() => {
    // Clear module cache first
    delete require.cache[require.resolve("../../../src/utils/android-cmdline-tools/avdmanager")];
    delete require.cache[require.resolve("../../../src/utils/android-cmdline-tools/detection")];
    delete require.cache[require.resolve("../../../src/utils/android-cmdline-tools/install")];

    // Now require the modules
    avdmanager = require("../../../src/utils/android-cmdline-tools/avdmanager");

    // Mock location
    mockLocation = {
      path: "/mock/sdk/cmdline-tools/latest",
      source: "manual" as const,
      version: "test",
      available_tools: ["avdmanager", "sdkmanager"]
    };
  });

  // Helper function to create mock dependencies
  function createDependencies(overrides: Partial<AvdManagerDependencies> = {}): AvdManagerDependencies {
    class MockChild {
      private stdoutCallbacks: Array<(data: any) => void> = [];
      private stderrCallbacks: Array<(data: any) => void> = [];
      private closeCallbacks: Array<(code: number) => void> = [];
      private errorCallbacks: Array<(error: Error) => void> = [];

      stdout = {
        on: (event: string, cb: (data: any) => void) => {
          if (event === "data") {this.stdoutCallbacks.push(cb);}
        }
      };

      stderr = {
        on: (event: string, cb: (data: any) => void) => {
          if (event === "data") {this.stderrCallbacks.push(cb);}
        }
      };

      stdin = {
        write: (data: string) => {},
        end: () => {}
      };

      on = (event: string, cb: any) => {
        if (event === "close") {this.closeCallbacks.push(cb);}
        if (event === "error") {this.errorCallbacks.push(cb);}
      };

      kill = () => {};

      triggerStdout(data: Buffer) {
        this.stdoutCallbacks.forEach(cb => cb(data));
      }

      triggerStderr(data: Buffer) {
        this.stderrCallbacks.forEach(cb => cb(data));
      }

      triggerClose(code: number) {
        this.closeCallbacks.forEach(cb => cb(code));
      }

      triggerError(error: Error) {
        this.errorCallbacks.forEach(cb => cb(error));
      }
    }

    const mockLogger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      setLogLevel: () => {},
      getLogLevel: () => "info",
      enableStdoutLogging: () => {},
      disableStdoutLogging: () => {},
      close: () => {}
    };

    return {
      spawn: (command: string, args: string[], options?: any) => new MockChild(),
      existsSync: (path: string) => true,
      logger: mockLogger,
      detectAndroidCommandLineTools: async () => [mockLocation],
      getBestAndroidToolsLocation: () => mockLocation,
      validateRequiredTools: () => ({ valid: true, missing: [] }),
      installAndroidTools: async () => ({
        success: true,
        installed_tools: ["avdmanager", "sdkmanager"],
        failed_tools: [],
        installation_path: "/mock/path",
        installation_method: "manual",
        message: "Success"
      }),
      ...overrides
    };
  }

  describe("acceptLicenses", () => {
    it("should accept licenses successfully", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        setTimeout(() => {
          child.triggerClose(0);
        }, 0);
        return child;
      };

      const result = await avdmanager.acceptLicenses(mockDeps);

      expect(result.success).to.be.true;
      expect(result.message).to.equal("Android SDK licenses accepted");
    });

    it("should handle license acceptance failure", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        setTimeout(() => {
          child.triggerStderr(Buffer.from("License error"));
          child.triggerClose(1);
        }, 0);
        return child;
      };

      const result = await avdmanager.acceptLicenses(mockDeps);

      expect(result.success).to.be.false;
      expect(result.message).to.include("License acceptance failed");
    });

    it("should handle missing tools without installation", async () => {
      const mockDeps = createDependencies();

      mockDeps.detectAndroidCommandLineTools = async () => [];
      mockDeps.getBestAndroidToolsLocation = () => null;

      const result = await avdmanager.acceptLicenses(mockDeps);

      expect(result.success).to.be.false;
      expect(result.message).to.include("Tool installation functionality has been removed");
    });
  });

  describe("listSystemImages", () => {
    it("should list system images successfully", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        setTimeout(() => {
          const mockOutput = `
Available Packages:
  system-images;android-33;google_apis;arm64-v8a | 9
  system-images;android-34;google_apis;x86_64    | 5
          `;
          child.triggerStdout(Buffer.from(mockOutput));
          child.triggerClose(0);
        }, 0);
        return child;
      };

      const result = await avdmanager.listSystemImages(undefined, mockDeps);

      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.deep.include({
        packageName: "system-images;android-33;google_apis;arm64-v8a",
        apiLevel: 33,
        tag: "google_apis",
        abi: "arm64-v8a"
      });
      expect(result[1]).to.deep.include({
        packageName: "system-images;android-34;google_apis;x86_64",
        apiLevel: 34,
        tag: "google_apis",
        abi: "x86_64"
      });
    });

    it("should filter system images by criteria", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        setTimeout(() => {
          const mockOutput = `
Available Packages:
  system-images;android-33;google_apis;arm64-v8a | 9
  system-images;android-34;google_apis;x86_64    | 5
  system-images;android-33;default;arm64-v8a     | 3
          `;
          child.triggerStdout(Buffer.from(mockOutput));
          child.triggerClose(0);
        }, 0);
        return child;
      };

      const result = await avdmanager.listSystemImages({
        apiLevel: 33,
        tag: "google_apis"
      }, mockDeps);

      expect(result).to.have.lengthOf(1);
      expect(result[0].apiLevel).to.equal(33);
      expect(result[0].tag).to.equal("google_apis");
    });
  });

  describe("createAvd", () => {
    it("should create AVD successfully", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        setTimeout(() => {
          child.triggerClose(0);
        }, 0);
        return child;
      };

      const params = {
        name: "test_avd",
        package: "system-images;android-33;google_apis;arm64-v8a",
        device: "pixel_4",
        force: true
      };

      const result = await avdmanager.createAvd(params, mockDeps);

      expect(result.success).to.be.true;
      expect(result.avdName).to.equal("test_avd");
    });

    it("should include all optional parameters", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        setTimeout(() => {
          child.triggerClose(0);
        }, 0);
        return child;
      };

      const params = {
        name: "test_avd",
        package: "system-images;android-33;google_apis;arm64-v8a",
        device: "pixel_4",
        force: true,
        path: "/custom/path",
        tag: "google_apis",
        abi: "arm64-v8a"
      };

      const result = await avdmanager.createAvd(params, mockDeps);

      expect(result.success).to.be.true;
    });

    it("should handle AVD creation failure", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        setTimeout(() => {
          child.triggerStderr(Buffer.from("AVD creation failed"));
          child.triggerClose(1);
        }, 0);
        return child;
      };

      const params = {
        name: "test_avd",
        package: "system-images;android-33;google_apis;arm64-v8a"
      };

      const result = await avdmanager.createAvd(params, mockDeps);

      expect(result.success).to.be.false;
      expect(result.message).to.include("AVD creation failed");
    });
  });

  describe("deleteAvd", () => {
    it("should delete AVD successfully", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        setTimeout(() => {
          child.triggerClose(0);
        }, 0);
        return child;
      };

      const result = await avdmanager.deleteAvd("test_avd", mockDeps);

      expect(result.success).to.be.true;
      expect(result.message).to.include("deleted successfully");
    });
  });

  describe("listDeviceImages", () => {
    it("should parse AVD list correctly", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        setTimeout(() => {
          const mockOutput = `
Available Android Virtual Devices:
    Name: test_avd_1
  Device: pixel_4 (Google)
    Path: /Users/test/.android/avd/test_avd_1.avd
  Target: Google APIs (Google Inc.)
          Based on: Android 13.0 (Tiramisu) Tag/ABI: google_apis/arm64-v8a
---------
    Name: test_avd_2
  Device: pixel_6 (Google)
    Path: /Users/test/.android/avd/test_avd_2.avd
  Target: Google APIs (Google Inc.)
          Based on: Android 14.0 (UpsideDownCake) Tag/ABI: google_apis_playstore/x86_64
---------
    Name: broken_avd
  Device: Unknown device
    Path: /Users/test/.android/avd/broken_avd.avd
   Error: Missing system image for Google Play arm64-v8a Medium Phone API 35.
          `;
          child.triggerStdout(Buffer.from(mockOutput));
          child.triggerClose(0);
        }, 0);
        return child;
      };

      const result = await avdmanager.listDeviceImages(mockDeps);

      expect(result).to.have.lengthOf(3);

      expect(result[0]).to.deep.include({
        name: "test_avd_1",
        path: "/Users/test/.android/avd/test_avd_1.avd",
        target: "Google APIs (Google Inc.)",
        basedOn: "Android 13.0 (Tiramisu) Tag/ABI: google_apis/arm64-v8a"
      });

      expect(result[1]).to.deep.include({
        name: "test_avd_2",
        path: "/Users/test/.android/avd/test_avd_2.avd",
        target: "Google APIs (Google Inc.)",
        basedOn: "Android 14.0 (UpsideDownCake) Tag/ABI: google_apis_playstore/x86_64"
      });

      expect(result[2]).to.deep.include({
        name: "broken_avd",
        path: "/Users/test/.android/avd/broken_avd.avd",
        error: "Missing system image for Google Play arm64-v8a Medium Phone API 35."
      });
    });
  });

  describe("listDevices", () => {
    it("should parse device list correctly", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        setTimeout(() => {
          const mockOutput = `
Available devices:
id: 0
    Name: TV (1080p)
    OEM: Generic
---------
id: 1
    Name: Nexus 5X
    OEM: LGE
---------
id: pixel_4
    Name: Pixel 4
    OEM: Google
          `;
          child.triggerStdout(Buffer.from(mockOutput));
          child.triggerClose(0);
        }, 0);
        return child;
      };

      const result = await avdmanager.listDevices(mockDeps);

      expect(result).to.have.lengthOf(3);

      expect(result[0]).to.deep.include({
        id: "0",
        name: "TV (1080p)",
        oem: "Generic"
      });

      expect(result[1]).to.deep.include({
        id: "1",
        name: "Nexus 5X",
        oem: "LGE"
      });

      expect(result[2]).to.deep.include({
        id: "pixel_4",
        name: "Pixel 4",
        oem: "Google"
      });
    });
  });

  describe("installSystemImage", () => {
    it("should install system image successfully", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        setTimeout(() => {
          child.triggerClose(0);
        }, 0);
        return child;
      };

      const packageName = "system-images;android-33;google_apis;arm64-v8a";
      const result = await avdmanager.installSystemImage(packageName, true, mockDeps);

      expect(result.success).to.be.true;
      expect(result.message).to.include("installed successfully");
    });

    it("should install without accepting license when specified", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        setTimeout(() => {
          child.triggerClose(0);
        }, 0);
        return child;
      };

      const packageName = "system-images;android-33;google_apis;arm64-v8a";
      const result = await avdmanager.installSystemImage(packageName, false, mockDeps);

      expect(result.success).to.be.true;
    });
  });

  describe("Constants", () => {
    it("should provide common system images", () => {
      expect(avdmanager.COMMON_SYSTEM_IMAGES.API_35.GOOGLE_APIS_ARM64)
        .to.equal("system-images;android-35;google_apis;arm64-v8a");
      expect(avdmanager.COMMON_SYSTEM_IMAGES.API_34.PLAYSTORE_X86_64)
        .to.equal("system-images;android-34;google_apis_playstore;x86_64");
    });

    it("should provide common device profiles", () => {
      expect(avdmanager.COMMON_DEVICES.PIXEL_4).to.equal("pixel_4");
      expect(avdmanager.COMMON_DEVICES.NEXUS_5X).to.equal("Nexus 5X");
    });
  });

  describe("Error Handling", () => {
    it("should handle tools installation failure", async () => {
      const mockDeps = createDependencies();

      mockDeps.detectAndroidCommandLineTools = async () => [];
      mockDeps.getBestAndroidToolsLocation = () => null;

      const result = await avdmanager.acceptLicenses(mockDeps);

      expect(result.success).to.be.false;
      expect(result.message).to.include("Tool installation functionality has been removed");
    });

    it("should handle missing tools after installation", async () => {
      const mockDeps = createDependencies();

      mockDeps.detectAndroidCommandLineTools = async () => [];
      mockDeps.getBestAndroidToolsLocation = () => null;

      const result = await avdmanager.acceptLicenses(mockDeps);

      expect(result.success).to.be.false;
      expect(result.message).to.include("Tool installation functionality has been removed");
    });

    it("should handle missing executable files", async () => {
      const mockDeps = createDependencies();

      mockDeps.existsSync = (path: string) => false;

      const result = await avdmanager.acceptLicenses(mockDeps);

      expect(result.success).to.be.false;
      expect(result.message).to.include("SDK manager not found");
    });

    it("should handle command spawn errors", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        setTimeout(() => {
          child.triggerError(new Error("Spawn failed"));
        }, 0);
        return child;
      };

      const result = await avdmanager.acceptLicenses(mockDeps);

      expect(result.success).to.be.false;
      expect(result.message).to.include("Failed to spawn command");
    });
  });
});
