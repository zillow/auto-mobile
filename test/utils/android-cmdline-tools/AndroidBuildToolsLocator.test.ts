import { expect, describe, test, beforeEach } from "bun:test";
import { DefaultAndroidBuildToolsLocator } from "../../../src/utils/android-cmdline-tools/AndroidBuildToolsLocator";
import { FakeSystemDetection } from "../../fakes/FakeSystemDetection";
import { FakeFileSystem } from "../../fakes/FakeFileSystem";
import { join } from "path";

describe("DefaultAndroidBuildToolsLocator", () => {
  let systemDetection: FakeSystemDetection;
  let fileSystem: FakeFileSystem;

  beforeEach(() => {
    systemDetection = new FakeSystemDetection();
    fileSystem = new FakeFileSystem();
  });

  test("uses aapt2 from PATH when available", async () => {
    systemDetection.setPlatform("darwin");
    systemDetection.setExecResponse("which aapt2", "/usr/local/bin/aapt2\n");

    const locator = new DefaultAndroidBuildToolsLocator(fileSystem, systemDetection);
    const tool = await locator.findAaptTool();

    expect(tool).toEqual({ tool: "aapt2", path: "/usr/local/bin/aapt2" });
  });

  test("prefers aapt2 in build-tools over aapt", async () => {
    systemDetection.setPlatform("darwin");
    systemDetection.setEnvVar("ANDROID_HOME", "/sdk");
    systemDetection.addExistingFile("/sdk");

    fileSystem.setDirectory("/sdk/build-tools");
    fileSystem.setFile(join("/sdk/build-tools", "35.0.0", "aapt"), "");
    fileSystem.setFile(join("/sdk/build-tools", "34.0.0", "aapt2"), "");

    const locator = new DefaultAndroidBuildToolsLocator(fileSystem, systemDetection);
    const tool = await locator.findAaptTool();

    expect(tool).toEqual({ tool: "aapt2", path: join("/sdk/build-tools", "34.0.0", "aapt2") });
  });
});
