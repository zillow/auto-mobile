import { expect } from "chai";
import sinon from "sinon";
import {
  getTypicalAndroidSdkPaths,
  getHomebrewAndroidToolsPath,
  getAndroidSdkFromEnvironment,
  DetectionDependencies
} from "../../../src/utils/android-cmdline-tools/detection";

describe("Detection Module (Refactored)", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("getTypicalAndroidSdkPaths", () => {
    it("should return macOS paths when platform is darwin", () => {
      const mockDependencies: DetectionDependencies = {
        exec: sandbox.stub(),
        existsSync: sandbox.stub(),
        platform: sandbox.stub().returns("darwin"),
        homedir: sandbox.stub().returns("/Users/testuser"),
        logger: {
          info: sandbox.stub(),
          warn: sandbox.stub(),
          error: sandbox.stub()
        } as any
      };

      const paths = getTypicalAndroidSdkPaths(mockDependencies);

      expect(paths).to.include("/Users/testuser/Library/Android/sdk");
      expect(paths).to.include("/opt/android-sdk");
      expect(paths).to.include("/usr/local/android-sdk");
    });

    it("should return Linux paths when platform is linux", () => {
      const mockDependencies: DetectionDependencies = {
        exec: sandbox.stub(),
        existsSync: sandbox.stub(),
        platform: sandbox.stub().returns("linux"),
        homedir: sandbox.stub().returns("/home/testuser"),
        logger: {
          info: sandbox.stub(),
          warn: sandbox.stub(),
          error: sandbox.stub()
        } as any
      };

      const paths = getTypicalAndroidSdkPaths(mockDependencies);

      expect(paths).to.include("/home/testuser/Android/Sdk");
      expect(paths).to.include("/opt/android-sdk");
      expect(paths).to.include("/usr/local/android-sdk");
    });
  });

  describe("getHomebrewAndroidToolsPath", () => {
    it("should return null for non-macOS platforms", () => {
      const mockDependencies: DetectionDependencies = {
        exec: sandbox.stub(),
        existsSync: sandbox.stub(),
        platform: sandbox.stub().returns("linux"),
        homedir: sandbox.stub(),
        logger: {
          info: sandbox.stub(),
          warn: sandbox.stub(),
          error: sandbox.stub()
        } as any
      };

      const path = getHomebrewAndroidToolsPath(mockDependencies);

      expect(path).to.be.null;
    });

    it("should return path when homebrew installation exists on macOS", () => {
      const mockDependencies: DetectionDependencies = {
        exec: sandbox.stub(),
        existsSync: sandbox.stub().returns(true),
        platform: sandbox.stub().returns("darwin"),
        homedir: sandbox.stub(),
        logger: {
          info: sandbox.stub(),
          warn: sandbox.stub(),
          error: sandbox.stub()
        } as any
      };

      const path = getHomebrewAndroidToolsPath(mockDependencies);

      expect(path).to.equal("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest");
      expect(mockDependencies.existsSync).to.have.been.calledWith("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest");
    });
  });

  describe("getAndroidSdkFromEnvironment", () => {
    it("should return ANDROID_HOME path when it exists", () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv, ANDROID_HOME: "/path/to/android-home" };

      const mockDependencies: DetectionDependencies = {
        exec: sandbox.stub(),
        existsSync: sandbox.stub().withArgs("/path/to/android-home").returns(true),
        platform: sandbox.stub(),
        homedir: sandbox.stub(),
        logger: {
          info: sandbox.stub(),
          warn: sandbox.stub(),
          error: sandbox.stub()
        } as any
      };

      const path = getAndroidSdkFromEnvironment(mockDependencies);

      expect(path).to.equal("/path/to/android-home");

      // Restore environment
      process.env = originalEnv;
    });

    it("should return null when no environment variables are set", () => {
      const originalEnv = process.env;
      process.env = {};

      const mockDependencies: DetectionDependencies = {
        exec: sandbox.stub(),
        existsSync: sandbox.stub(),
        platform: sandbox.stub(),
        homedir: sandbox.stub(),
        logger: {
          info: sandbox.stub(),
          warn: sandbox.stub(),
          error: sandbox.stub()
        } as any
      };

      const path = getAndroidSdkFromEnvironment(mockDependencies);

      expect(path).to.be.null;

      // Restore environment
      process.env = originalEnv;
    });
  });
});
