import { expect, describe, test } from "bun:test";
import type { CmdlineToolsInstallerDependencies, InstallCmdlineToolsParams } from "../../../src/utils/android-cmdline-tools/cmdlineToolsInstaller";
import { installCmdlineTools } from "../../../src/utils/android-cmdline-tools/cmdlineToolsInstaller";
import { FakeTimer } from "../../fakes/FakeTimer";

describe("Android Command Line Tools - Installer", () => {
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

    on = (event: string, cb: any) => {
      if (event === "close") {this.closeCallbacks.push(cb);}
      if (event === "error") {this.errorCallbacks.push(cb);}
    };

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

  function createDependencies(overrides: Partial<CmdlineToolsInstallerDependencies> = {}): CmdlineToolsInstallerDependencies {
    const noOp = () => {};
    return {
      spawn: overrides.spawn ?? (() => new MockChild()),
      existsSync: overrides.existsSync ?? (() => false),
      mkdirSync: overrides.mkdirSync ?? noOp,
      rmSync: overrides.rmSync ?? noOp,
      renameSync: overrides.renameSync ?? noOp,
      mkdtempSync: overrides.mkdtempSync ?? (() => "/tmp/auto-mobile-cmdline-tools-test"),
      tmpdir: overrides.tmpdir ?? (() => "/tmp"),
      platform: overrides.platform ?? (() => "darwin"),
      logger: {
        info: noOp,
        warn: noOp,
        error: noOp,
        debug: noOp,
        setLogLevel: noOp,
        getLogLevel: () => "info",
        enableStdoutLogging: noOp,
        disableStdoutLogging: noOp,
        close: noOp
      }
    };
  }

  async function resolveWithFakeTimer<T>(timer: FakeTimer, promise: Promise<T>): Promise<T> {
    await Promise.resolve();
    timer.advanceTime(0);
    await Promise.resolve();
    timer.advanceTime(0);
    return await promise;
  }

  test("should skip installation when tools are already installed", async () => {
    const androidHome = "/Users/test/Library/Android/sdk";
    const existingPaths = new Set<string>([
      `${androidHome}/cmdline-tools/latest/bin/sdkmanager`
    ]);

    const spawnCalls: string[] = [];
    const deps = createDependencies({
      existsSync: path => existingPaths.has(path),
      spawn: (command, args) => {
        spawnCalls.push(`${command} ${args.join(" ")}`);
        return new MockChild();
      }
    });

    const result = await installCmdlineTools({ androidHome }, deps);

    expect(result.success).toBe(true);
    expect(result.message).toContain("already installed");
    expect(spawnCalls).toHaveLength(0);
  });

  test("should download and install command line tools", async () => {
    const androidHome = "/Users/test/Library/Android/sdk";
    const tempDir = "/tmp/auto-mobile-cmdline-tools-123";
    const existingPaths = new Set<string>([
      `${tempDir}/cmdline-tools`
    ]);

    const spawnCalls: string[] = [];
    const renameCalls: Array<{ from: string; to: string }> = [];
    const rmCalls: string[] = [];
    const fakeTimer = new FakeTimer();

    const deps = createDependencies({
      existsSync: path => existingPaths.has(path),
      mkdtempSync: () => tempDir,
      spawn: (command, args) => {
        spawnCalls.push(`${command} ${args.join(" ")}`);
        const child = new MockChild();
        fakeTimer.setTimeout(() => {
          child.triggerClose(0);
        }, 0);
        return child;
      },
      renameSync: (from, to) => {
        renameCalls.push({ from, to });
      },
      rmSync: (path) => {
        rmCalls.push(path);
      }
    });

    const resultPromise = installCmdlineTools({ androidHome }, deps);
    const result = await resolveWithFakeTimer(fakeTimer, resultPromise);

    expect(result.success).toBe(true);
    expect(result.installedPath).toBe(`${androidHome}/cmdline-tools/latest`);
    expect(spawnCalls[0]).toContain("curl");
    expect(spawnCalls[1]).toContain("unzip");
    expect(renameCalls[0]).toEqual({
      from: `${tempDir}/cmdline-tools`,
      to: `${androidHome}/cmdline-tools/latest`
    });
    expect(rmCalls).toContain(tempDir);
  });

  test("should surface download failures", async () => {
    const androidHome = "/Users/test/Library/Android/sdk";
    const fakeTimer = new FakeTimer();

    const deps = createDependencies({
      spawn: () => {
        const child = new MockChild();
        fakeTimer.setTimeout(() => {
          child.triggerStderr(Buffer.from("download failed"));
          child.triggerClose(1);
        }, 0);
        return child;
      }
    });

    const resultPromise = installCmdlineTools({ androidHome } as InstallCmdlineToolsParams, deps);
    const result = await resolveWithFakeTimer(fakeTimer, resultPromise);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Failed to download");
  });

  test("should fail on unsupported platforms", async () => {
    const deps = createDependencies({
      platform: () => "win32"
    });

    const result = await installCmdlineTools({}, deps);

    expect(result.success).toBe(false);
    expect(result.message).toContain("supported on macOS and Linux only");
  });
});
