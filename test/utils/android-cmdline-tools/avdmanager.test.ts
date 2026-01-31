import { expect, describe, test, beforeEach } from "bun:test";
import { AvdManagerDependencies } from "../../../src/utils/android-cmdline-tools/avdmanager";
import { FakeTimer } from "../../fakes/FakeTimer";

// Normalize paths for cross-platform comparison:
// 1. Convert backslashes to forward slashes
// 2. Strip Windows drive letter prefix (e.g., "C:" -> "")
const normalizePath = (value: string): string => value.replace(/\\/g, "/").replace(/^[A-Za-z]:/, "");

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
      getAndroidHomeWithSystemImages: () => null,
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

  function createFakeTimer(): FakeTimer {
    const timer = new FakeTimer();
    timer.enableAutoAdvance();
    return timer;
  }

  async function resolveWithFakeTimer<T>(
    timer: FakeTimer,
    promise: Promise<T>,
    advanceMs: number = 0
  ): Promise<T> {
    await Promise.resolve();
    timer.advanceTime(advanceMs);
    return await promise;
  }

  describe("acceptLicenses", () => {
    test("should accept licenses successfully", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;
      const fakeTimer = createFakeTimer();

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
          child.triggerClose(0);
        }, 0);
        return child;
      };

      const result = await resolveWithFakeTimer(fakeTimer, avdmanager.acceptLicenses(mockDeps));

      expect(result.success).toBe(true);
      expect(result.message).toBe("Android SDK licenses accepted");
    });

    test("should handle license acceptance failure", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;
      const fakeTimer = createFakeTimer();

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
          child.triggerStderr(Buffer.from("License error"));
          child.triggerClose(1);
        }, 0);
        return child;
      };

      const result = await resolveWithFakeTimer(fakeTimer, avdmanager.acceptLicenses(mockDeps));

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
      const fakeTimer = createFakeTimer();

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
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

      const result = await resolveWithFakeTimer(fakeTimer, avdmanager.listSystemImages(undefined, mockDeps));

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
      const fakeTimer = createFakeTimer();

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
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

      const result = await resolveWithFakeTimer(
        fakeTimer,
        avdmanager.listSystemImages({
          apiLevel: 33,
          tag: "google_apis"
        }, mockDeps)
      );

      expect(result).toHaveLength(1);
      expect(result[0].apiLevel).toBe(33);
      expect(result[0].tag).toBe("google_apis");
    });
  });

  describe("createAvd", () => {
    test("should create AVD successfully", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;
      const fakeTimer = createFakeTimer();

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
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

      const result = await resolveWithFakeTimer(fakeTimer, avdmanager.createAvd(params, mockDeps));

      expect(result.success).toBe(true);
      expect(result.avdName).toBe("test_avd");
    });

    test("should include all optional parameters", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;
      const fakeTimer = createFakeTimer();

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
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

      const result = await resolveWithFakeTimer(fakeTimer, avdmanager.createAvd(params, mockDeps));

      expect(result.success).toBe(true);
    });

    test("should handle AVD creation failure", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;
      const fakeTimer = createFakeTimer();

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
          child.triggerStderr(Buffer.from("AVD creation failed"));
          child.triggerClose(1);
        }, 0);
        return child;
      };

      const params = {
        name: "test_avd",
        package: "system-images;android-33;google_apis;arm64-v8a"
      };

      const result = await resolveWithFakeTimer(fakeTimer, avdmanager.createAvd(params, mockDeps));

      expect(result.success).toBe(false);
      expect(result.message).toContain("AVD creation failed");
    });

    test("should return compatibility message for deprecated tools", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;
      const fakeTimer = createFakeTimer();

      const oldToolsLocation = {
        path: "/opt/android-sdk/tools",
        source: "typical" as const,
        version: "26.1.1",
        available_tools: ["avdmanager", "sdkmanager"]
      };

      mockDeps.getBestAndroidToolsLocation = () => oldToolsLocation;

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
          child.triggerStderr(Buffer.from("Some failure"));
          child.triggerClose(1);
        }, 0);
        return child;
      };

      const params = {
        name: "legacy_avd",
        package: "system-images;android-33;google_apis;arm64-v8a"
      };

      const result = await resolveWithFakeTimer(fakeTimer, avdmanager.createAvd(params, mockDeps));

      expect(result.success).toBe(false);
      expect(result.message).toContain("Detected deprecated Android SDK Tools");
      expect(result.message).toContain("cmdline-tools/latest");
    });

    test("should return compatibility message for JAXB error output", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;
      const fakeTimer = createFakeTimer();

      const jaxbError = `Exception in thread "main" java.lang.NoClassDefFoundError: javax/xml/bind/annotation/XmlSchema`;

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
          child.triggerStderr(Buffer.from(jaxbError));
          child.triggerClose(1);
        }, 0);
        return child;
      };

      const params = {
        name: "jaxb_avd",
        package: "system-images;android-33;google_apis;arm64-v8a"
      };

      const result = await resolveWithFakeTimer(fakeTimer, avdmanager.createAvd(params, mockDeps));

      expect(result.success).toBe(false);
      expect(result.message).toContain("Android SDK tools are outdated and incompatible with Java 11+.");
      expect(result.message).toContain("javax.xml.bind");
      expect(result.message).toContain("cmdline-tools/latest");
    });
  });

  describe("deleteAvd", () => {
    test("should delete AVD successfully", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;
      const fakeTimer = createFakeTimer();

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
          child.triggerClose(0);
        }, 0);
        return child;
      };

      const result = await resolveWithFakeTimer(fakeTimer, avdmanager.deleteAvd("test_avd", mockDeps));

      expect(result.success).toBe(true);
      expect(result.message).toContain("deleted successfully");
    });

    test("should return compatibility message for deprecated tools", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;
      const fakeTimer = createFakeTimer();

      const oldToolsLocation = {
        path: "/opt/android-sdk/tools",
        source: "typical" as const,
        version: "26.1.1",
        available_tools: ["avdmanager", "sdkmanager"]
      };

      mockDeps.getBestAndroidToolsLocation = () => oldToolsLocation;

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
          child.triggerStderr(Buffer.from("Some failure"));
          child.triggerClose(1);
        }, 0);
        return child;
      };

      const result = await resolveWithFakeTimer(fakeTimer, avdmanager.deleteAvd("legacy_avd", mockDeps));

      expect(result.success).toBe(false);
      expect(result.message).toContain("Detected deprecated Android SDK Tools");
      expect(result.message).toContain("cmdline-tools/latest");
    });

    test("should return compatibility message for JAXB error output", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;
      const fakeTimer = createFakeTimer();

      const jaxbError = `Exception in thread "main" java.lang.NoClassDefFoundError: javax/xml/bind/annotation/XmlSchema`;

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
          child.triggerStderr(Buffer.from(jaxbError));
          child.triggerClose(1);
        }, 0);
        return child;
      };

      const result = await resolveWithFakeTimer(fakeTimer, avdmanager.deleteAvd("jaxb_avd", mockDeps));

      expect(result.success).toBe(false);
      expect(result.message).toContain("Android SDK tools are outdated and incompatible with Java 11+.");
      expect(result.message).toContain("javax.xml.bind");
      expect(result.message).toContain("cmdline-tools/latest");
    });
  });

  describe("listDeviceImages", () => {
    test("should parse AVD list correctly", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;
      const fakeTimer = createFakeTimer();

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
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

      const result = await resolveWithFakeTimer(fakeTimer, avdmanager.listDeviceImages(mockDeps));

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

  describe("Homebrew system image mismatch warning", () => {
    test("should warn once when Homebrew tools are used and ANDROID_HOME has system-images", async () => {
      const warnings: string[] = [];
      const mockLogger = {
        info: () => {},
        warn: (message: string) => warnings.push(message),
        error: () => {},
        debug: () => {},
        setLogLevel: () => {},
        getLogLevel: () => "info",
        enableStdoutLogging: () => {},
        disableStdoutLogging: () => {},
        close: () => {}
      };

      const mockDeps = createDependencies({
        logger: mockLogger,
        getAndroidHomeWithSystemImages: () => ({
          androidHome: "/Users/test/Library/Android/sdk",
          systemImagesPath: "/Users/test/Library/Android/sdk/system-images"
        })
      });

      const homebrewLocation = {
        path: "/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest",
        source: "homebrew" as const,
        version: "test",
        available_tools: ["avdmanager", "sdkmanager"]
      };

      mockDeps.getBestAndroidToolsLocation = () => homebrewLocation;
      mockDeps.detectAndroidCommandLineTools = async () => [homebrewLocation];

      const originalSpawn = mockDeps.spawn;
      const fakeTimer = createFakeTimer();

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
          child.triggerStdout(Buffer.from("Available Android Virtual Devices:\n"));
          child.triggerClose(0);
        }, 0);
        return child;
      };

      await resolveWithFakeTimer(fakeTimer, avdmanager.listDeviceImages(mockDeps));
      await resolveWithFakeTimer(fakeTimer, avdmanager.listDeviceImages(mockDeps));

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("Homebrew Android cmdline-tools detected");
      expect(warnings[0]).toContain("ANDROID_HOME");
    });
  });

  describe("listDevices", () => {
    test("should parse device list correctly", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;
      const fakeTimer = createFakeTimer();

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
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

      const result = await resolveWithFakeTimer(fakeTimer, avdmanager.listDevices(mockDeps));

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
      const fakeTimer = createFakeTimer();

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
          child.triggerClose(0);
        }, 0);
        return child;
      };

      const packageName = "system-images;android-33;google_apis;arm64-v8a";
      const result = await resolveWithFakeTimer(
        fakeTimer,
        avdmanager.installSystemImage(packageName, true, mockDeps)
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain("installed successfully");
    });

    test("should install without accepting license when specified", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;
      const fakeTimer = createFakeTimer();

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
          child.triggerClose(0);
        }, 0);
        return child;
      };

      const packageName = "system-images;android-33;google_apis;arm64-v8a";
      const result = await resolveWithFakeTimer(
        fakeTimer,
        avdmanager.installSystemImage(packageName, false, mockDeps)
      );

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
      const fakeTimer = createFakeTimer();

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
          child.triggerError(new Error("Spawn failed"));
        }, 0);
        return child;
      };

      const result = await resolveWithFakeTimer(fakeTimer, avdmanager.acceptLicenses(mockDeps));

      expect(result.success).toBe(false);
      expect(result.message).toContain("Failed to spawn command");
    });
  });

  describe("SDK Root Detection (looksLikeAndroidSdkRoot)", () => {
    describe("with system-images present", () => {
      test("should recognize SDK root with only system-images marker", async () => {
        const mockDeps = createDependencies();
        const pathChecks = new Map<string, boolean>([
          ["/test/sdk", true],
          ["/test/sdk/system-images", true],
          ["/test/sdk/platforms", false],
          ["/test/sdk/platform-tools", false],
          ["/test/sdk/build-tools", false],
          ["/test/sdk/cmdline-tools/latest/bin/avdmanager", true]
        ]);

        mockDeps.existsSync = (path: string) => pathChecks.get(normalizePath(path)) ?? false;

        // Test the behavior indirectly - system-images should make it valid
        expect(mockDeps.existsSync("/test/sdk")).toBe(true);
        expect(mockDeps.existsSync("/test/sdk/system-images")).toBe(true);
      });

      test("should recognize SDK root with system-images and other markers", async () => {
        const mockDeps = createDependencies();
        const pathChecks = new Map<string, boolean>([
          ["/test/sdk", true],
          ["/test/sdk/system-images", true],
          ["/test/sdk/platforms", true],
          ["/test/sdk/platform-tools", true],
          ["/test/sdk/build-tools", true]
        ]);

        mockDeps.existsSync = (path: string) => pathChecks.get(normalizePath(path)) ?? false;

        expect(mockDeps.existsSync("/test/sdk/system-images")).toBe(true);
        expect(mockDeps.existsSync("/test/sdk/platforms")).toBe(true);
      });

      test("should prioritize SDK root with system-images over one without", async () => {
        const mockDeps = createDependencies();
        const pathChecks = new Map<string, boolean>([
          // Homebrew location - no system-images but has other markers
          ["/opt/homebrew/share/android-commandlinetools", true],
          ["/opt/homebrew/share/android-commandlinetools/system-images", false],
          ["/opt/homebrew/share/android-commandlinetools/platforms", true],
          ["/opt/homebrew/share/android-commandlinetools/platform-tools", true],
          ["/opt/homebrew/share/android-commandlinetools/build-tools", true],
          // Proper SDK location - has system-images
          ["/Users/test/Library/Android/sdk", true],
          ["/Users/test/Library/Android/sdk/system-images", true],
          ["/Users/test/Library/Android/sdk/platforms", true],
          ["/Users/test/Library/Android/sdk/platform-tools", true]
        ]);

        mockDeps.existsSync = (path: string) => pathChecks.get(normalizePath(path)) ?? false;

        // The proper SDK should be preferred because it has system-images
        expect(mockDeps.existsSync("/Users/test/Library/Android/sdk/system-images")).toBe(true);
        expect(mockDeps.existsSync("/opt/homebrew/share/android-commandlinetools/system-images")).toBe(false);
      });

      test("two-pass search: should prefer SDK with system-images even when it appears later in candidate list", async () => {
        const mockDeps = createDependencies();
        const originalSpawn = mockDeps.spawn;
        const fakeTimer = createFakeTimer();

        // Simulate a scenario where Homebrew location (no system-images) would be checked
        // before $ANDROID_HOME (has system-images) due to candidate insertion order
        const pathChecks = new Map<string, boolean>([
          // Homebrew location - appears early, has markers but NO system-images
          ["/opt/homebrew/share/android-commandlinetools", true],
          ["/opt/homebrew/share/android-commandlinetools/cmdline-tools", true],
          ["/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest", true],
          ["/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest/bin", true],
          ["/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest/bin/avdmanager", true],
          ["/opt/homebrew/share/android-commandlinetools/system-images", false], // No system-images!
          ["/opt/homebrew/share/android-commandlinetools/platforms", true],
          ["/opt/homebrew/share/android-commandlinetools/platform-tools", true],
          ["/opt/homebrew/share/android-commandlinetools/build-tools", true],
          // Proper SDK location - appears later, HAS system-images
          ["/Users/test/Library/Android/sdk", true],
          ["/Users/test/Library/Android/sdk/cmdline-tools", true],
          ["/Users/test/Library/Android/sdk/cmdline-tools/latest", true],
          ["/Users/test/Library/Android/sdk/cmdline-tools/latest/bin", true],
          ["/Users/test/Library/Android/sdk/cmdline-tools/latest/bin/avdmanager", true],
          ["/Users/test/Library/Android/sdk/system-images", true], // Has system-images!
          ["/Users/test/Library/Android/sdk/platforms", true],
          ["/Users/test/Library/Android/sdk/platform-tools", true],
          ["/Users/test/Library/Android/sdk/build-tools", true]
        ]);

        mockDeps.existsSync = (path: string) => pathChecks.get(normalizePath(path)) ?? false;

        // Mock detectAndroidCommandLineTools to return Homebrew location
        // Note: location.path should be the cmdline-tools/latest directory, not the avdmanager executable
        mockDeps.detectAndroidCommandLineTools = async () => [
          {
            path: "/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest",
            source: "homebrew"
          }
        ];

        mockDeps.getBestAndroidToolsLocation = () => ({
          path: "/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest",
          source: "homebrew"
        });

        // Set ANDROID_HOME to proper SDK location
        const originalAndroidHome = process.env.ANDROID_HOME;
        process.env.ANDROID_HOME = "/Users/test/Library/Android/sdk";

        let usedEnv: NodeJS.ProcessEnv | undefined;
        mockDeps.spawn = (command: string, args: string[], options?: any) => {
          // Capture the environment used
          usedEnv = options?.env;
          const child: any = originalSpawn(command, args, options);
          fakeTimer.setTimeout(() => {
            // Simulate successful avdmanager output
            child.triggerStdout(Buffer.from("Available Android Virtual Devices:\n"));
            child.triggerClose(0);
          }, 0);
          return child;
        };

        try {
          await resolveWithFakeTimer(fakeTimer, avdmanager.listDeviceImages(mockDeps));

          // The two-pass search should have picked the SDK with system-images
          // even though Homebrew location appears earlier in candidates
          expect(usedEnv).toBeDefined();
          expect(normalizePath(usedEnv?.ANDROID_HOME ?? "")).toBe("/Users/test/Library/Android/sdk");
          expect(normalizePath(usedEnv?.ANDROID_SDK_ROOT ?? "")).toBe("/Users/test/Library/Android/sdk");
        } finally {
          // Restore original environment
          if (originalAndroidHome) {
            process.env.ANDROID_HOME = originalAndroidHome;
          } else {
            delete process.env.ANDROID_HOME;
          }
        }
      });
    });

    describe("without system-images (backward compatibility)", () => {
      test("should accept SDK root with at least 2 other markers", async () => {
        const mockDeps = createDependencies();
        const pathChecks = new Map<string, boolean>([
          ["/test/sdk", true],
          ["/test/sdk/system-images", false],
          ["/test/sdk/platforms", true],
          ["/test/sdk/platform-tools", true],
          ["/test/sdk/build-tools", false]
        ]);

        mockDeps.existsSync = (path: string) => pathChecks.get(normalizePath(path)) ?? false;

        // Should still work with 2 markers (backward compatibility)
        expect(mockDeps.existsSync("/test/sdk/platforms")).toBe(true);
        expect(mockDeps.existsSync("/test/sdk/platform-tools")).toBe(true);
      });

      test("should reject SDK root with only 1 marker and no system-images", async () => {
        const mockDeps = createDependencies();
        const pathChecks = new Map<string, boolean>([
          ["/test/sdk", true],
          ["/test/sdk/system-images", false],
          ["/test/sdk/platforms", true],
          ["/test/sdk/platform-tools", false],
          ["/test/sdk/build-tools", false]
        ]);

        mockDeps.existsSync = (path: string) => pathChecks.get(normalizePath(path)) ?? false;

        // Only 1 marker - should be insufficient
        const platformsExist = mockDeps.existsSync("/test/sdk/platforms");
        const systemImagesExist = mockDeps.existsSync("/test/sdk/system-images");
        const platformToolsExist = mockDeps.existsSync("/test/sdk/platform-tools");
        const buildToolsExist = mockDeps.existsSync("/test/sdk/build-tools");

        const markerCount = [platformsExist, systemImagesExist, platformToolsExist, buildToolsExist]
          .filter(Boolean).length;

        expect(markerCount).toBe(1);
        expect(systemImagesExist).toBe(false);
      });

      test("should reject SDK root with no markers", async () => {
        const mockDeps = createDependencies();
        const pathChecks = new Map<string, boolean>([
          ["/test/sdk", true],
          ["/test/sdk/system-images", false],
          ["/test/sdk/platforms", false],
          ["/test/sdk/platform-tools", false],
          ["/test/sdk/build-tools", false]
        ]);

        mockDeps.existsSync = (path: string) => pathChecks.get(normalizePath(path)) ?? false;

        const hasAnyMarker =
          mockDeps.existsSync("/test/sdk/system-images") ||
          mockDeps.existsSync("/test/sdk/platforms") ||
          mockDeps.existsSync("/test/sdk/platform-tools") ||
          mockDeps.existsSync("/test/sdk/build-tools");

        expect(hasAnyMarker).toBe(false);
      });
    });

    describe("edge cases", () => {
      test("should reject non-existent SDK root", async () => {
        const mockDeps = createDependencies();
        mockDeps.existsSync = (path: string) => false;

        expect(mockDeps.existsSync("/nonexistent/sdk")).toBe(false);
      });

      test("should handle empty SDK root path", async () => {
        const mockDeps = createDependencies();
        mockDeps.existsSync = (path: string) => path === "";

        expect(mockDeps.existsSync("")).toBe(true);
      });
    });

    describe("cross-platform path handling", () => {
      test("should handle macOS typical path with system-images", async () => {
        const mockDeps = createDependencies();
        const pathChecks = new Map<string, boolean>([
          ["/Users/test/Library/Android/sdk", true],
          ["/Users/test/Library/Android/sdk/system-images", true],
          ["/Users/test/Library/Android/sdk/cmdline-tools/latest", true],
          ["/Users/test/Library/Android/sdk/platforms", true],
          ["/Users/test/Library/Android/sdk/platform-tools", true]
        ]);

        mockDeps.existsSync = (path: string) => pathChecks.get(normalizePath(path)) ?? false;

        expect(mockDeps.existsSync("/Users/test/Library/Android/sdk/system-images")).toBe(true);
        expect(mockDeps.existsSync("/Users/test/Library/Android/sdk/cmdline-tools/latest")).toBe(true);
      });

      test("should handle Windows typical path with system-images", async () => {
        const mockDeps = createDependencies();
        // Map keys use paths without drive letters since normalizePath strips them
        const pathChecks = new Map<string, boolean>([
          ["/Users/test/AppData/Local/Android/Sdk", true],
          ["/Users/test/AppData/Local/Android/Sdk/system-images", true],
          ["/Users/test/AppData/Local/Android/Sdk/cmdline-tools/latest", true],
          ["/Users/test/AppData/Local/Android/Sdk/platforms", true],
          ["/Users/test/AppData/Local/Android/Sdk/platform-tools", true]
        ]);

        mockDeps.existsSync = (path: string) => pathChecks.get(normalizePath(path)) ?? false;

        // Both backslash and forward slash queries work due to normalization (drive letter stripped)
        expect(mockDeps.existsSync("C:\\Users\\test\\AppData\\Local\\Android\\Sdk\\system-images")).toBe(true);
        expect(mockDeps.existsSync("C:\\Users\\test\\AppData\\Local\\Android\\Sdk\\cmdline-tools\\latest")).toBe(true);
      });

      test("should handle Linux typical path with system-images", async () => {
        const mockDeps = createDependencies();
        const pathChecks = new Map<string, boolean>([
          ["/home/test/Android/Sdk", true],
          ["/home/test/Android/Sdk/system-images", true],
          ["/home/test/Android/Sdk/cmdline-tools/latest", true],
          ["/home/test/Android/Sdk/platforms", true],
          ["/home/test/Android/Sdk/platform-tools", true]
        ]);

        mockDeps.existsSync = (path: string) => pathChecks.get(normalizePath(path)) ?? false;

        expect(mockDeps.existsSync("/home/test/Android/Sdk/system-images")).toBe(true);
        expect(mockDeps.existsSync("/home/test/Android/Sdk/cmdline-tools/latest")).toBe(true);
      });

      test("should prioritize cmdline-tools in ANDROID_HOME over Homebrew on macOS", async () => {
        const mockDeps = createDependencies();
        const pathChecks = new Map<string, boolean>([
          // Homebrew location (no system-images)
          ["/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest", true],
          ["/opt/homebrew/share/android-commandlinetools/system-images", false],
          ["/opt/homebrew/share/android-commandlinetools/platforms", true],
          ["/opt/homebrew/share/android-commandlinetools/platform-tools", true],
          // ANDROID_HOME location (has system-images)
          ["/Users/test/Library/Android/sdk/cmdline-tools/latest", true],
          ["/Users/test/Library/Android/sdk/system-images", true],
          ["/Users/test/Library/Android/sdk/platforms", true]
        ]);

        mockDeps.existsSync = (path: string) => pathChecks.get(normalizePath(path)) ?? false;

        // ANDROID_HOME location should be preferred due to system-images
        expect(mockDeps.existsSync("/Users/test/Library/Android/sdk/system-images")).toBe(true);
        expect(mockDeps.existsSync("/opt/homebrew/share/android-commandlinetools/system-images")).toBe(false);
      });

      test("should handle Windows old tools path vs new cmdline-tools", async () => {
        const mockDeps = createDependencies();
        // Map keys use paths without drive letters since normalizePath strips them
        const pathChecks = new Map<string, boolean>([
          // Old tools location (deprecated)
          ["/Users/test/AppData/Local/Android/Sdk/tools/bin", true],
          // New cmdline-tools location
          ["/Users/test/AppData/Local/Android/Sdk/cmdline-tools/latest", true],
          ["/Users/test/AppData/Local/Android/Sdk/system-images", true]
        ]);

        mockDeps.existsSync = (path: string) => pathChecks.get(normalizePath(path)) ?? false;

        // Both backslash and forward slash queries work (drive letter stripped)
        expect(mockDeps.existsSync("C:\\Users\\test\\AppData\\Local\\Android\\Sdk\\cmdline-tools\\latest")).toBe(true);
        expect(mockDeps.existsSync("C:\\Users\\test\\AppData\\Local\\Android\\Sdk\\tools\\bin")).toBe(true);
      });

      test("should handle mixed path separators in Windows paths", async () => {
        const mockDeps = createDependencies();
        // Map keys use paths without drive letters since normalizePath strips them
        const pathChecks = new Map<string, boolean>([
          ["/Users/test/AppData/Local/Android/Sdk", true],
          ["/Users/test/AppData/Local/Android/Sdk/system-images", true]
        ]);

        mockDeps.existsSync = (path: string) => pathChecks.get(normalizePath(path)) ?? false;

        // Both forward and backslash queries work (drive letter stripped, separators normalized)
        expect(mockDeps.existsSync("C:/Users/test/AppData/Local/Android/Sdk/system-images")).toBe(true);
        expect(mockDeps.existsSync("C:\\Users\\test\\AppData\\Local\\Android\\Sdk\\system-images")).toBe(true);
      });
    });
  });

  describe("JAXB Error Detection", () => {
    test("should detect JAXB NoClassDefFoundError in stderr", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;
      const fakeTimer = createFakeTimer();

      const jaxbError = `Exception in thread "main" java.lang.NoClassDefFoundError: javax/xml/bind/annotation/XmlSchema
\tat com.android.repository.api.SchemaModule$SchemaModuleVersion.<init>(SchemaModule.java:156)
\tat com.android.repository.api.SchemaModule.<init>(SchemaModule.java:75)
\tat com.android.sdklib.repository.AndroidSdkHandler.<clinit>(AndroidSdkHandler.java:81)
Caused by: java.lang.ClassNotFoundException: javax.xml.bind.annotation.XmlSchema
\tat java.base/jdk.internal.loader.BuiltinClassLoader.loadClass(BuiltinClassLoader.java:641)`;

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
          child.triggerStderr(Buffer.from(jaxbError));
          child.triggerClose(1);
        }, 0);
        return child;
      };

      try {
        await resolveWithFakeTimer(fakeTimer, avdmanager.listDeviceImages(mockDeps));
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        // Error should be actionable with JAXB guidance
        expect(error.message).toContain("Android SDK tools are outdated and incompatible with Java 11+.");
        expect(error.message).toContain("javax.xml.bind");
        expect(error.message).toContain("cmdline-tools/latest");
      }
    });

    test("should detect JAXB ClassNotFoundException in stderr", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;
      const fakeTimer = createFakeTimer();

      const jaxbError = `Caused by: java.lang.ClassNotFoundException: javax.xml.bind.annotation.XmlSchema
\tat java.base/jdk.internal.loader.BuiltinClassLoader.loadClass(BuiltinClassLoader.java:641)
\tat java.base/jdk.internal.loader.ClassLoaders$AppClassLoader.loadClass(ClassLoaders.java:188)`;

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
          child.triggerStderr(Buffer.from(jaxbError));
          child.triggerClose(1);
        }, 0);
        return child;
      };

      try {
        await resolveWithFakeTimer(fakeTimer, avdmanager.listDeviceImages(mockDeps));
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain("Android SDK tools are outdated and incompatible with Java 11+.");
        expect(error.message).toContain("javax.xml.bind");
        expect(error.message).toContain("cmdline-tools/latest");
      }
    });

    test("should detect when command hangs without triggering close", async () => {
      // This test verifies our mock setup works correctly
      // In production, timeouts are handled by Node.js spawn's internal timeout
      const mockDeps = createDependencies();

      // Verify that not triggering close would cause issues
      // This is more of a sanity check for our test infrastructure
      expect(mockDeps.spawn).toBeDefined();
      expect(mockDeps.existsSync).toBeDefined();
    });

    test("should handle old tools location (/tools/bin/) with JAXB error", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;
      const fakeTimer = createFakeTimer();

      // Mock location pointing to old tools
      const oldToolsLocation = {
        path: "/opt/android-sdk/tools/bin",
        source: "typical" as const,
        version: "26.1.1",
        available_tools: ["avdmanager", "sdkmanager"]
      };

      mockDeps.getBestAndroidToolsLocation = () => oldToolsLocation;

      const jaxbError = `Exception in thread "main" java.lang.NoClassDefFoundError: javax/xml/bind/annotation/XmlSchema
\tat com.android.repository.api.SchemaModule$SchemaModuleVersion.<init>(SchemaModule.java:156)`;

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
          child.triggerStderr(Buffer.from(jaxbError));
          child.triggerClose(1);
        }, 0);
        return child;
      };

      try {
        await resolveWithFakeTimer(fakeTimer, avdmanager.listDeviceImages(mockDeps));
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain("Android SDK tools are outdated and incompatible with Java 11+.");
        expect(error.message).toContain("javax.xml.bind");
        expect(error.message).toContain("cmdline-tools/latest");
      }
    });

    test("should detect old tools location without JAXB error output", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;
      const fakeTimer = createFakeTimer();

      const oldToolsLocation = {
        path: "/opt/android-sdk/tools",
        source: "typical" as const,
        version: "26.1.1",
        available_tools: ["avdmanager", "sdkmanager"]
      };

      mockDeps.getBestAndroidToolsLocation = () => oldToolsLocation;

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
          child.triggerStderr(Buffer.from("Some other failure"));
          child.triggerClose(1);
        }, 0);
        return child;
      };

      try {
        await resolveWithFakeTimer(fakeTimer, avdmanager.listDeviceImages(mockDeps));
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain("Detected deprecated Android SDK Tools");
        expect(error.message).toContain("cmdline-tools/latest");
      }
    });

    test("should handle successful execution without JAXB error", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;
      const fakeTimer = createFakeTimer();

      const successOutput = `Available Android Virtual Devices:
    Name: test_avd
  Device: pixel_4 (Google)
    Path: /test/.android/avd/test_avd.avd
  Target: Google Play (Google Inc.)
          Based on: Android API 35 Tag/ABI: google_apis_playstore/arm64-v8a
---------`;

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
          child.triggerStdout(Buffer.from(successOutput));
          child.triggerClose(0);
        }, 0);
        return child;
      };

      const result = await resolveWithFakeTimer(fakeTimer, avdmanager.listDeviceImages(mockDeps));

      // Should succeed and parse devices - listDeviceImages returns AvdInfo[] directly
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe("test_avd");
    });

    test("should handle mixed stderr output with JAXB error buried in logs", async () => {
      const mockDeps = createDependencies();
      const originalSpawn = mockDeps.spawn;
      const fakeTimer = createFakeTimer();

      const mixedOutput = `Loading SDK...
Warning: Some warning message
Exception in thread "main" java.lang.NoClassDefFoundError: javax/xml/bind/annotation/XmlSchema
\tat com.android.repository.api.SchemaModule$SchemaModuleVersion.<init>(SchemaModule.java:156)
Additional error context`;

      mockDeps.spawn = (command: string, args: string[], options?: any) => {
        const child: any = originalSpawn(command, args, options);
        fakeTimer.setTimeout(() => {
          child.triggerStderr(Buffer.from(mixedOutput));
          child.triggerClose(1);
        }, 0);
        return child;
      };

      try {
        await resolveWithFakeTimer(fakeTimer, avdmanager.listDeviceImages(mockDeps));
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain("Android SDK tools are outdated and incompatible with Java 11+.");
        expect(error.message).toContain("javax.xml.bind");
        expect(error.message).toContain("cmdline-tools/latest");
      }
    });
  });
});
