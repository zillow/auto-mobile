import { expect, describe, it, beforeEach } from "bun:test";
import { AdbClient } from "../../../src/utils/android-cmdline-tools/AdbClient";
import type { ExecResult } from "../../../src/models";

describe("AdbClient.listUsers", () => {
  let adbClient: AdbClient;
  let mockExecAsync: (command: string) => Promise<ExecResult>;
  let lastCommand: string;

  beforeEach(() => {
    // Create a mock exec function that tracks the last command
    mockExecAsync = (command: string): Promise<ExecResult> => {
      lastCommand = command;
      return Promise.resolve({
        stdout: "",
        stderr: "",
        toString: () => "",
        trim: () => "",
        includes: () => false
      });
    };

    adbClient = new AdbClient(null, mockExecAsync, null as any);
  });

  describe("parseUsersFromDumpsys", () => {
    it("should parse single user from dumpsys output", async () => {
      const dumpsysOutput = `Current user: 0

Users:
  UserInfo{0:null:4c13} serialNo=0 isPrimary=true
    Type: android.os.usertype.full.SYSTEM
    Flags: 19475 (ADMIN|FULL|INITIALIZED|MAIN|PRIMARY|SYSTEM)
    State: RUNNING_UNLOCKED
    Created: <unknown>

  Owner name: Owner`;

      mockExecAsync = (command: string): Promise<ExecResult> => {
        lastCommand = command;
        return Promise.resolve({
          stdout: dumpsysOutput,
          stderr: "",
          toString: () => dumpsysOutput,
          trim: () => dumpsysOutput.trim(),
          includes: (s: string) => dumpsysOutput.includes(s)
        });
      };

      adbClient = new AdbClient(null, mockExecAsync, null as any);
      const users = await adbClient.listUsers();

      expect(users.length).toBe(1);
      expect(users[0], {
        userId: 0,
        name: "Owner",
        flags: 0x4c13,
        running: true
      });
      expect(lastCommand).toContain("dumpsys user");
    });

    it("should parse multiple users with work profile from dumpsys output", async () => {
      const dumpsysOutput = `Current user: 0

Users:
  UserInfo{0:null:4c13} serialNo=0 isPrimary=true
    Type: android.os.usertype.full.SYSTEM
    Flags: 19475 (ADMIN|FULL|INITIALIZED|MAIN|PRIMARY|SYSTEM)
    State: RUNNING_UNLOCKED
    Created: <unknown>

  UserInfo{10:Work profile:30} serialNo=10 isPrimary=false parentId=0
    Type: android.os.usertype.profile.MANAGED
    Flags: 48 (MANAGED_PROFILE)
    State: RUNNING_UNLOCKED
    Created: +2d5h32m18s445ms ago

  Owner name: Owner`;

      mockExecAsync = (command: string): Promise<ExecResult> => {
        lastCommand = command;
        return Promise.resolve({
          stdout: dumpsysOutput,
          stderr: "",
          toString: () => dumpsysOutput,
          trim: () => dumpsysOutput.trim(),
          includes: (s: string) => dumpsysOutput.includes(s)
        });
      };

      adbClient = new AdbClient(null, mockExecAsync, null as any);
      const users = await adbClient.listUsers();

      expect(users.length).toBe(2);
      expect(users[0], {
        userId: 0,
        name: "Owner",
        flags: 0x4c13,
        running: true
      });
      expect(users[1], {
        userId: 10,
        name: "Work profile",
        flags: 0x30,
        running: true
      });
    });

    it("should handle shutdown users correctly", async () => {
      const dumpsysOutput = `Current user: 0

Users:
  UserInfo{0:null:4c13} serialNo=0 isPrimary=true
    Type: android.os.usertype.full.SYSTEM
    State: RUNNING_UNLOCKED

  UserInfo{10:Secondary User:0} serialNo=10 isPrimary=false
    Type: android.os.usertype.full.SECONDARY
    State: SHUTDOWN

  Owner name: Owner`;

      mockExecAsync = (command: string): Promise<ExecResult> => {
        lastCommand = command;
        return Promise.resolve({
          stdout: dumpsysOutput,
          stderr: "",
          toString: () => dumpsysOutput,
          trim: () => dumpsysOutput.trim(),
          includes: (s: string) => dumpsysOutput.includes(s)
        });
      };

      adbClient = new AdbClient(null, mockExecAsync, null as any);
      const users = await adbClient.listUsers();

      expect(users.length).toBe(2);
      expect(users[0].running).toBe(true);
      expect(users[1].running).toBe(false);
    });

    it("should handle RUNNING_LOCKED state as running", async () => {
      const dumpsysOutput = `Current user: 0

Users:
  UserInfo{0:null:4c13} serialNo=0 isPrimary=true
    Type: android.os.usertype.full.SYSTEM
    State: RUNNING_LOCKED

  Owner name: Owner`;

      mockExecAsync = (command: string): Promise<ExecResult> => {
        lastCommand = command;
        return Promise.resolve({
          stdout: dumpsysOutput,
          stderr: "",
          toString: () => dumpsysOutput,
          trim: () => dumpsysOutput.trim(),
          includes: (s: string) => dumpsysOutput.includes(s)
        });
      };

      adbClient = new AdbClient(null, mockExecAsync, null as any);
      const users = await adbClient.listUsers();

      expect(users.length).toBe(1);
      expect(users[0].running).toBe(true);
    });

    it("should use default name for null username when no Owner name is found", async () => {
      const dumpsysOutput = `Current user: 0

Users:
  UserInfo{10:null:30} serialNo=10 isPrimary=false
    Type: android.os.usertype.profile.MANAGED
    State: RUNNING_UNLOCKED`;

      mockExecAsync = (command: string): Promise<ExecResult> => {
        lastCommand = command;
        return Promise.resolve({
          stdout: dumpsysOutput,
          stderr: "",
          toString: () => dumpsysOutput,
          trim: () => dumpsysOutput.trim(),
          includes: (s: string) => dumpsysOutput.includes(s)
        });
      };

      adbClient = new AdbClient(null, mockExecAsync, null as any);
      const users = await adbClient.listUsers();

      expect(users.length).toBe(1);
      expect(users[0].name).toBe("User 10");
    });

    it("should fall back to pm list users when dumpsys parsing fails", async () => {
      const pmOutput = `Users:
\tUserInfo{0:Owner:4c13} running
\tUserInfo{10:Work profile:30} running`;

      let callCount = 0;
      mockExecAsync = (command: string): Promise<ExecResult> => {
        lastCommand = command;
        callCount++;

        if (callCount === 1) {
          // First call to dumpsys returns invalid data
          return Promise.resolve({
            stdout: "Invalid output",
            stderr: "",
            toString: () => "Invalid output",
            trim: () => "Invalid output",
            includes: (s: string) => "Invalid output".includes(s)
          });
        } else {
          // Second call to pm list users returns valid data
          return Promise.resolve({
            stdout: pmOutput,
            stderr: "",
            toString: () => pmOutput,
            trim: () => pmOutput.trim(),
            includes: (s: string) => pmOutput.includes(s)
          });
        }
      };

      adbClient = new AdbClient(null, mockExecAsync, null as any);
      const users = await adbClient.listUsers();

      expect(users.length).toBe(2);
      expect(users[0], {
        userId: 0,
        name: "Owner",
        flags: 0x4c13,
        running: true
      });
      expect(users[1], {
        userId: 10,
        name: "Work profile",
        flags: 0x30,
        running: true
      });
      expect(lastCommand).toContain("pm list users");
    });

    it("should fall back to pm list users when dumpsys command fails", async () => {
      const pmOutput = `Users:
\tUserInfo{0:Owner:4c13} running`;

      let callCount = 0;
      mockExecAsync = (command: string): Promise<ExecResult> => {
        lastCommand = command;
        callCount++;

        if (callCount === 1) {
          // First call to dumpsys throws error
          throw new Error("dumpsys user failed");
        } else {
          // Second call to pm list users succeeds
          return Promise.resolve({
            stdout: pmOutput,
            stderr: "",
            toString: () => pmOutput,
            trim: () => pmOutput.trim(),
            includes: (s: string) => pmOutput.includes(s)
          });
        }
      };

      adbClient = new AdbClient(null, mockExecAsync, null as any);
      const users = await adbClient.listUsers();

      expect(users.length).toBe(1);
      expect(users[0], {
        userId: 0,
        name: "Owner",
        flags: 0x4c13,
        running: true
      });
      expect(lastCommand).toContain("pm list users");
    });
  });

  describe("listUsersLegacy (pm list users)", () => {
    it("should parse users from pm list users output", async () => {
      const pmOutput = `Users:
\tUserInfo{0:Owner:4c13} running
\tUserInfo{10:Work profile:30} running`;

      // Mock to simulate fallback: first dumpsys fails, then pm succeeds
      let callCount = 0;
      mockExecAsync = (command: string): Promise<ExecResult> => {
        lastCommand = command;
        callCount++;

        if (callCount === 1) {
          throw new Error("dumpsys not available");
        } else {
          return Promise.resolve({
            stdout: pmOutput,
            stderr: "",
            toString: () => pmOutput,
            trim: () => pmOutput.trim(),
            includes: (s: string) => pmOutput.includes(s)
          });
        }
      };

      adbClient = new AdbClient(null, mockExecAsync, null as any);
      const users = await adbClient.listUsers();

      expect(users.length).toBe(2);
      expect(users[0].userId).toBe(0);
      expect(users[0].name).toBe("Owner");
      expect(users[0].flags).toBe(0x4c13);
      expect(users[0].running).toBe(true);

      expect(users[1].userId).toBe(10);
      expect(users[1].name).toBe("Work profile");
      expect(users[1].flags).toBe(0x30);
      expect(users[1].running).toBe(true);
    });

    it("should handle users without running status", async () => {
      const pmOutput = `Users:
\tUserInfo{0:Owner:4c13}`;

      let callCount = 0;
      mockExecAsync = (command: string): Promise<ExecResult> => {
        lastCommand = command;
        callCount++;

        if (callCount === 1) {
          throw new Error("dumpsys not available");
        } else {
          return Promise.resolve({
            stdout: pmOutput,
            stderr: "",
            toString: () => pmOutput,
            trim: () => pmOutput.trim(),
            includes: (s: string) => pmOutput.includes(s)
          });
        }
      };

      adbClient = new AdbClient(null, mockExecAsync, null as any);
      const users = await adbClient.listUsers();

      expect(users.length).toBe(1);
      expect(users[0].running).toBe(false);
    });

    it("should return fallback user when both commands fail", async () => {
      mockExecAsync = (): Promise<ExecResult> => {
        throw new Error("All commands failed");
      };

      adbClient = new AdbClient(null, mockExecAsync, null as any);
      const users = await adbClient.listUsers();

      expect(users.length).toBe(1);
      expect(users[0], {
        userId: 0,
        name: "Owner",
        flags: 0x13,
        running: true
      });
    });

    it("should return fallback user when parsing produces no results", async () => {
      const invalidOutput = "Some random output with no user info";

      mockExecAsync = (command: string): Promise<ExecResult> => {
        lastCommand = command;

        return Promise.resolve({
          stdout: invalidOutput,
          stderr: "",
          toString: () => invalidOutput,
          trim: () => invalidOutput.trim(),
          includes: (s: string) => invalidOutput.includes(s)
        });
      };

      adbClient = new AdbClient(null, mockExecAsync, null as any);
      const users = await adbClient.listUsers();

      expect(users.length).toBe(1);
      expect(users[0], {
        userId: 0,
        name: "Owner",
        flags: 0x13,
        running: true
      });
    });

    it("should correctly parse hexadecimal flags", async () => {
      const pmOutput = `Users:
\tUserInfo{0:Owner:4c13} running
\tUserInfo{10:Work:1a2b} running`;

      let callCount = 0;
      mockExecAsync = (command: string): Promise<ExecResult> => {
        lastCommand = command;
        callCount++;

        if (callCount === 1) {
          throw new Error("dumpsys not available");
        } else {
          return Promise.resolve({
            stdout: pmOutput,
            stderr: "",
            toString: () => pmOutput,
            trim: () => pmOutput.trim(),
            includes: (s: string) => pmOutput.includes(s)
          });
        }
      };

      adbClient = new AdbClient(null, mockExecAsync, null as any);
      const users = await adbClient.listUsers();

      expect(users.length).toBe(2);
      expect(users[0].flags, 0x4c13); // 19475 in decimal
      expect(users[1].flags, 0x1a2b); // 6699 in decimal
    });
  });
});
