import { describe, expect, test } from "bun:test";
import { createHash, X509Certificate } from "crypto";
import { XcodeSigningManager } from "../../../src/utils/ios-cmdline-tools/XcodeSigning";
import { FakeTimer } from "../../fakes/FakeTimer";

const CERT_BASE64 = "MIIDETCCAfmgAwIBAgIUJQItJgRhsTPNGV58eJPhAw9xIWcwDQYJKoZIhvcNAQELBQAwGDEWMBQGA1UEAwwNVGVzdCBEZXYgQ2VydDAeFw0yNjAxMTgxOTE5MzVaFw0yNzAxMTgxOTE5MzVaMBgxFjAUBgNVBAMMDVRlc3QgRGV2IENlcnQwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDCXt1bEnb5HFGXYeCDJfGUK6A84+6ZowKRvfP4F9XmLn24Pp0bvd0sam7Ayp6rFMkRcCUJ0FmcEUV/JbW30uGmFlrCQG4k4Rved/xrXIYZK1ny2Z5hH0AG13JiStLIqUTARgx1NDnlQl18b5R8OjeXeWD79x/RFrNUyIinW2fnv3jzF8jjme6P3f8pK+TJmLIZQGpNQT+FApApOnND2AEh+RhjnJi3AIDXIpBo8dFhXmOqfE5mtb5gzIyKPrc15l74kW8ndxFoVjJtMinzjbYIsI6t4wOkTJn0hZYDwWHwBfx622cK35zxcGok16EbCdJlfdGxNseeUxWAJoki+MaZAgMBAAGjUzBRMB0GA1UdDgQWBBR4aCibWRc1OiPPqD0CqjTneWJcnTAfBgNVHSMEGDAWgBR4aCibWRc1OiPPqD0CqjTneWJcnTAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQAXZsPO3k4url4xeggh0AHjZHH4/FQUKPlrKH1+icN/PrPDqc3ubiuLynTN6oHYMM6bHF1i7/fjTXfwtSH4Y28YnLNA/5Yywz+A2PAr0VlMFDGNn9clM5AiZUrpwhOzRIC2opiSgUBVXcHJr9DlCo227ZaM4EmWlFPwyY6LNUyPfqECwFKmDgtuzSqICOGyJy2s1MGXUiWqeyyJgRe1ZdLhNaC3+3/I/0YBm6TYP8anir7vYZCyCDDEtOlNdv9+qQHtoym1f02VRpntDF+k5qiHPICFDVwHCaSXIoghyEqD3y9HH9GWiGKze3mXB7xofhGUL9ATLpRWrzxHSGVS6shr";

const deviceUdid = "00008030001E28C11E";
const profileUuid = "A0B1C2D3-E4F5-6789-ABCD-EF0123456789";
const profileName = "AutoMobile CtrlProxy";
const teamId = "TEAM12345";

const profileXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>UUID</key>
    <string>${profileUuid}</string>
    <key>Name</key>
    <string>${profileName}</string>
    <key>TeamIdentifier</key>
    <array>
      <string>${teamId}</string>
    </array>
    <key>TeamName</key>
    <string>AutoMobile Team</string>
    <key>CreationDate</key>
    <date>2024-01-01T00:00:00Z</date>
    <key>ExpirationDate</key>
    <date>2030-01-01T00:00:00Z</date>
    <key>ProvisionsAllDevices</key>
    <false/>
    <key>ProvisionedDevices</key>
    <array>
      <string>${deviceUdid}</string>
    </array>
    <key>Entitlements</key>
    <dict>
      <key>get-task-allow</key>
      <true/>
      <key>application-identifier</key>
      <string>${teamId}.dev.jasonpearson.automobile.ctrlproxy</string>
    </dict>
    <key>DeveloperCertificates</key>
    <array>
      <data>${CERT_BASE64}</data>
    </array>
  </dict>
</plist>`;

const buildFingerprint = (certBase64: string): string => {
  const raw = Buffer.from(certBase64, "base64");
  const cert = new X509Certificate(raw);
  return createHash("sha256").update(cert.raw).digest("hex").toUpperCase();
};

const createFakeDependencies = (options?: { identities?: string; profiles?: string[] }) => {
  const fakeTimer = new FakeTimer();
  fakeTimer.enableAutoAdvance();
  const writtenFiles: string[] = [];
  const exec = async (command: string) => {
    if (command.includes("security cms -D -i")) {
      return {
        stdout: profileXml,
        stderr: "",
        toString() { return this.stdout; },
        trim() { return this.stdout.trim(); },
        includes(searchString: string) { return this.stdout.includes(searchString); }
      };
    }
    if (command.includes("security find-identity")) {
      const output = options?.identities ?? "";
      return {
        stdout: output,
        stderr: "",
        toString() { return this.stdout; },
        trim() { return this.stdout.trim(); },
        includes(searchString: string) { return this.stdout.includes(searchString); }
      };
    }
    return {
      stdout: "",
      stderr: "",
      toString() { return this.stdout; },
      trim() { return this.stdout.trim(); },
      includes(searchString: string) { return this.stdout.includes(searchString); }
    };
  };

  return {
    deps: {
      platform: () => "darwin" as const,
      exec,
      xcodebuild: {
        executeCommand: async (args: string[]) => {
          if (args.includes("-showBuildSettings")) {
            return {
              stdout: `DEVELOPMENT_TEAM = ${teamId}`,
              stderr: "",
              toString() { return this.stdout; },
              trim() { return this.stdout.trim(); },
              includes(searchString: string) { return this.stdout.includes(searchString); }
            };
          }
          return {
            stdout: "",
            stderr: "",
            toString() { return this.stdout; },
            trim() { return this.stdout.trim(); },
            includes(searchString: string) { return this.stdout.includes(searchString); }
          };
        },
        isAvailable: async () => true
      },
      readDir: async () => options?.profiles ?? ["test.mobileprovision"],
      readFile: async () => "",
      stat: async () => ({ isFile: () => true }),
      writeFile: async (path: string) => { writtenFiles.push(path); },
      mkdir: async () => {},
      homedir: () => "/Users/test",
      now: () => fakeTimer.now()
    },
    writtenFiles
  };
};

describe("XcodeSigningManager", () => {
  test("selects manual signing when a matching profile and identity exist", async () => {
    const fingerprint = buildFingerprint(CERT_BASE64);
    const identityOutput = `  1) ${fingerprint} "Apple Development: Test (${teamId})"
     1 valid identities found`;
    const { deps, writtenFiles } = createFakeDependencies({ identities: identityOutput });
    const manager = new XcodeSigningManager(deps);

    const resolution = await manager.resolveSigningForDevice(deviceUdid);

    expect(resolution.style).toBe("manual");
    expect(resolution.profile?.uuid).toBe(profileUuid);
    expect(resolution.identity?.fingerprint).toBe(fingerprint);
    expect(resolution.buildSettings.join(" ")).toContain("CODE_SIGN_STYLE=Manual");
    expect(resolution.buildSettings.join(" ")).toContain(`PROVISIONING_PROFILE_SPECIFIER=\"${profileName}\"`);
    expect(writtenFiles.length).toBe(1);
  });

  test("falls back to automatic signing when identity is missing", async () => {
    const { deps } = createFakeDependencies({ identities: "" });
    const manager = new XcodeSigningManager(deps);

    const resolution = await manager.resolveSigningForDevice(deviceUdid);

    expect(resolution.style).toBe("automatic");
    expect(resolution.allowProvisioningUpdates).toBe(true);
  });
});
