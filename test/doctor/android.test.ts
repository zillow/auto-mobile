import { expect, describe, test } from "bun:test";
import type { AndroidDoctorDependencies } from "../../src/doctor/checks/android";
import { checkAndroidCommandLineTools } from "../../src/doctor/checks/android";
import { FakeTimer } from "../fakes/FakeTimer";

describe("Android doctor command line tools check", () => {
  const baseDependencies: AndroidDoctorDependencies = {
    detectAndroidCommandLineTools: async () => [],
    getBestAndroidToolsLocation: () => null,
    getAndroidHomeWithSystemImages: () => null,
    getAndroidSdkFromEnvironment: () => "/Users/test/Library/Android/sdk",
    installCmdlineTools: async () => ({
      success: true,
      message: "Installed",
      androidHome: "/Users/test/Library/Android/sdk",
      installedPath: "/Users/test/Library/Android/sdk/cmdline-tools/latest"
    }),
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

  test("should warn when Homebrew tools are used and system images are in ANDROID_HOME", async () => {
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

  test("should pass when tools are not from Homebrew", async () => {
    const sdkLocation = {
      path: "/Users/test/Library/Android/sdk/cmdline-tools/latest",
      source: "android_home" as const,
      available_tools: ["avdmanager", "sdkmanager"]
    };

    const result = await checkAndroidCommandLineTools({}, {
      ...baseDependencies,
      detectAndroidCommandLineTools: async () => [sdkLocation],
      getBestAndroidToolsLocation: () => sdkLocation,
      getAndroidHomeWithSystemImages: () => ({
        androidHome: "/Users/test/Library/Android/sdk",
        systemImagesPath: "/Users/test/Library/Android/sdk/system-images"
      })
    });

    expect(result.status).toBe("pass");
    expect(result.message).toContain("detected");
  });

  test("should warn when install is requested without ANDROID_HOME", async () => {
    const result = await checkAndroidCommandLineTools({ installCmdlineTools: true }, {
      ...baseDependencies,
      getAndroidSdkFromEnvironment: () => null
    });

    expect(result.status).toBe("warn");
    expect(result.message).toContain("ANDROID_HOME is not set");
  });

  test("should install when install flag is set", async () => {
    const fakeTimer = new FakeTimer();
    const installCalls: string[] = [];

    const resultPromise = checkAndroidCommandLineTools({ installCmdlineTools: true }, {
      ...baseDependencies,
      installCmdlineTools: async () => {
        installCalls.push("install");
        await fakeTimer.sleep(0);
        return {
          success: true,
          message: "Installed",
          androidHome: "/Users/test/Library/Android/sdk",
          installedPath: "/Users/test/Library/Android/sdk/cmdline-tools/latest"
        };
      }
    });

    fakeTimer.advanceTime(0);
    const result = await resultPromise;

    expect(installCalls).toHaveLength(1);
    expect(result.status).toBe("pass");
    expect(result.value).toContain("cmdline-tools/latest");
  });
});
