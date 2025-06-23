import { expect } from "chai";
import { describe, it } from "mocha";
import {
  DEFAULT_REQUIRED_TOOLS,
  CMDLINE_TOOLS_DOWNLOAD,
  getDefaultInstallPath
} from "../../../src/utils/android-cmdline-tools/install";

describe("Android Command Line Tools - Installation", () => {
  describe("DEFAULT_REQUIRED_TOOLS", () => {
    it("should contain essential Android tools", () => {
      expect(DEFAULT_REQUIRED_TOOLS).to.deep.equal([
        "apkanalyzer",
        "avdmanager",
        "sdkmanager"
      ]);
    });
  });

  describe("CMDLINE_TOOLS_DOWNLOAD", () => {
    it("should have correct download information", () => {
      expect(CMDLINE_TOOLS_DOWNLOAD.version).to.equal("13114758");
      expect(CMDLINE_TOOLS_DOWNLOAD.baseUrl).to.equal("https://dl.google.com/android/repository");
      expect(CMDLINE_TOOLS_DOWNLOAD.platforms).to.have.keys(["darwin", "linux", "win32"]);

      // Check platform-specific info
      expect(CMDLINE_TOOLS_DOWNLOAD.platforms.darwin.filename).to.contain("mac");
      expect(CMDLINE_TOOLS_DOWNLOAD.platforms.linux.filename).to.contain("linux");
      expect(CMDLINE_TOOLS_DOWNLOAD.platforms.win32.filename).to.contain("win");

      // Check checksums are present
      Object.values(CMDLINE_TOOLS_DOWNLOAD.platforms).forEach(platform => {
        expect(platform.checksum).to.be.a("string").with.length(64); // SHA-256 hex
      });
    });
  });

  describe("getDefaultInstallPath", () => {
    it("should return a valid path string", () => {
      const result = getDefaultInstallPath();
      expect(result).to.be.a("string");
      expect(result).to.not.be.empty;
    });
  });
});
