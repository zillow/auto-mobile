import { describe, expect, test } from "bun:test";
import type { AndroidDoctorDependencies } from "../../src/doctor/checks/android";
import { checkAndroidCommandLineTools } from "../../src/doctor/checks/android";
import { FakeTimer } from "../fakes/FakeTimer";

const baseDependencies: AndroidDoctorDependencies = {
  detectAndroidCommandLineTools: async () => [],
  getBestAndroidToolsLocation: () => null,
  getAndroidHomeWithSystemImages: () => null,
  getAndroidHomeEnvValue: () => "/Users/test/Library/Android/sdk",
  cmdlineToolsInstaller: {
    install: async () => ({
      success: true,
      message: "Installed",
      path: "/Users/test/Library/Android/sdk/cmdline-tools/latest",
      version: "13114758"
    })
  },
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    setLogLevel: () => {},
    getLogLevel: () => "info",
    enableStdoutLogging: () => {},
    disableStdoutLogging: () => {},
    close: () => {}
  }
};

describe("Android doctor command line tools check", () => {
  test("warns when Homebrew tools are used and system images are in ANDROID_HOME", async () => {
    const homebrewLocation = {
      path: "/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest",
      source: "homebrew" as const,
      available_tools: ["avdmanager", "sdkmanager"]
    };

    const result = await checkAndroidCommandLineTools({}, {
      ...baseDependencies,
      detectAndroidCommandLineTools: async () => [homebrewLocation],
      getBestAndroidToolsLocation: () => homebrewLocation,
      getAndroidHomeWithSystemImages: () => ({
        androidHome: "/Users/test/Library/Android/sdk",
        systemImagesPath: "/Users/test/Library/Android/sdk/system-images"
      })
    });

    expect(result.status).toBe("warn");
    expect(result.message).toContain("Homebrew cmdline-tools detected");
  });

  test("passes when tools are detected via ANDROID_SDK_ROOT", async () => {
    const sdkRootLocation = {
      path: "/Users/test/Library/Android/sdk/cmdline-tools/latest",
      source: "android_sdk_root" as const,
      available_tools: ["avdmanager", "sdkmanager"]
    };

    const result = await checkAndroidCommandLineTools({}, {
      ...baseDependencies,
      detectAndroidCommandLineTools: async () => [sdkRootLocation],
      getBestAndroidToolsLocation: () => sdkRootLocation
    });

    expect(result.status).toBe("pass");
    expect(result.message).toContain("detected");
  });

  test("warns when install is requested without ANDROID_HOME", async () => {
    let installerCalled = false;

    const result = await checkAndroidCommandLineTools({ installCmdlineTools: true }, {
      ...baseDependencies,
      getAndroidHomeEnvValue: () => undefined,
      cmdlineToolsInstaller: {
        install: async () => {
          installerCalled = true;
          return {
            success: true,
            message: "Installed",
            path: "/Users/test/Library/Android/sdk/cmdline-tools/latest",
            version: "13114758"
          };
        }
      }
    });

    expect(result.status).toBe("warn");
    expect(result.message).toContain("ANDROID_HOME is not set");
    expect(installerCalled).toBe(false);
  });

  test("installs when install flag is set", async () => {
    const fakeTimer = new FakeTimer();
    const installCalls: string[] = [];

    const resultPromise = checkAndroidCommandLineTools({ installCmdlineTools: true }, {
      ...baseDependencies,
      cmdlineToolsInstaller: {
        install: async () => {
          installCalls.push("install");
          await fakeTimer.sleep(0);
          return {
            success: true,
            message: "Installed",
            path: "/Users/test/Library/Android/sdk/cmdline-tools/latest",
            version: "13114758"
          };
        }
      }
    });

    fakeTimer.advanceTime(0);
    const result = await resultPromise;

    expect(installCalls).toHaveLength(1);
    expect(result.status).toBe("pass");
    expect(result.value).toContain("cmdline-tools/latest");
  });

  test("allows install when ANDROID_HOME is set", async () => {
    const installCalls: string[] = [];

    const result = await checkAndroidCommandLineTools({ installCmdlineTools: true }, {
      ...baseDependencies,
      getAndroidHomeEnvValue: () => "/Users/test/Library/Android/sdk",
      cmdlineToolsInstaller: {
        install: async () => {
          installCalls.push("install");
          return {
            success: true,
            message: "Installed",
            path: "/Users/test/Library/Android/sdk/cmdline-tools/latest",
            version: "13114758"
          };
        }
      }
    });

    expect(installCalls).toHaveLength(1);
    expect(result.status).toBe("pass");
  });
});
