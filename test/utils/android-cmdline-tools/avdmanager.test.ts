import { expect, describe, test, beforeEach } from "bun:test";
import { AvdManagerDependencies } from "../../../src/utils/android-cmdline-tools/avdmanager";

describe("AVDManager", function() {
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
    test("should accept licenses successfully", async () => {
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

      expect(result.success).toBe(true);
      expect(result.message).toBe("Android SDK licenses accepted");
    });

    test("should handle license acceptance failure", async () => {
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

      expect(result.success).toBe(false);
      expect(result.message).toContain("License acceptance failed");
    });

    test("should handle missing tools without installation", async () => {
      const mockDeps = createDependencies();

      mockDeps.detectAndroidCommandLineTools = async () => [];
      mockDeps.getBestAndroidToolsLocation = () => null;

      const result = await avdmanager.acceptLicenses(mockDeps);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Tool installation functionality has been removed");
    });
  });

  describe("listSystemImages", () => {
    test("should list system images successfully", async () => {
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

      expect(result).toHaveLength(2);
      expect(result[0].packageName).toBe("system-images;android-33;google_apis;arm64-v8a");
      expect(result[0].apiLevel).toBe(33);
      expect(result[0].tag).toBe("google_apis");
      expect(result[0].abi).toBe("arm64-v8a");
      expect(result[1].packageName).toBe("system-images;android-34;google_apis;x86_64");
      expect(result[1].apiLevel).toBe(34);
      expect(result[1].tag).toBe("google_apis");
      expect(result[1].abi).toBe("x86_64");
    });

    test("should filter system images by criteria", async () => {
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

      expect(result).toHaveLength(1);
      expect(result[0].apiLevel).toBe(33);
      expect(result[0].tag).toBe("google_apis");
    });
  });

  describe("createAvd", () => {
    test("should create AVD successfully", async () => {
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

      expect(result.success).toBe(true);
      expect(result.avdName).toBe("test_avd");
    });

    test("should include all optional parameters", async () => {
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

      expect(result.success).toBe(true);
    });

    test("should handle AVD creation failure", async () => {
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

      expect(result.success).toBe(false);
      expect(result.message).toContain("AVD creation failed");
    });
  });

  describe("deleteAvd", () => {
    test("should delete AVD successfully", async () => {
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

      expect(result.success).toBe(true);
      expect(result.message).toContain("deleted successfully");
    });
  });

  describe("listDeviceImages", () => {
    test("should parse AVD list correctly", async () => {
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

      expect(result).toHaveLength(3);

      expect(result[0].name).toBe("test_avd_1");
      expect(result[0].path).toBe("/Users/test/.android/avd/test_avd_1.avd");
      expect(result[0].target).toBe("Google APIs (Google Inc.)");
      expect(result[0].basedOn).toBe("Android 13.0 (Tiramisu) Tag/ABI: google_apis/arm64-v8a");

      expect(result[1].name).toBe("test_avd_2");
      expect(result[1].path).toBe("/Users/test/.android/avd/test_avd_2.avd");
      expect(result[1].target).toBe("Google APIs (Google Inc.)");
      expect(result[1].basedOn).toBe("Android 14.0 (UpsideDownCake) Tag/ABI: google_apis_playstore/x86_64");

      expect(result[2].name).toBe("broken_avd");
      expect(result[2].path).toBe("/Users/test/.android/avd/broken_avd.avd");
      expect(result[2].error).toBe("Missing system image for Google Play arm64-v8a Medium Phone API 35.");
    });
  });

  describe("listDevices", () => {
    test("should parse device list correctly", async () => {
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

      expect(result).toHaveLength(3);

      expect(result[0].id).toBe("0");
      expect(result[0].name).toBe("TV (1080p)");
      expect(result[0].oem).toBe("Generic");

      expect(result[1].id).toBe("1");
      expect(result[1].name).toBe("Nexus 5X");
      expect(result[1].oem).toBe("LGE");

      expect(result[2].id).toBe("pixel_4");
      expect(result[2].name).toBe("Pixel 4");
      expect(result[2].oem).toBe("Google");
    });
  });

  describe("installSystemImage", () => {
    test("should install system image successfully", async () => {
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

      expect(result.success).toBe(true);
      expect(result.message).toContain("installed successfully");
    });

    test("should install without accepting license when specified", async () => {
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

      expect(result.success).toBe(true);
    });
  });

  describe("Constants", () => {
    test("should provide common system images", () => {
      expect(avdmanager.COMMON_SYSTEM_IMAGES.API_35.GOOGLE_APIS_ARM64)
        .toBe("system-images;android-35;google_apis;arm64-v8a");
      expect(avdmanager.COMMON_SYSTEM_IMAGES.API_34.PLAYSTORE_X86_64)
        .toBe("system-images;android-34;google_apis_playstore;x86_64");
    });

    test("should provide common device profiles", () => {
      expect(avdmanager.COMMON_DEVICES.PIXEL_4).toBe("pixel_4");
      expect(avdmanager.COMMON_DEVICES.NEXUS_5X).toBe("Nexus 5X");
    });
  });

  describe("Error Handling", () => {
    test("should handle tools installation failure", async () => {
      const mockDeps = createDependencies();

      mockDeps.detectAndroidCommandLineTools = async () => [];
      mockDeps.getBestAndroidToolsLocation = () => null;

      const result = await avdmanager.acceptLicenses(mockDeps);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Tool installation functionality has been removed");
    });

    test("should handle missing tools after installation", async () => {
      const mockDeps = createDependencies();

      mockDeps.detectAndroidCommandLineTools = async () => [];
      mockDeps.getBestAndroidToolsLocation = () => null;

      const result = await avdmanager.acceptLicenses(mockDeps);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Tool installation functionality has been removed");
    });

    test("should handle missing executable files", async () => {
      const mockDeps = createDependencies();

      mockDeps.existsSync = (path: string) => false;

      const result = await avdmanager.acceptLicenses(mockDeps);

      expect(result.success).toBe(false);
      expect(result.message).toContain("SDK manager not found");
    });

    test("should handle command spawn errors", async () => {
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

      expect(result.success).toBe(false);
      expect(result.message).toContain("Failed to spawn command");
    });
  });
});
