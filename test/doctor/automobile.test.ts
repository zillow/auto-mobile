import { describe, test, expect, beforeEach } from "bun:test";
import { checkVersion, checkCtrlProxy } from "../../src/doctor/checks/automobile";
import { RELEASE_VERSION } from "../../src/constants/release";
import { FakeAdbExecutor } from "../fakes/FakeAdbExecutor";
import type { AdbClientFactory } from "../../src/utils/android-cmdline-tools/AdbClientFactory";

describe("checkVersion", () => {
  test("returns pass status", () => {
    const result = checkVersion();

    expect(result.status).toBe("pass");
  });

  test("includes version in message", () => {
    const result = checkVersion();

    expect(result.message).toBe(`Version ${RELEASE_VERSION}`);
    expect(result.value).toBe(RELEASE_VERSION);
  });

  test("has correct name", () => {
    const result = checkVersion();

    expect(result.name).toBe("AutoMobile Version");
  });
});

describe("checkCtrlProxy", () => {
  let fakeAdb: FakeAdbExecutor;
  let fakeFactory: AdbClientFactory;

  beforeEach(() => {
    fakeAdb = new FakeAdbExecutor();
    fakeFactory = {
      create: () => fakeAdb,
    };
  });

  test("returns skip when no devices connected", async () => {
    fakeAdb.setDevices([]);

    const result = await checkCtrlProxy(fakeFactory);

    expect(result.name).toBe("CtrlProxy");
    expect(result.status).toBe("skip");
    expect(result.message).toBe("No Android devices connected");
  });
});
