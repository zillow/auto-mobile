import { describe, expect, test } from "bun:test";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { DeviceAppInspector, parseDevicectlJsonOutputPath } from "../../../src/utils/ios-cmdline-tools/DeviceAppInspector";
import { hashAppBundle } from "../../../src/utils/ios-cmdline-tools/AppBundleHasher";
import { FakeHostControlDeviceAppInspector } from "../../fakes/FakeHostControlDeviceAppInspector";

const bundleId = "dev.jasonpearson.automobile.ctrlproxy";

const createTempDir = async (): Promise<string> => {
  return fs.mkdtemp(join(tmpdir(), "automobile-device-"));
};

const createFixtureApp = async (root: string): Promise<string> => {
  const appDir = join(root, "CtrlProxyApp.app");
  await fs.mkdir(appDir, { recursive: true });
  await fs.writeFile(join(appDir, "Info.plist"), "info", "utf-8");
  return appDir;
};

const parseArgValue = (command: string, arg: string): string | null => {
  const match = command.match(new RegExp(`${arg}\\s+([^\\s]+)`));
  if (!match) {
    return null;
  }
  return match[1].replace(/^['"]|['"]$/g, "");
};

describe("DeviceAppInspector", () => {
  test("computes installed app hash via devicectl copy", async () => {
    const workDir = await createTempDir();
    const fixtureApp = await createFixtureApp(workDir);
    const fixtureHash = await hashAppBundle(fixtureApp);
    const hostControl = new FakeHostControlDeviceAppInspector();

    const exec = async (command: string) => {
      if (command.includes("device info apps")) {
        const jsonPath = parseDevicectlJsonOutputPath(command);
        if (jsonPath) {
          const payload = {
            apps: [
              {
                bundleIdentifier: bundleId,
                bundleURL: "file:///private/var/containers/Bundle/Application/ABC/CtrlProxyApp.app"
              }
            ]
          };
          await fs.writeFile(jsonPath, JSON.stringify(payload), "utf-8");
        }
      }
      if (command.includes("device copy from")) {
        const destination = parseArgValue(command, "--destination");
        if (destination) {
          const target = join(destination, "CtrlProxyApp.app");
          await fs.mkdir(target, { recursive: true });
          await fs.copyFile(join(fixtureApp, "Info.plist"), join(target, "Info.plist"));
        }
      }
      return {
        stdout: "",
        stderr: "",
        toString() { return this.stdout; },
        trim() { return this.stdout.trim(); },
        includes(searchString: string) { return this.stdout.includes(searchString); }
      };
    };

    const inspector = new DeviceAppInspector({
      platform: () => "darwin",
      exec,
      readFile: async path => fs.readFile(path, "utf-8"),
      mkdtemp: async prefix => fs.mkdtemp(prefix),
      rm: async path => fs.rm(path, { recursive: true, force: true }),
      readdir: async path => fs.readdir(path),
      stat: async path => fs.stat(path),
      tmpdir,
      hostControl
    });

    const hash = await inspector.getInstalledAppBundleHash("device-udid", bundleId);
    expect(hash).toBe(fixtureHash);
  });

  test("delegates app hash to host control when enabled", async () => {
    const hostControl = new FakeHostControlDeviceAppInspector();
    hostControl.setUseHostControl(true);
    hostControl.setRunningInDocker(true);
    hostControl.setAvailable(true);
    hostControl.setAppHash("host-hash");

    const inspector = new DeviceAppInspector({
      platform: () => "linux",
      exec: async () => ({
        stdout: "",
        stderr: "",
        toString() { return this.stdout; },
        trim() { return this.stdout.trim(); },
        includes(searchString: string) { return this.stdout.includes(searchString); }
      }),
      readFile: async () => "",
      mkdtemp: async prefix => fs.mkdtemp(prefix),
      rm: async path => fs.rm(path, { recursive: true, force: true }),
      readdir: async path => fs.readdir(path),
      stat: async path => fs.stat(path),
      tmpdir,
      hostControl
    });

    const hash = await inspector.getInstalledAppBundleHash("device-udid", bundleId);
    expect(hash).toBe("host-hash");
  });

  test("uninstallApp issues devicectl uninstall command", async () => {
    const commands: string[] = [];
    const hostControl = new FakeHostControlDeviceAppInspector();
    const exec = async (command: string) => {
      commands.push(command);
      return {
        stdout: "",
        stderr: "",
        toString() { return this.stdout; },
        trim() { return this.stdout.trim(); },
        includes(searchString: string) { return this.stdout.includes(searchString); }
      };
    };

    const inspector = new DeviceAppInspector({
      platform: () => "darwin",
      exec,
      readFile: async path => fs.readFile(path, "utf-8"),
      mkdtemp: async prefix => fs.mkdtemp(prefix),
      rm: async path => fs.rm(path, { recursive: true, force: true }),
      readdir: async path => fs.readdir(path),
      stat: async path => fs.stat(path),
      tmpdir,
      hostControl
    });

    await inspector.uninstallApp("device-udid", bundleId);

    expect(commands.some(command => command.includes("devicectl device uninstall app"))).toBe(true);
    expect(commands.some(command => command.includes(bundleId))).toBe(true);
  });
});
