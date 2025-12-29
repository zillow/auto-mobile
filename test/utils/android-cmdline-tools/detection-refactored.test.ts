import { expect } from "chai";
import {
  getTypicalAndroidSdkPaths,
  getHomebrewAndroidToolsPath,
  getAndroidSdkFromEnvironment
} from "../../../src/utils/android-cmdline-tools/detection";
import { FakeSystemDetection } from "../../fakes/FakeSystemDetection";

describe("Detection Module (Refactored)", () => {
  let systemDetection: FakeSystemDetection;

  beforeEach(() => {
    systemDetection = new FakeSystemDetection();
  });

  describe("getTypicalAndroidSdkPaths", () => {
    it("should return macOS paths when platform is darwin", () => {
      systemDetection.setPlatform("darwin");
      systemDetection.setHomeDir("/Users/testuser");

      const paths = getTypicalAndroidSdkPaths(systemDetection);

      expect(paths).to.include("/Users/testuser/Library/Android/sdk");
      expect(paths).to.include("/opt/android-sdk");
      expect(paths).to.include("/usr/local/android-sdk");
    });

    it("should return Linux paths when platform is linux", () => {
      systemDetection.setPlatform("linux");
      systemDetection.setHomeDir("/home/testuser");

      const paths = getTypicalAndroidSdkPaths(systemDetection);

      expect(paths).to.include("/home/testuser/Android/Sdk");
      expect(paths).to.include("/opt/android-sdk");
      expect(paths).to.include("/usr/local/android-sdk");
    });
  });

  describe("getHomebrewAndroidToolsPath", () => {
    it("should return null for non-macOS platforms", () => {
      systemDetection.setPlatform("linux");

      const path = getHomebrewAndroidToolsPath(systemDetection);

      expect(path).to.be.null;
    });

    it("should return path when homebrew installation exists on macOS", () => {
      systemDetection.setPlatform("darwin");
      systemDetection.addExistingFile("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest");

      const path = getHomebrewAndroidToolsPath(systemDetection);

      expect(path).to.equal("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest");
    });
  });

  describe("getAndroidSdkFromEnvironment", () => {
    it("should return ANDROID_HOME path when it exists", () => {
      systemDetection.setEnvVar("ANDROID_HOME", "/path/to/android-home");
      systemDetection.addExistingFile("/path/to/android-home");

      const path = getAndroidSdkFromEnvironment(systemDetection);

      expect(path).to.equal("/path/to/android-home");
    });

    it("should return null when no environment variables are set", () => {
      const path = getAndroidSdkFromEnvironment(systemDetection);

      expect(path).to.be.null;
    });
  });
});
