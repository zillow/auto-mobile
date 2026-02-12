import { describe, expect, test } from "bun:test";
import {
  checkOperatingSystem,
  checkArchitecture,
  checkRuntime,
  runSystemChecks,
} from "../../src/doctor/checks/system";

describe("system doctor checks", () => {
  test("checkOperatingSystem returns pass with platform info", () => {
    const result = checkOperatingSystem();

    expect(result.name).toBe("Operating System");
    expect(result.status).toBe("pass");
    expect(result.value).toBe(process.platform);
    expect(result.message).toContain(process.platform);
  });

  test("checkArchitecture returns pass with arch info", () => {
    const result = checkArchitecture();

    expect(result.name).toBe("Architecture");
    expect(result.status).toBe("pass");
    expect(result.value).toBe(process.arch);
    expect(result.message).toBe(process.arch);
  });

  test("checkRuntime returns pass with Bun version when running in Bun", () => {
    const result = checkRuntime();

    expect(result.name).toBe("Runtime");
    expect(result.status).toBe("pass");
    // Tests run under Bun, so we expect Bun version
    const bunVersion = (globalThis as any).Bun?.version;
    if (bunVersion) {
      expect(result.message).toBe(`Bun ${bunVersion}`);
      expect(result.value).toBe(`bun@${bunVersion}`);
    } else {
      expect(result.message).toContain("Node.js");
      expect(result.value).toContain("node@");
    }
  });

  test("runSystemChecks returns all three checks", () => {
    const results = runSystemChecks();

    expect(results).toHaveLength(3);
    expect(results[0].name).toBe("Operating System");
    expect(results[1].name).toBe("Architecture");
    expect(results[2].name).toBe("Runtime");
    for (const result of results) {
      expect(result.status).toBe("pass");
    }
  });
});
