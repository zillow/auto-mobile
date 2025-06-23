import { expect } from "chai";
import { GetDeepLinks } from "../../../src/features/utility/GetDeepLinks";
import { DeepLinkManager } from "../../../src/utils/deepLinkManager";
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
    it("should create GetDeepLinks with device ID", () => {
      const instance = new GetDeepLinks("test-device");
      expect(instance).to.be.instanceOf(GetDeepLinks);
    });

    it("should create GetDeepLinks without device ID", () => {
      const instance = new GetDeepLinks();
      expect(instance).to.be.instanceOf(GetDeepLinks);
    });
  });

  describe("execute", () => {
    it("should successfully get deep links for a valid app ID", async () => {
      const result = await getDeepLinks.execute("com.example.app");

      expect(result.success).to.be.true;
      expect(result.appId).to.equal("com.example.app");
      expect(result.deepLinks.schemes).to.deep.equal(["https", "myapp"]);
      expect(result.deepLinks.hosts).to.deep.equal(["example.com", "app.example.com"]);
      expect(result.deepLinks.intentFilters).to.have.length(1);
      expect(result.deepLinks.supportedMimeTypes).to.deep.equal(["text/plain"]);
      expect(result.rawOutput).to.equal("mock output");
    });

    it("should handle empty app ID", async () => {
      const result = await getDeepLinks.execute("");

      expect(result.success).to.be.false;
      expect(result.error).to.include("App ID cannot be empty");
      expect(result.deepLinks.schemes).to.be.empty;
      expect(result.deepLinks.hosts).to.be.empty;
    });

    it("should handle whitespace-only app ID", async () => {
      const result = await getDeepLinks.execute("   ");

      expect(result.success).to.be.false;
      expect(result.error).to.include("App ID cannot be empty");
      expect(result.deepLinks.schemes).to.be.empty;
      expect(result.deepLinks.hosts).to.be.empty;
    });

    it("should handle deep link manager failures", async () => {
      // Mock a failing deep link manager
      mockDeepLinkManager.getDeepLinks = async () => {
        throw new Error("Deep link query failed");
      };

      const result = await getDeepLinks.execute("com.example.app");

      expect(result.success).to.be.false;
      expect(result.error).to.include("Deep link query failed");
      expect(result.appId).to.equal("com.example.app");
      expect(result.deepLinks.schemes).to.be.empty;
    });

    it("should handle deep link manager returning failure result", async () => {
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

      expect(result.success).to.be.false;
      expect(result.error).to.equal("Package not found");
      expect(result.deepLinks.schemes).to.be.empty;
    });

    it("should log successful execution", async () => {
      // This test verifies that the method completes without throwing
      // and returns the expected successful result structure
      const result = await getDeepLinks.execute("com.example.app");

      expect(result.success).to.be.true;
      expect(result.deepLinks.schemes).to.have.length.greaterThan(0);
      expect(result.deepLinks.hosts).to.have.length.greaterThan(0);
    });
  });
});
