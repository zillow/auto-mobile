import { expect, describe, test, beforeEach } from "bun:test";
import { GetDeepLinks } from "../../../src/features/utility/GetDeepLinks";
import { DeepLinkManager } from "../../../src/utils/DeepLinkManager";
import { DeepLinkResult } from "../../../src/models";

describe("GetDeepLinks", () => {
  let getDeepLinks: GetDeepLinks;
  let mockDeepLinkManager: DeepLinkManager;

  const mockDeepLinkResult: DeepLinkResult = {
    success: true,
    appId: "com.example.app",
    deepLinks: {
      schemes: ["https", "myapp"],
      hosts: ["example.com", "app.example.com"],
      intentFilters: [{
        action: "android.intent.action.VIEW",
        category: ["android.intent.category.DEFAULT"],
        data: [{
          scheme: "https",
          host: "example.com"
        }]
      }],
      supportedMimeTypes: ["text/plain"]
    },
    rawOutput: "mock output"
  };

  beforeEach(() => {
    // Create GetDeepLinks instance
    getDeepLinks = new GetDeepLinks("test-device");

    // Create mock DeepLinkManager
    mockDeepLinkManager = {
      getDeepLinks: async (appId: string) => mockDeepLinkResult
    } as any;

    // Replace the internal deepLinkManager with our mock
    (getDeepLinks as any).deepLinkManager = mockDeepLinkManager;
  });

  describe("constructor", () => {
    test("should create GetDeepLinks with device ID", () => {
      const instance = new GetDeepLinks("test-device");
      expect(instance).toBeInstanceOf(GetDeepLinks);
    });

    test("should create GetDeepLinks without device ID", () => {
      const instance = new GetDeepLinks();
      expect(instance).toBeInstanceOf(GetDeepLinks);
    });
  });

  describe("execute", () => {
    test("should successfully get deep links for a valid app ID", async () => {
      const result = await getDeepLinks.execute("com.example.app");

      expect(result.success).toBe(true);
      expect(result.appId).toBe("com.example.app");
      expect(result.deepLinks.schemes).toEqual(["https", "myapp"]);
      expect(result.deepLinks.hosts).toEqual(["example.com", "app.example.com"]);
      expect(result.deepLinks.intentFilters).toHaveLength(1);
      expect(result.deepLinks.supportedMimeTypes).toEqual(["text/plain"]);
      expect(result.rawOutput).toBe("mock output");
    });

    test("should handle empty app ID", async () => {
      const result = await getDeepLinks.execute("");

      expect(result.success).toBe(false);
      expect(result.error).toContain("App ID cannot be empty");
      expect(result.deepLinks.schemes).toHaveLength(0);
      expect(result.deepLinks.hosts).toHaveLength(0);
    });

    test("should handle whitespace-only app ID", async () => {
      const result = await getDeepLinks.execute("   ");

      expect(result.success).toBe(false);
      expect(result.error).toContain("App ID cannot be empty");
      expect(result.deepLinks.schemes).toHaveLength(0);
      expect(result.deepLinks.hosts).toHaveLength(0);
    });

    test("should handle deep link manager failures", async () => {
      // Mock a failing deep link manager
      mockDeepLinkManager.getDeepLinks = async () => {
        throw new Error("Deep link query failed");
      };

      const result = await getDeepLinks.execute("com.example.app");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Deep link query failed");
      expect(result.appId).toBe("com.example.app");
      expect(result.deepLinks.schemes).toHaveLength(0);
    });

    test("should handle deep link manager returning failure result", async () => {
      const failureResult: DeepLinkResult = {
        success: false,
        appId: "com.example.app",
        deepLinks: {
          schemes: [],
          hosts: [],
          intentFilters: [],
          supportedMimeTypes: []
        },
        error: "Package not found"
      };

      mockDeepLinkManager.getDeepLinks = async () => failureResult;

      const result = await getDeepLinks.execute("com.example.app");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Package not found");
      expect(result.deepLinks.schemes).toHaveLength(0);
    });

    test("should log successful execution", async () => {
      // This test verifies that the method completes without throwing
      // and returns the expected successful result structure
      const result = await getDeepLinks.execute("com.example.app");

      expect(result.success).toBe(true);
      expect(result.deepLinks.schemes.length).toBeGreaterThan(0);
      expect(result.deepLinks.hosts.length).toBeGreaterThan(0);
    });
  });
});
