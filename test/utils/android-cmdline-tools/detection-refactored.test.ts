import { expect, describe, test, beforeEach } from "bun:test";
import {
  getTypicalAndroidSdkPaths,
  getHomebrewAndroidToolsPath,
  getAndroidSdkFromEnvironment
} from "../../../src/utils/android-cmdline-tools/detection";
import { FakeSystemDetection } from "../../fakes/FakeSystemDetection";

const normalizePath = (value: string): string => value.replace(/\\/g, "/");

describe("Detection Module (Refactored)", () => {
  let systemDetection: FakeSystemDetection;

  beforeEach(() => {
    systemDetection = new FakeSystemDetection();
  });

  describe("getTypicalAndroidSdkPaths", () => {
    test("should return macOS paths when platform is darwin", () => {
      systemDetection.setPlatform("darwin");
      systemDetection.setHomeDir("/Users/testuser");

      const paths = getTypicalAndroidSdkPaths(systemDetection).map(normalizePath);

      expect(paths).toContain("/Users/testuser/Library/Android/sdk");
      expect(paths).toContain("/opt/android-sdk");
      expect(paths).toContain("/usr/local/android-sdk");
    });

    test("should return Linux paths when platform is linux", () => {
      systemDetection.setPlatform("linux");
      systemDetection.setHomeDir("/home/testuser");

      const paths = getTypicalAndroidSdkPaths(systemDetection).map(normalizePath);

      expect(paths).toContain("/home/testuser/Android/Sdk");
      expect(paths).toContain("/opt/android-sdk");
      expect(paths).toContain("/usr/local/android-sdk");
    });
  });

  describe("getHomebrewAndroidToolsPath", () => {
    test("should return null for non-macOS platforms", () => {
      systemDetection.setPlatform("linux");

      const path = getHomebrewAndroidToolsPath(systemDetection);

      expect(path).toBeNull();
    });

    test("should return path when homebrew installation exists on macOS", () => {
      systemDetection.setPlatform("darwin");
      systemDetection.addExistingFile("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest");

      const path = getHomebrewAndroidToolsPath(systemDetection);

      expect(path).toBe("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest");
    });
  });

  describe("getAndroidSdkFromEnvironment", () => {
    test("should return ANDROID_HOME path when it exists", () => {
      systemDetection.setEnvVar("ANDROID_HOME", "/path/to/android-home");
      systemDetection.addExistingFile("/path/to/android-home");

      const path = getAndroidSdkFromEnvironment(systemDetection);

      expect(path).toBe("/path/to/android-home");
    });

    test("should return null when no environment variables are set", () => {
      const path = getAndroidSdkFromEnvironment(systemDetection);

      expect(path).toBeNull();
    });
  });
});
