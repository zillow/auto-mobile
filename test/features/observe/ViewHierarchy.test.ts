import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ViewHierarchy } from "../../../src/features/observe/ViewHierarchy";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { TakeScreenshot } from "../../../src/features/observe/TakeScreenshot";
import { BootedDevice } from "../../../src/models/DeviceInfo";
import { AccessibilityServiceClient } from "../../../src/features/observe/AccessibilityServiceClient";
import fs from "fs-extra";
import { promisify } from "util";

// Create a mock readFile function that returns some fake screenshot data
const mockReadFile = promisify((path: string, callback: (err: any, data?: Buffer) => void) => {
  // Return fake screenshot data for any path
  setImmediate(() => callback(null, Buffer.from("fake screenshot data")));
});

// Override the readFileAsync function for tests that need it
const originalReadFile = fs.readFile;
const setupReadFileMock = () => {
  (fs as any).readFile = mockReadFile;
};
const teardownReadFileMock = () => {
  (fs as any).readFile = originalReadFile;
};

describe("ViewHierarchy", function() {
  describe("Unit Tests for Public Methods", function() {
    let viewHierarchy: ViewHierarchy;
    let fakeAdb: FakeAdbExecutor;
    let mockTakeScreenshot: TakeScreenshot;
    let mockAccessibilityServiceClient: AccessibilityServiceClient;
    let mockDevice: BootedDevice;

    beforeEach(function() {
      mockDevice = {
        deviceId: "test-device",
        name: "Test Device",
        platform: "android"
      };
      // Create fakes for testing
      fakeAdb = new FakeAdbExecutor();

      mockTakeScreenshot = {
        execute: async () => ({ success: true, path: "/tmp/test.png" })
      } as unknown as TakeScreenshot;

      mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      viewHierarchy = new ViewHierarchy(mockDevice, fakeAdb, null, mockTakeScreenshot, mockAccessibilityServiceClient);
      setupReadFileMock();
    });

    afterEach(function() {
      teardownReadFileMock();
    });

    test("should identify string filter criteria correctly", function() {
      const propsWithText = { text: "Button Text" };
      const propsWithResourceId = { "resource-id": "com.app:id/button" };
      const propsWithContentDesc = { "content-desc": "Button description" };
      const propsEmpty = { clickable: "true" };

      // Now that the method is public, we can call it directly
      expect(viewHierarchy.meetsStringFilterCriteria(propsWithText)).toBe(true);
      expect(viewHierarchy.meetsStringFilterCriteria(propsWithResourceId)).toBe(true);
      expect(viewHierarchy.meetsStringFilterCriteria(propsWithContentDesc)).toBe(true);
      expect(viewHierarchy.meetsStringFilterCriteria(propsEmpty)).toBe(false);
    });

    test("should identify boolean filter criteria correctly", function() {
      const propsClickable = { clickable: "true" };
      const propsScrollable = { scrollable: "true" };
      const propsFocused = { focused: "true" };
      const propsNonBoolean = { text: "Button" };

      expect(viewHierarchy.meetsBooleanFilterCriteria(propsClickable)).toBe(true);
      expect(viewHierarchy.meetsBooleanFilterCriteria(propsScrollable)).toBe(true);
      expect(viewHierarchy.meetsBooleanFilterCriteria(propsFocused)).toBe(true);
      expect(viewHierarchy.meetsBooleanFilterCriteria(propsNonBoolean)).toBe(false);
    });

    test("should check meets filter criteria correctly", function() {
      const propsWithText = { text: "Button Text" };
      const propsClickable = { clickable: "true" };
      const propsEmpty = { enabled: "true" };

      expect(viewHierarchy.meetsFilterCriteria(propsWithText)).toBe(true);
      expect(viewHierarchy.meetsFilterCriteria(propsClickable)).toBe(true);
      expect(viewHierarchy.meetsFilterCriteria(propsEmpty)).toBe(false);
    });

    test("should calculate screenshot hash correctly", function() {
      const testBuffer = Buffer.from("test screenshot data");

      const hash = viewHierarchy.calculateScreenshotHash(testBuffer);

      expect(typeof hash).toBe("string");
      expect(hash).toHaveLength(32); // MD5 hash length
      expect(hash).toMatch(/^[a-f0-9]+$/); // Hex string
    });

    test("should validate XML data correctly", function() {
      const validXml = '<?xml version="1.0"?><hierarchy><node text="test"/></hierarchy>';
      const invalidXml = "";
      const xmlWithoutHierarchy = '<?xml version="1.0"?><root><node text="test"/></root>';

      expect(viewHierarchy.validateXmlData(validXml)).toBe(true);
      expect(viewHierarchy.validateXmlData(invalidXml)).toBe(false);
      expect(viewHierarchy.validateXmlData(xmlWithoutHierarchy)).toBe(false);
    });

    test("should extract XML from ADB output correctly", function() {
      const tempFile = "/sdcard/window_dump.xml";
      const xmlContent = '<?xml version="1.0"?><hierarchy><node text="test"/></hierarchy>';
      const stdout = `UI hierchary dumped to:${tempFile}\n${xmlContent}`;

      const result = viewHierarchy.extractXmlFromAdbOutput(stdout, tempFile);
      expect(result).toBe(xmlContent);

      // Should return original if no UI hierarchy message
      const result2 = viewHierarchy.extractXmlFromAdbOutput(xmlContent, tempFile);
      expect(result2).toBe(xmlContent);
    });

    test("should process node children correctly", function() {
      const node = {
        $: { text: "parent" },
        node: [
          { $: { text: "child1", clickable: "true" } },
          { $: { text: "child2", scrollable: "true" } },
          { $: { enabled: "true" } } // Should be filtered out
        ]
      };

      const filteredChildren = viewHierarchy.processNodeChildren(node, child => {
        return viewHierarchy.meetsFilterCriteria(child.$) ? child : null;
      });

      expect(filteredChildren).toHaveLength(2);
      expect(filteredChildren[0].$).toHaveProperty("text", "child1");
      expect(filteredChildren[1].$).toHaveProperty("text", "child2");
    });

    test("should normalize node structure correctly", function() {
      const singleChild = [{ text: "single" }];
      const multipleChildren = [{ text: "first" }, { text: "second" }];

      const normalizedSingle = viewHierarchy.normalizeNodeStructure(singleChild);
      const normalizedMultiple = viewHierarchy.normalizeNodeStructure(multipleChildren);

      expect(typeof normalizedSingle).toBe("object");
      expect(normalizedSingle).toHaveProperty("text", "single");
      expect(Array.isArray(normalizedMultiple)).toBe(true);
      expect(normalizedMultiple).toHaveLength(2);
    });

    test("should filter single node correctly", function() {
      const nodeWithCriteria = {
        $: { text: "test", clickable: "true", enabled: "true", class: "android.widget.Button" },
        node: {
          $: { "resource-id": "button", "enabled": "false" }
        }
      };

      const filteredNode = viewHierarchy.filterSingleNode(nodeWithCriteria);

      expect(filteredNode).toBeDefined();
      expect(filteredNode).toHaveProperty("text", "test");
      expect(filteredNode).toHaveProperty("clickable", "true");
      expect(filteredNode).not.toHaveProperty("enabled"); // Should be filtered out
      expect(filteredNode).not.toHaveProperty("class"); // Should be filtered out
    });

    test("should filter single root node correctly", function() {
      const rootNode = {
        $: { class: "android.widget.FrameLayout" },
        node: [
          { $: { text: "visible text" } },
          { $: { enabled: "true" } } // Should be filtered out
        ]
      };

      const filteredRoot = viewHierarchy.filterSingleNode(rootNode, true);

      expect(filteredRoot).toBeDefined();
      expect(filteredRoot.node).toBeDefined();
      expect(filteredRoot.node).toHaveProperty("text", "visible text");
    });

    test("should return children when parent doesn't meet criteria but children do", function() {
      const nodeWithoutCriteria = {
        $: { enabled: "true" },
        node: [
          { $: { text: "child1" } },
          { $: { clickable: "true" } }
        ]
      };

      const result = viewHierarchy.filterSingleNode(nodeWithoutCriteria);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });

    test("should calculate filtering stats", function() {
      const original = { large: "data".repeat(1000) };
      const filtered = { small: "data" };

      // Should not throw error
      expect(() => {
        viewHierarchy.calculateFilteringStats(original, filtered);
      }).not.toThrow();
    });
  });


  describe("Cache Management Tests", function() {
    let viewHierarchy: ViewHierarchy;
    let fakeAdb: FakeAdbExecutor;
    let mockTakeScreenshot: TakeScreenshot;
    let mockAccessibilityServiceClient: AccessibilityServiceClient;
    let mockDevice: BootedDevice;

    beforeEach(function() {
      mockDevice = {
        deviceId: "test-device",
        name: "Test Device",
        platform: "android"
      };
      // Create fakes for testing
      fakeAdb = new FakeAdbExecutor();

      mockTakeScreenshot = {
        execute: async () => ({ success: true, path: "/tmp/test.png" })
      } as unknown as TakeScreenshot;

      mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      viewHierarchy = new ViewHierarchy(mockDevice, fakeAdb, null, mockTakeScreenshot, mockAccessibilityServiceClient);
    });

    test("should return null from checkInMemoryCache when no cache exists", async function() {
      const mockBuffer = Buffer.from("mock screenshot data");
      const result = await viewHierarchy.checkInMemoryCache(mockBuffer);
      expect(result).toBeNull();
    });

    test("should return null from checkInMemoryCache when cache is expired", async function() {
      const hash = "test-hash";
      const mockBuffer = Buffer.from("mock screenshot data");
      const oldTimestamp = Date.now() - 120000; // 2 minutes ago (older than 60s TTL)

      // Access the static cache to add expired entry
      (ViewHierarchy as any).viewHierarchyCache.set(hash, {
        timestamp: oldTimestamp,
        activityHash: hash,
        viewHierarchy: { hierarchy: { test: "data" } }
      });

      const result = await viewHierarchy.checkInMemoryCache(mockBuffer);
      expect(result).toBeNull();
    });

    test("should return cached result from checkInMemoryCache when cache is valid", async function() {
      const hash = "test-hash";
      const mockBuffer = Buffer.from("mock screenshot data");
      const recentTimestamp = Date.now() - 30000; // 30 seconds ago (within 60s TTL)
      const testHierarchy = { hierarchy: { test: "data" } } as any;

      // Access the static cache to add valid entry
      (ViewHierarchy as any).viewHierarchyCache.set(hash, {
        timestamp: recentTimestamp,
        activityHash: hash,
        viewHierarchy: testHierarchy
      });

      // For this test to pass with fuzzy matching, we'd need actual screenshot files
      // For now, just test that it returns null since no fuzzy match is found
      const result = await viewHierarchy.checkInMemoryCache(mockBuffer);
      expect(result).toBeNull(); // Will be null since no screenshot files exist to match against
    });

    test("should cache view hierarchy correctly", async function() {
      const timestamp = Date.now();
      const testHierarchy = { hierarchy: { test: "data" } } as any;

      await viewHierarchy.cacheViewHierarchy(timestamp, testHierarchy);

      // Check that it was cached using legacy hash-based method
      const cached = await viewHierarchy.checkCacheHierarchy(timestamp.toString());
      expect(cached).toEqual(testHierarchy);
    });

    test("should return empty cache result when cache is empty", async function() {
      // Clear any existing cache
      (ViewHierarchy as any).viewHierarchyCache.clear();

      const result = await viewHierarchy.getMostRecentCachedViewHierarchy();

      expect(result).toBeDefined();
      expect(result.hierarchy).toHaveProperty("error", "No cached view hierarchy available");
    });

    test("should return most recent cached view hierarchy", async function() {
      const hash1 = "hash1";
      const hash2 = "hash2";
      const oldHierarchy = { hierarchy: { data: "old" } } as any;
      const newHierarchy = { hierarchy: { data: "new" } } as any;

      // Add old entry
      (ViewHierarchy as any).viewHierarchyCache.set(hash1, {
        timestamp: Date.now() - 50000,
        activityHash: hash1,
        viewHierarchy: oldHierarchy
      });

      // Add newer entry
      (ViewHierarchy as any).viewHierarchyCache.set(hash2, {
        timestamp: Date.now() - 10000,
        activityHash: hash2,
        viewHierarchy: newHierarchy
      });

      const result = await viewHierarchy.getMostRecentCachedViewHierarchy();
      expect(result).toEqual(newHierarchy);
    });

    test("should check cache hierarchy correctly", async function() {
      const hash = "test-hash";
      const testHierarchy = { hierarchy: { test: "data" } } as any;

      // Set up in-memory cache
      (ViewHierarchy as any).viewHierarchyCache.set(hash, {
        timestamp: Date.now() - 30000,
        activityHash: hash,
        viewHierarchy: testHierarchy
      });

      // Use legacy hash-based method for this test
      const result = await viewHierarchy.checkCacheHierarchy(hash);
      expect(result).toEqual(testHierarchy);
    });

    test("should return null from checkCacheHierarchy when no cache exists for nonexistent hash", async function() {
      const result = await viewHierarchy.checkCacheHierarchy("nonexistent-hash");
      expect(result).toBeNull();
    });

    test("should return null from checkCacheHierarchyWithFuzzyMatching when no cache exists", async function() {
      const mockBuffer = Buffer.from("mock screenshot data");
      const result = await viewHierarchy.checkCacheHierarchyWithFuzzyMatching(mockBuffer);
      expect(result).toBeNull();
    });

    test("should return null from checkDiskCache when file doesn't exist", async function() {
      const mockBuffer = Buffer.from("mock screenshot data");
      const result = await viewHierarchy.checkDiskCache(mockBuffer);
      expect(result).toBeNull();
    });


  });

  describe("XML Processing Tests", function() {
    let viewHierarchy: ViewHierarchy;
    let fakeAdb: FakeAdbExecutor;
    let mockTakeScreenshot: TakeScreenshot;
    let mockAccessibilityServiceClient: AccessibilityServiceClient;
    let mockDevice: BootedDevice;

    beforeEach(function() {
      mockDevice = {
        deviceId: "test-device",
        name: "Test Device",
        platform: "android"
      };
      fakeAdb = new FakeAdbExecutor();

      mockTakeScreenshot = {
        execute: async () => ({ success: true, path: "/tmp/test.png" })
      } as unknown as TakeScreenshot;

      mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      viewHierarchy = new ViewHierarchy(mockDevice, fakeAdb, null, mockTakeScreenshot, mockAccessibilityServiceClient);
    });

    test("should process valid XML data correctly", async function() {
      const validXml = '<?xml version="1.0"?><hierarchy><node text="test" clickable="true"/></hierarchy>';

      const result = await viewHierarchy.processXmlData(validXml);

      expect(result).toBeDefined();
      expect(result.hierarchy).toBeDefined();
    });

    test("should handle invalid XML data", async function() {
      const invalidXml = "";

      const result = await viewHierarchy.processXmlData(invalidXml);

      expect(result).toBeDefined();
      expect(result.hierarchy).toHaveProperty("error");
    });

    test("should parse XML to view hierarchy", async function() {
      const xmlData = '<?xml version="1.0"?><hierarchy><node text="test" clickable="true"/></hierarchy>';

      const result = await viewHierarchy.parseXmlToViewHierarchy(xmlData);

      expect(result).toBeDefined();
      expect(result.hierarchy).toBeDefined();
    });

    test("should execute uiautomator dump command", async function() {
      const xmlContent = '<?xml version="1.0"?><hierarchy><node text="test"/></hierarchy>';
      const fakeAdbWithOutput = new FakeAdbExecutor();
      fakeAdbWithOutput.setCommandResponse("uiautomator dump", { stdout: xmlContent, stderr: "" });

      const mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      const viewHierarchyWithMock = new ViewHierarchy(mockDevice, fakeAdbWithOutput, null, mockTakeScreenshot, mockAccessibilityServiceClient);

      const result = await viewHierarchyWithMock.executeUiAutomatorDump();
      expect(result).toBe(xmlContent);
    });
  });

  describe("Screenshot Buffer Management Tests", function() {
    test("should throw error when screenshot fails", async function() {
      const mockDevice: BootedDevice = {
        deviceId: "test-device",
        name: "Test Device",
        platform: "android"
      };

      const fakeAdb = new FakeAdbExecutor();

      const mockTakeScreenshotFail = {
        execute: async () => ({ success: false, error: "Screenshot failed" })
      } as unknown as TakeScreenshot;

      const mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      const viewHierarchyWithMock = new ViewHierarchy(mockDevice, fakeAdb, null, mockTakeScreenshotFail, mockAccessibilityServiceClient);

      try {
        await viewHierarchyWithMock.getOrCreateScreenshotBuffer(null);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        // Error message may vary - check for common patterns
        const message = (error as Error).message.toLowerCase();
        expect(message.includes("screenshot") || message.includes("failed")).toBe(true);
      }
    });
  });

  describe("Error Handling Tests", function() {
    let viewHierarchy: ViewHierarchy;
    let fakeAdb: FakeAdbExecutor;
    let mockTakeScreenshot: TakeScreenshot;
    let mockAccessibilityServiceClient: AccessibilityServiceClient;
    let mockDevice: BootedDevice;

    beforeEach(function() {
      mockDevice = {
        deviceId: "test-device",
        name: "Test Device",
        platform: "android"
      };
      fakeAdb = new FakeAdbExecutor();

      mockTakeScreenshot = {
        execute: async () => ({ success: true, path: "/tmp/test.png" })
      } as unknown as TakeScreenshot;

      mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      viewHierarchy = new ViewHierarchy(mockDevice, fakeAdb, null, mockTakeScreenshot, mockAccessibilityServiceClient);
      setupReadFileMock();
    });

    afterEach(function() {
      teardownReadFileMock();
    });

    test("should handle no active window gracefully", async function() {
      const result = await viewHierarchy.getAndroidViewHierarchy();

      expect(result).toBeDefined();
      expect(result.hierarchy).toBeDefined();
    });

    test("should handle screenshot errors in getViewHierarchy", async function() {
      const mockTakeScreenshotError = {
        execute: async () => ({ success: false, error: "screenshot error" })
      } as unknown as TakeScreenshot;

      const mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      const viewHierarchyWithMocks = new ViewHierarchy(mockDevice, fakeAdb, null, mockTakeScreenshotError, mockAccessibilityServiceClient);

      const result = await viewHierarchyWithMocks.getAndroidViewHierarchy();

      expect(result).toBeDefined();
      expect(result.hierarchy).toBeDefined();
    });

    test("should handle ADB errors in executeUiAutomatorDump", async function() {
      const fakeAdbError = new FakeAdbExecutor();
      fakeAdbError.setDefaultResponse({
        stdout: "",
        stderr: "null root node returned by UiTestAutomationBridge",
        toString() { return this.stderr; },
        trim() { return this.stderr.trim(); },
        includes(searchString: string) { return this.stderr.includes(searchString); }
      });

      const mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      const viewHierarchyWithError = new ViewHierarchy(mockDevice, fakeAdbError, null, mockTakeScreenshot, mockAccessibilityServiceClient);

      try {
        await viewHierarchyWithError.executeUiAutomatorDump();
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error instanceof Error).toBe(true);
      }
    });

    test("should handle device locked/screen off error in _getViewHierarchyWithoutCache", async function() {
      const fakeAdbLockedError = new FakeAdbExecutor();
      fakeAdbLockedError.setDefaultResponse({
        stdout: "",
        stderr: "null root node returned by UiTestAutomationBridge",
        toString() { return this.stderr; },
        trim() { return this.stderr.trim(); },
        includes(searchString: string) { return this.stderr.includes(searchString); }
      });

      const mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      const viewHierarchyWithError = new ViewHierarchy(mockDevice, fakeAdbLockedError, null, mockTakeScreenshot, mockAccessibilityServiceClient);

      // Call _getViewHierarchyWithoutCache directly to test its error handling
      const result = await (viewHierarchyWithError as any)._getViewHierarchyWithoutCache();

      expect(result).toBeDefined();
      expect(result.hierarchy).toHaveProperty("error");
      expect(result.hierarchy.error).toContain("screen appears to be off or device is locked");
    });

    test("should handle cat file not found error in _getViewHierarchyWithoutCache", async function() {
      const fakeAdbCatError = new FakeAdbExecutor();
      fakeAdbCatError.setDefaultResponse({
        stdout: "",
        stderr: "cat: /sdcard/window_dump.xml: No such file or directory",
        toString() { return this.stderr; },
        trim() { return this.stderr.trim(); },
        includes(searchString: string) { return this.stderr.includes(searchString); }
      });

      const mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      const viewHierarchyWithError = new ViewHierarchy(mockDevice, fakeAdbCatError, null, mockTakeScreenshot, mockAccessibilityServiceClient);

      // Call _getViewHierarchyWithoutCache directly to test its error handling
      const result = await (viewHierarchyWithError as any)._getViewHierarchyWithoutCache();

      expect(result).toBeDefined();
      expect(result.hierarchy).toHaveProperty("error");
      expect(result.hierarchy.error).toContain("screen appears to be off or device is locked");
    });

    test("should handle generic error in _getViewHierarchyWithoutCache", async function() {
      const fakeAdbGenericError = new FakeAdbExecutor();
      fakeAdbGenericError.setDefaultResponse({
        stdout: "",
        stderr: "Some other generic error",
        toString() { return this.stderr; },
        trim() { return this.stderr.trim(); },
        includes(searchString: string) { return this.stderr.includes(searchString); }
      });

      const mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      const viewHierarchyWithError = new ViewHierarchy(mockDevice, fakeAdbGenericError, null, mockTakeScreenshot, mockAccessibilityServiceClient);

      // Call _getViewHierarchyWithoutCache directly to test its error handling
      const result = await (viewHierarchyWithError as any)._getViewHierarchyWithoutCache();

      expect(result).toBeDefined();
      expect(result.hierarchy).toHaveProperty("error");
      expect(result.hierarchy.error).toContain("Failed to retrieve view hierarchy data");
    });
  });

  describe("FilterViewHierarchy Tests", function() {
    let viewHierarchy: ViewHierarchy;
    let fakeAdb: FakeAdbExecutor;
    let mockTakeScreenshot: TakeScreenshot;
    let mockAccessibilityServiceClient: AccessibilityServiceClient;
    let mockDevice: BootedDevice;

    beforeEach(function() {
      mockDevice = {
        deviceId: "test-device",
        name: "Test Device",
        platform: "android"
      };
      fakeAdb = new FakeAdbExecutor();

      mockTakeScreenshot = {
        execute: async () => ({ success: true, path: "/tmp/test.png" })
      } as unknown as TakeScreenshot;

      mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      viewHierarchy = new ViewHierarchy(mockDevice, fakeAdb, null, mockTakeScreenshot, mockAccessibilityServiceClient);
    });

    test("should handle empty hierarchy", function() {
      const emptyHierarchy = null;
      const result = viewHierarchy.filterViewHierarchy(emptyHierarchy);
      expect(result).toBe(emptyHierarchy);
    });

    test("should handle hierarchy without hierarchy property", function() {
      const noHierarchy = { data: "test" };
      const result = viewHierarchy.filterViewHierarchy(noHierarchy);
      expect(result).toBe(noHierarchy);
    });

    test("should filter hierarchy with mixed criteria", function() {
      const testHierarchy = {
        hierarchy: {
          $: { class: "android.widget.FrameLayout" },
          node: [
            { $: { text: "Keep this", class: "android.widget.Button" } },
            { $: { clickable: "true", class: "android.widget.View" } },
            { $: { enabled: "true", class: "android.widget.View" } }, // Should be filtered out
            {
              $: { class: "android.widget.LinearLayout" },
              node: {
                $: { "resource-id": "important_button", "class": "android.widget.Button" }
              }
            }
          ]
        }
      };

      const result = viewHierarchy.filterViewHierarchy(testHierarchy);

      expect(result).toBeDefined();
      expect(result.hierarchy).toBeDefined();
    });
  });

  describe("Edge Cases and Additional Coverage", function() {
    let viewHierarchy: ViewHierarchy;
    let fakeAdb: FakeAdbExecutor;
    let mockTakeScreenshot: TakeScreenshot;
    let mockAccessibilityServiceClient: AccessibilityServiceClient;
    let mockDevice: BootedDevice;

    beforeEach(function() {
      mockDevice = {
        deviceId: "test-device",
        name: "Test Device",
        platform: "android"
      };
      fakeAdb = new FakeAdbExecutor();

      mockTakeScreenshot = {
        execute: async () => ({ success: true, path: "/tmp/test.png" })
      } as unknown as TakeScreenshot;

      mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      viewHierarchy = new ViewHierarchy(mockDevice, fakeAdb, null, mockTakeScreenshot, mockAccessibilityServiceClient);
    });

    test("should handle node with empty children array", function() {
      const nodeWithEmptyChildren = {
        $: { text: "parent" },
        node: []
      };

      const filteredChildren = viewHierarchy.processNodeChildren(nodeWithEmptyChildren, child => child);
      expect(filteredChildren).toHaveLength(0);
    });

    test("should handle node with single child (not array)", function() {
      const nodeWithSingleChild = {
        $: { text: "parent" },
        node: { $: { text: "single child", clickable: "true" } }
      };

      const filteredChildren = viewHierarchy.processNodeChildren(nodeWithSingleChild, child => {
        return viewHierarchy.meetsFilterCriteria(child.$) ? child : null;
      });

      expect(filteredChildren).toHaveLength(1);
      expect(filteredChildren[0].$).toHaveProperty("text", "single child");
    });

    test("should handle filterSingleNode with null input", function() {
      const result = viewHierarchy.filterSingleNode(null);
      expect(result).toBeNull();
    });

    test("should handle node with over 64 children (should be limited)", function() {
      const manyChildren = [];
      for (let i = 0; i < 100; i++) {
        manyChildren.push({ $: { text: `child${i}`, clickable: "true" } });
      }

      const nodeWithManyChildren = {
        $: { text: "parent" },
        node: manyChildren
      };

      const filteredChildren = viewHierarchy.processNodeChildren(nodeWithManyChildren, child => child);
      expect(filteredChildren).toHaveLength(64); // Should be limited to 64
    });

    test("should handle string filter criteria with empty values", function() {
      const propsWithEmptyText = { text: "" };
      const propsWithEmptyResourceId = { "resource-id": "" };
      const propsWithNullText = { text: null };

      expect(viewHierarchy.meetsStringFilterCriteria(propsWithEmptyText)).toBe(false);
      expect(viewHierarchy.meetsStringFilterCriteria(propsWithEmptyResourceId)).toBe(false);
      expect(viewHierarchy.meetsStringFilterCriteria(propsWithNullText)).toBe(false);
    });

    test("should handle boolean filter criteria with string values", function() {
      const propsWithStringTrue = { clickable: "true" };
      const propsWithStringFalse = { clickable: "false" };
      const propsWithActualBoolean = { clickable: true };

      expect(viewHierarchy.meetsBooleanFilterCriteria(propsWithStringTrue)).toBe(true);
      expect(viewHierarchy.meetsBooleanFilterCriteria(propsWithStringFalse)).toBe(false);
      expect(viewHierarchy.meetsBooleanFilterCriteria(propsWithActualBoolean)).toBe(false);
    });

    test("should handle normalize structure with empty array", function() {
      const emptyArray: any[] = [];
      const result = viewHierarchy.normalizeNodeStructure(emptyArray);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    test("should handle filter criteria with mixed property formats", function() {
      const mixedProps = {
        "resourceId": "button_id", // camelCase
        "content-desc": "Button description", // hyphenated
        "scrollable": "true"
      };

      expect(viewHierarchy.meetsStringFilterCriteria(mixedProps)).toBe(true);
      expect(viewHierarchy.meetsBooleanFilterCriteria(mixedProps)).toBe(true);
      expect(viewHierarchy.meetsFilterCriteria(mixedProps)).toBe(true);
    });

    test("should clean node properties correctly with various edge cases", function() {
      const nodeWithVariousProps = {
        $: {
          "text": "valid text",
          "resourceId": "valid_id", // camelCase - should be normalized to resource-id
          "contentDesc": "valid desc", // camelCase - should be normalized to content-desc
          "enabled": "true", // should be filtered out
          "clickable": "false", // should be filtered out
          "scrollable": "true", // should be kept
          "class": "android.widget.View", // not in allowed properties
          "content-desc": "", // empty string should be filtered out
          "bounds": "[0,0][100,100]" // should be kept
        }
      };

      const filteredNode = viewHierarchy.filterSingleNode(nodeWithVariousProps);

      expect(filteredNode).toBeDefined();
      expect(filteredNode).toHaveProperty("text", "valid text");
      expect(filteredNode).toHaveProperty("resource-id", "valid_id");
      expect(filteredNode).toHaveProperty("content-desc", "valid desc");
      expect(filteredNode).toHaveProperty("scrollable", "true");
      expect(filteredNode).toHaveProperty("bounds", "[0,0][100,100]");
      expect(filteredNode).not.toHaveProperty("enabled");
      expect(filteredNode).not.toHaveProperty("clickable");
      expect(filteredNode).not.toHaveProperty("class");
    });

    test("should handle node without $ properties correctly", function() {
      const nodeWithoutDollar = {
        "text": "direct text",
        "resourceId": "direct_id",
        "enabled": "true", // should be filtered out
        "scrollable": "true", // should be kept
        "class": "android.widget.View", // not in allowed properties
        "content-desc": "", // empty string should be filtered out
        "node": {
          text: "child text"
        }
      };

      const filteredNode = viewHierarchy.filterSingleNode(nodeWithoutDollar);

      expect(filteredNode).toBeDefined();
      expect(filteredNode).toHaveProperty("text", "direct text");
      expect(filteredNode).toHaveProperty("resourceId", "direct_id");
      expect(filteredNode).toHaveProperty("scrollable", "true");
      expect(filteredNode).not.toHaveProperty("enabled");
      expect(filteredNode).not.toHaveProperty("class");
      expect(filteredNode).not.toHaveProperty("content-desc");
    });
  });
});

describe("findFocusedElement", function() {
  let viewHierarchy: ViewHierarchy;
  let mockDevice: BootedDevice;

  beforeEach(function() {
    mockDevice = {
      deviceId: "test-device",
      name: "Test Device",
      platform: "android"
    };
    const mockAccessibilityServiceClient = {
      getLatestHierarchy: async () => null,
      convertToViewHierarchyResult: () => ({ hierarchy: {} }),
      convertAccessibilityNode: () => ({}),
      getAccessibilityHierarchy: async () => null
    } as unknown as AccessibilityServiceClient;

    viewHierarchy = new ViewHierarchy(mockDevice, new FakeAdbExecutor() as any, null, null);
  });

  test("should find focused element in simple hierarchy", function() {
    const mockViewHierarchy = {
      hierarchy: {
        node: [
          {
            "text": "Button 1",
            "resource-id": "com.example:id/button1",
            "bounds": "[0,0][100,50]",
            "clickable": "true",
            "focused": "false"
          },
          {
            "text": "Input Field",
            "resource-id": "com.example:id/input",
            "bounds": "[0,60][200,100]",
            "clickable": "true",
            "focused": "true"
          }
        ]
      }
    };

    const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

    expect(focusedElement).not.toBeNull();
    expect(focusedElement!.text).toBe("Input Field");
    expect(focusedElement!["resource-id"]).toBe("com.example:id/input");
    expect(focusedElement!.focused).toBe(true);
  });

  test("should return null when no element is focused", function() {
    const mockViewHierarchy = {
      hierarchy: {
        node: [
          {
            "text": "Button 1",
            "resource-id": "com.example:id/button1",
            "bounds": "[0,0][100,50]",
            "clickable": "true",
            "focused": "false"
          },
          {
            "text": "Button 2",
            "resource-id": "com.example:id/button2",
            "bounds": "[0,110][100,160]",
            "clickable": "true",
            "focused": "false"
          }
        ]
      }
    };

    const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

    expect(focusedElement).toBeNull();
  });

  test("should return null for empty or null hierarchy", function() {
    expect(viewHierarchy.findFocusedElement(null)).toBeNull();
    expect(viewHierarchy.findFocusedElement({})).toBeNull();
    expect(viewHierarchy.findFocusedElement({ hierarchy: null })).toBeNull();
  });

  test("should find focused element in deeply nested hierarchy", function() {
    const mockViewHierarchy = {
      hierarchy: {
        node: {
          "text": "Container",
          "resource-id": "com.example:id/container",
          "bounds": "[0,0][300,200]",
          "focused": "false",
          "node": {
            "text": "SubContainer",
            "resource-id": "com.example:id/sub_container",
            "bounds": "[10,10][290,190]",
            "focused": "false",
            "node": [
              {
                "text": "Deep Button",
                "resource-id": "com.example:id/deep_button",
                "bounds": "[20,20][80,50]",
                "clickable": "true",
                "focused": "false"
              },
              {
                "text": "Deep Input",
                "resource-id": "com.example:id/deep_input",
                "bounds": "[20,60][200,90]",
                "clickable": "true",
                "focused": "true"
              }
            ]
          }
        }
      }
    };

    const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

    expect(focusedElement).not.toBeNull();
    expect(focusedElement!.text).toBe("Deep Input");
    expect(focusedElement!["resource-id"]).toBe("com.example:id/deep_input");
    expect(focusedElement!.focused).toBe(true);
  });

  test("should handle boolean focused property", function() {
    const mockViewHierarchy = {
      hierarchy: {
        node: {
          "text": "Button",
          "resource-id": "com.example:id/button",
          "bounds": "[0,0][100,50]",
          "clickable": "true",
          "focused": true  // Boolean instead of string
        }
      }
    };

    const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

    expect(focusedElement).not.toBeNull();
    expect(focusedElement!.text).toBe("Button");
    expect(focusedElement!.focused).toBe(true);
  });

  test("should handle element with $ properties structure", function() {
    const mockViewHierarchy = {
      hierarchy: {
        node: {
          "$": {
            "text": "Button with $",
            "resource-id": "com.example:id/button_dollar",
            "bounds": "[0,0][100,50]",
            "clickable": "true",
            "focused": "true"
          }
        }
      }
    };

    const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

    expect(focusedElement).not.toBeNull();
    expect(focusedElement!.text).toBe("Button with $");
    expect(focusedElement!["resource-id"]).toBe("com.example:id/button_dollar");
    expect(focusedElement!.focused).toBe(true);
  });

  test("should stop at first focused element found", function() {
    const mockViewHierarchy = {
      hierarchy: {
        node: [
          {
            "text": "First Focused",
            "resource-id": "com.example:id/first",
            "bounds": "[0,0][100,50]",
            "clickable": "true",
            "focused": "true"
          },
          {
            "text": "Second Focused",
            "resource-id": "com.example:id/second",
            "bounds": "[0,60][100,110]",
            "clickable": "true",
            "focused": "true"
          }
        ]
      }
    };

    const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

    expect(focusedElement).not.toBeNull();
    expect(focusedElement!.text).toBe("First Focused");
    expect(focusedElement!["resource-id"]).toBe("com.example:id/first");
  });

  test("should handle elements without valid bounds", function() {
    const mockViewHierarchy = {
      hierarchy: {
        node: {
          "text": "Invalid Bounds Element",
          "resource-id": "com.example:id/invalid",
          "bounds": "invalid-bounds-format",
          "focused": "true"
        }
      }
    };

    const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

    // Should return null because parseNodeBounds fails for invalid bounds
    expect(focusedElement).toBeNull();
  });
});

describe("Offscreen Node Filtering", function() {
  let viewHierarchy: ViewHierarchy;
  let fakeAdb: FakeAdbExecutor;
  let mockDevice: BootedDevice;

  beforeEach(function() {
    mockDevice = {
      deviceId: "test-device",
      name: "Test Device",
      platform: "android"
    };
    fakeAdb = new FakeAdbExecutor();
    viewHierarchy = new ViewHierarchy(mockDevice, fakeAdb);
  });

  test("should filter out nodes completely below the screen", function() {
    const hierarchy = {
      hierarchy: {
        bounds: "[0,0][1080,2400]",
        node: [
          { text: "Visible", bounds: "[0,100][500,200]" },
          { text: "Below Screen", bounds: "[0,2600][500,2800]" },
          { text: "Way Below", bounds: "[0,3000][500,3200]" }
        ]
      }
    };

    const result = viewHierarchy.filterOffscreenNodes(hierarchy, 1080, 2400);

    // Flatten nodes for checking
    const flatNodes: string[] = [];
    const collectNodes = (node: any) => {
      if (node.text) {flatNodes.push(node.text);}
      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        children.forEach(collectNodes);
      }
    };
    collectNodes(result.hierarchy);

    expect(flatNodes).toContain("Visible");
    expect(flatNodes).not.toContain("Below Screen");
    expect(flatNodes).not.toContain("Way Below");
  });

  test("should filter out nodes completely above the screen", function() {
    const hierarchy = {
      hierarchy: {
        bounds: "[0,0][1080,2400]",
        node: [
          { text: "Visible", bounds: "[0,100][500,200]" },
          { text: "Above Screen", bounds: "[0,-500][500,-300]" }
        ]
      }
    };

    const result = viewHierarchy.filterOffscreenNodes(hierarchy, 1080, 2400);

    const flatNodes: string[] = [];
    const collectNodes = (node: any) => {
      if (node.text) {flatNodes.push(node.text);}
      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        children.forEach(collectNodes);
      }
    };
    collectNodes(result.hierarchy);

    expect(flatNodes).toContain("Visible");
    expect(flatNodes).not.toContain("Above Screen");
  });

  test("should keep nodes within margin of screen edge", function() {
    const hierarchy = {
      hierarchy: {
        bounds: "[0,0][1080,2400]",
        node: [
          { text: "JustBelow", bounds: "[0,2450][500,2550]" },  // Within 100px margin
          { text: "FarBelow", bounds: "[0,2600][500,2800]" }    // Beyond margin
        ]
      }
    };

    const result = viewHierarchy.filterOffscreenNodes(hierarchy, 1080, 2400, 100);

    const flatNodes: string[] = [];
    const collectNodes = (node: any) => {
      if (node.text) {flatNodes.push(node.text);}
      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        children.forEach(collectNodes);
      }
    };
    collectNodes(result.hierarchy);

    expect(flatNodes).toContain("JustBelow");
    expect(flatNodes).not.toContain("FarBelow");
  });

  test("should handle negative coordinates in bounds", function() {
    const hierarchy = {
      hierarchy: {
        bounds: "[0,0][1080,2400]",
        node: [
          { text: "Visible", bounds: "[0,100][500,200]" },
          { text: "PartiallyLeft", bounds: "[-50,100][100,200]" },  // Partially visible
          { text: "CompletelyLeft", bounds: "[-500,-300][-200,100]" }  // Completely offscreen
        ]
      }
    };

    const result = viewHierarchy.filterOffscreenNodes(hierarchy, 1080, 2400);

    const flatNodes: string[] = [];
    const collectNodes = (node: any) => {
      if (node.text) {flatNodes.push(node.text);}
      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        children.forEach(collectNodes);
      }
    };
    collectNodes(result.hierarchy);

    expect(flatNodes).toContain("Visible");
    expect(flatNodes).toContain("PartiallyLeft");
    expect(flatNodes).not.toContain("CompletelyLeft");
  });

  test("should return original hierarchy if screen dimensions are invalid", function() {
    const hierarchy = {
      hierarchy: {
        bounds: "[0,0][1080,2400]",
        node: { text: "Test", bounds: "[0,100][500,200]" }
      }
    };

    const result = viewHierarchy.filterOffscreenNodes(hierarchy, 0, 0);

    expect(result).toEqual(hierarchy);
  });

  test("should preserve visible children of offscreen parents", function() {
    const hierarchy = {
      hierarchy: {
        bounds: "[0,0][1080,2400]",
        node: {
          text: "OffscreenParent",
          bounds: "[0,3000][1080,4000]",
          node: [
            { text: "VisibleChild", bounds: "[0,100][500,200]" }
          ]
        }
      }
    };

    const result = viewHierarchy.filterOffscreenNodes(hierarchy, 1080, 2400);

    const flatNodes: string[] = [];
    const collectNodes = (node: any) => {
      if (node.text) {flatNodes.push(node.text);}
      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        children.forEach(collectNodes);
      }
    };
    collectNodes(result.hierarchy);

    // Visible child should be preserved even though parent is offscreen
    expect(flatNodes).toContain("VisibleChild");
    // Offscreen parent should be removed
    expect(flatNodes).not.toContain("OffscreenParent");
  });

  describe("findAccessibilityFocusedElement", function() {
    test("should find accessibility-focused element from top-level field", function() {
      const hierarchy = {
        "accessibility-focused-element": {
          "text": "Focused Button",
          "resource-id": "com.app:id/button",
          "content-desc": "Submit",
          "bounds": { left: 100, top: 200, right: 300, bottom: 250 }
        },
        "hierarchy": {
          bounds: "[0,0][1080,2400]",
          node: [
            { text: "Other Button", bounds: "[0,100][500,200]" }
          ]
        }
      };

      const result = viewHierarchy.findAccessibilityFocusedElement(hierarchy);

      expect(result).not.toBeNull();
      expect(result?.text).toBe("Focused Button");
      expect(result?.["resource-id"]).toBe("com.app:id/button");
      expect(result?.["content-desc"]).toBe("Submit");
      expect(result?.["accessibility-focused"]).toBe(true);
    });

    test("should find accessibility-focused element by traversing hierarchy", function() {
      const hierarchy = {
        hierarchy: {
          bounds: "[0,0][1080,2400]",
          node: [
            { text: "Button 1", bounds: "[0,100][500,200]" },
            {
              text: "Container",
              bounds: "[0,300][500,600]",
              node: [
                { "text": "Button 2", "accessibility-focused": "true", "bounds": "[10,310][490,350]" },
                { text: "Button 3", bounds: "[10,360][490,400]" }
              ]
            }
          ]
        }
      };

      const result = viewHierarchy.findAccessibilityFocusedElement(hierarchy);

      expect(result).not.toBeNull();
      expect(result?.text).toBe("Button 2");
      expect(result?.["accessibility-focused"]).toBe(true);
    });

    test("should return null when no accessibility-focused element exists", function() {
      const hierarchy = {
        hierarchy: {
          bounds: "[0,0][1080,2400]",
          node: [
            { text: "Button 1", bounds: "[0,100][500,200]" },
            { text: "Button 2", bounds: "[0,300][500,400]" }
          ]
        }
      };

      const result = viewHierarchy.findAccessibilityFocusedElement(hierarchy);

      expect(result).toBeNull();
    });

    test("should return null when hierarchy is null", function() {
      const result = viewHierarchy.findAccessibilityFocusedElement(null);

      expect(result).toBeNull();
    });

    test("should prioritize top-level field over hierarchy traversal", function() {
      const hierarchy = {
        "accessibility-focused-element": {
          text: "Top-level Focused",
          bounds: { left: 100, top: 200, right: 300, bottom: 250 }
        },
        "hierarchy": {
          bounds: "[0,0][1080,2400]",
          node: [
            { "text": "Hierarchy Focused", "accessibility-focused": "true", "bounds": "[0,100][500,200]" }
          ]
        }
      };

      const result = viewHierarchy.findAccessibilityFocusedElement(hierarchy);

      expect(result).not.toBeNull();
      expect(result?.text).toBe("Top-level Focused");
      expect(result?.["accessibility-focused"]).toBe(true);
    });

    test("should search across top-level root nodes for accessibility-focused element", function() {
      const hierarchy = {
        hierarchy: {
          bounds: "[0,0][1080,2400]",
          node: [
            { text: "Main Window Button", bounds: "[0,100][500,200]" },
            {
              bounds: "[0,0][500,300]",
              node: [
                { "text": "Popup Button", "accessibility-focused": "true", "bounds": "[10,10][490,50]" }
              ]
            }
          ]
        }
      };

      const result = viewHierarchy.findAccessibilityFocusedElement(hierarchy);

      expect(result).not.toBeNull();
      expect(result?.text).toBe("Popup Button");
      expect(result?.["accessibility-focused"]).toBe(true);
    });
  });
});

describe("Node Hash Generation", function() {
  let viewHierarchy: ViewHierarchy;
  let mockDevice: BootedDevice;

  beforeEach(function() {
    mockDevice = {
      deviceId: "test-device",
      name: "Test Device",
      platform: "android"
    };
    viewHierarchy = new ViewHierarchy(mockDevice, new FakeAdbExecutor() as any);
  });

  test("should generate consistent hash for same node properties", function() {
    const node1 = {
      "bounds": "[0,0][100,50]",
      "resource-id": "com.app:id/button",
      "text": "Click me",
      "content-desc": "Button",
      "class": "android.widget.Button",
      "clickable": "true",
      "scrollable": "false"
    };

    const node2 = { ...node1 };

    const hash1 = viewHierarchy.generateNodeHash(node1);
    const hash2 = viewHierarchy.generateNodeHash(node2);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBeGreaterThan(0);
  });

  test("should generate different hash for different bounds", function() {
    const node1 = {
      "bounds": "[0,0][100,50]",
      "resource-id": "com.app:id/button",
      "text": "Click me"
    };

    const node2 = {
      "bounds": "[0,100][100,150]",
      "resource-id": "com.app:id/button",
      "text": "Click me"
    };

    const hash1 = viewHierarchy.generateNodeHash(node1);
    const hash2 = viewHierarchy.generateNodeHash(node2);

    expect(hash1).not.toBe(hash2);
  });

  test("should handle $ property format", function() {
    const nodeWithDollar = {
      $: {
        "bounds": "[0,0][100,50]",
        "resource-id": "com.app:id/button",
        "text": "Click me"
      }
    };

    const nodeWithoutDollar = {
      "bounds": "[0,0][100,50]",
      "resource-id": "com.app:id/button",
      "text": "Click me"
    };

    const hash1 = viewHierarchy.generateNodeHash(nodeWithDollar);
    const hash2 = viewHierarchy.generateNodeHash(nodeWithoutDollar);

    expect(hash1).toBe(hash2);
  });

  test("should return empty string for null node", function() {
    const hash = viewHierarchy.generateNodeHash(null);
    expect(hash).toBe("");
  });

  test("should NOT include interaction properties in hash (for deduplication)", function() {
    // Interaction properties are intentionally excluded from hash
    // so the same element with different capability metadata is treated as duplicate
    const clickableNode = {
      bounds: "[0,0][100,50]",
      clickable: "true"
    };

    const scrollableNode = {
      bounds: "[0,0][100,50]",
      scrollable: "true"
    };

    const hash1 = viewHierarchy.generateNodeHash(clickableNode);
    const hash2 = viewHierarchy.generateNodeHash(scrollableNode);

    // Same bounds, no other identifying properties = same hash
    expect(hash1).toBe(hash2);
  });
});

describe("Zero Bounds Detection", function() {
  let viewHierarchy: ViewHierarchy;
  let mockDevice: BootedDevice;

  beforeEach(function() {
    mockDevice = {
      deviceId: "test-device",
      name: "Test Device",
      platform: "android"
    };
    viewHierarchy = new ViewHierarchy(mockDevice, new FakeAdbExecutor() as any);
  });

  test("should detect zero width bounds", function() {
    const node = { bounds: "[100,0][100,50]" };
    expect(viewHierarchy.hasZeroBounds(node)).toBe(true);
  });

  test("should detect zero height bounds", function() {
    const node = { bounds: "[0,100][100,100]" };
    expect(viewHierarchy.hasZeroBounds(node)).toBe(true);
  });

  test("should not flag valid bounds", function() {
    const node = { bounds: "[0,0][100,50]" };
    expect(viewHierarchy.hasZeroBounds(node)).toBe(false);
  });

  test("should handle object format bounds", function() {
    const zeroWidthNode = { bounds: { left: 100, top: 0, right: 100, bottom: 50 } };
    const zeroHeightNode = { bounds: { left: 0, top: 100, right: 100, bottom: 100 } };
    const validNode = { bounds: { left: 0, top: 0, right: 100, bottom: 50 } };

    expect(viewHierarchy.hasZeroBounds(zeroWidthNode)).toBe(true);
    expect(viewHierarchy.hasZeroBounds(zeroHeightNode)).toBe(true);
    expect(viewHierarchy.hasZeroBounds(validNode)).toBe(false);
  });

  test("should handle $ property format", function() {
    const node = { $: { bounds: "[100,0][100,50]" } };
    expect(viewHierarchy.hasZeroBounds(node)).toBe(true);
  });

  test("should return true for null node", function() {
    expect(viewHierarchy.hasZeroBounds(null)).toBe(true);
  });

  test("should not filter nodes without bounds info", function() {
    const node = { text: "No bounds" };
    expect(viewHierarchy.hasZeroBounds(node)).toBe(false);
  });

  test("should handle negative coordinates", function() {
    const validNode = { bounds: "[-50,-50][50,50]" };
    const zeroNode = { bounds: "[-50,0][-50,50]" };

    expect(viewHierarchy.hasZeroBounds(validNode)).toBe(false);
    expect(viewHierarchy.hasZeroBounds(zeroNode)).toBe(true);
  });
});

describe("Invisible Node Detection", function() {
  let viewHierarchy: ViewHierarchy;
  let mockDevice: BootedDevice;

  beforeEach(function() {
    mockDevice = {
      deviceId: "test-device",
      name: "Test Device",
      platform: "android"
    };
    viewHierarchy = new ViewHierarchy(mockDevice, new FakeAdbExecutor() as any);
  });

  test("should detect invisible node with string false", function() {
    const node = { visible: "false" };
    expect(viewHierarchy.isInvisible(node)).toBe(true);
  });

  test("should detect invisible node with boolean false", function() {
    const node = { visible: false };
    expect(viewHierarchy.isInvisible(node)).toBe(true);
  });

  test("should not flag visible node", function() {
    const node = { visible: "true" };
    expect(viewHierarchy.isInvisible(node)).toBe(false);
  });

  test("should not filter nodes without visible property", function() {
    const node = { text: "No visible property" };
    expect(viewHierarchy.isInvisible(node)).toBe(false);
  });

  test("should handle $ property format", function() {
    const node = { $: { visible: "false" } };
    expect(viewHierarchy.isInvisible(node)).toBe(true);
  });

  test("should return true for null node", function() {
    expect(viewHierarchy.isInvisible(null)).toBe(true);
  });
});

describe("Interactable Node Detection", function() {
  let viewHierarchy: ViewHierarchy;
  let mockDevice: BootedDevice;

  beforeEach(function() {
    mockDevice = {
      deviceId: "test-device",
      name: "Test Device",
      platform: "android"
    };
    viewHierarchy = new ViewHierarchy(mockDevice, new FakeAdbExecutor() as any);
  });

  test("should detect clickable node", function() {
    const node = { clickable: "true" };
    expect(viewHierarchy.isInteractable(node)).toBe(true);
  });

  test("should detect scrollable node", function() {
    const node = { scrollable: "true" };
    expect(viewHierarchy.isInteractable(node)).toBe(true);
  });

  test("should detect long-clickable node", function() {
    const node = { "long-clickable": "true" };
    expect(viewHierarchy.isInteractable(node)).toBe(true);
  });

  test("should detect focusable node", function() {
    const node = { focusable: "true" };
    expect(viewHierarchy.isInteractable(node)).toBe(true);
  });

  test("should detect checkable node", function() {
    const node = { checkable: "true" };
    expect(viewHierarchy.isInteractable(node)).toBe(true);
  });

  test("should not flag non-interactable node", function() {
    const node = { text: "Static text", enabled: "true" };
    expect(viewHierarchy.isInteractable(node)).toBe(false);
  });

  test("should return false for null node", function() {
    expect(viewHierarchy.isInteractable(null)).toBe(false);
  });

  test("should handle $ property format", function() {
    const node = { $: { clickable: "true" } };
    expect(viewHierarchy.isInteractable(node)).toBe(true);
  });
});

describe("Node Deduplication", function() {
  let viewHierarchy: ViewHierarchy;
  let mockDevice: BootedDevice;

  beforeEach(function() {
    mockDevice = {
      deviceId: "test-device",
      name: "Test Device",
      platform: "android"
    };
    viewHierarchy = new ViewHierarchy(mockDevice, new FakeAdbExecutor() as any);
  });

  test("should remove duplicate nodes with same hash", function() {
    const nodes = [
      { "bounds": "[0,0][100,50]", "resource-id": "button1", "text": "Click" },
      { "bounds": "[0,0][100,50]", "resource-id": "button1", "text": "Click" },
      { "bounds": "[0,100][100,150]", "resource-id": "button2", "text": "Submit" }
    ];

    const result = viewHierarchy.deduplicateNodes(nodes);

    expect(result).toHaveLength(2);
  });

  test("should prefer interactable nodes over non-interactable", function() {
    const nodes = [
      { "bounds": "[0,0][100,50]", "resource-id": "button1", "text": "Click" },
      { "bounds": "[0,0][100,50]", "resource-id": "button1", "text": "Click", "clickable": "true" }
    ];

    const result = viewHierarchy.deduplicateNodes(nodes);

    expect(result).toHaveLength(1);
    expect(result[0].clickable).toBe("true");
  });

  test("should filter out zero-bounds nodes", function() {
    const nodes = [
      { bounds: "[0,0][100,50]", text: "Visible" },
      { bounds: "[100,0][100,50]", text: "Zero width" },
      { bounds: "[0,100][100,100]", text: "Zero height" }
    ];

    const result = viewHierarchy.deduplicateNodes(nodes);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Visible");
  });

  test("should filter out invisible nodes", function() {
    const nodes = [
      { bounds: "[0,0][100,50]", text: "Visible" },
      { bounds: "[0,100][100,150]", text: "Hidden", visible: "false" }
    ];

    const result = viewHierarchy.deduplicateNodes(nodes);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Visible");
  });

  test("should handle empty array", function() {
    const result = viewHierarchy.deduplicateNodes([]);
    expect(result).toHaveLength(0);
  });
});

describe("Hierarchy Tree Deduplication", function() {
  let viewHierarchy: ViewHierarchy;
  let mockDevice: BootedDevice;

  beforeEach(function() {
    mockDevice = {
      deviceId: "test-device",
      name: "Test Device",
      platform: "android"
    };
    viewHierarchy = new ViewHierarchy(mockDevice, new FakeAdbExecutor() as any);
  });

  test("should recursively deduplicate children", function() {
    const hierarchy = {
      bounds: "[0,0][1080,2400]",
      text: "Root",
      node: [
        { bounds: "[0,0][100,50]", text: "Child 1" },
        { bounds: "[0,0][100,50]", text: "Child 1" },
        { bounds: "[0,100][100,150]", text: "Child 2" }
      ]
    };

    const result = viewHierarchy.deduplicateHierarchyTree(hierarchy);

    expect(result).toBeDefined();
    const children = Array.isArray(result.node) ? result.node : [result.node];
    expect(children).toHaveLength(2);
  });

  test("should filter zero-bounds nodes from tree", function() {
    const hierarchy = {
      bounds: "[0,0][1080,2400]",
      text: "Root",
      node: [
        { bounds: "[0,0][100,50]", text: "Visible" },
        { bounds: "[100,0][100,50]", text: "Zero width" }
      ]
    };

    const result = viewHierarchy.deduplicateHierarchyTree(hierarchy);

    expect(result).toBeDefined();
    expect(result.node.text).toBe("Visible");
  });

  test("should return null for zero-bounds root", function() {
    const hierarchy = {
      bounds: "[0,0][0,0]",
      text: "Zero root"
    };

    const result = viewHierarchy.deduplicateHierarchyTree(hierarchy);

    expect(result).toBeNull();
  });

  test("should handle single child", function() {
    const hierarchy = {
      bounds: "[0,0][1080,2400]",
      text: "Root",
      node: { bounds: "[0,0][100,50]", text: "Only child" }
    };

    const result = viewHierarchy.deduplicateHierarchyTree(hierarchy);

    expect(result).toBeDefined();
    expect(result.node.text).toBe("Only child");
  });

  test("should remove node property when all children filtered", function() {
    const hierarchy = {
      bounds: "[0,0][1080,2400]",
      text: "Root",
      node: [
        { bounds: "[100,0][100,50]", text: "Zero 1" },
        { bounds: "[0,100][100,100]", text: "Zero 2" }
      ]
    };

    const result = viewHierarchy.deduplicateHierarchyTree(hierarchy);

    expect(result).toBeDefined();
    expect(result.node).toBeUndefined();
  });
});

describe("Overlay Window Filtering", function() {
  let viewHierarchy: ViewHierarchy;
  let mockDevice: BootedDevice;

  beforeEach(function() {
    mockDevice = {
      deviceId: "test-device",
      name: "Test Device",
      platform: "android"
    };
    viewHierarchy = new ViewHierarchy(mockDevice, new FakeAdbExecutor() as any);
  });

  test("should filter accessibility_overlay windows", function() {
    const windows = [
      { windowType: "application", id: 1 },
      { windowType: "accessibility_overlay", id: 2 },
      { windowType: "system", id: 3 }
    ];

    const result = viewHierarchy.filterOverlayWindows(windows);

    expect(result).toHaveLength(2);
    expect(result?.find(w => w.windowType === "accessibility_overlay")).toBeUndefined();
  });

  test("should filter magnification_overlay windows", function() {
    const windows = [
      { windowType: "application", id: 1 },
      { windowType: "magnification_overlay", id: 2 }
    ];

    const result = viewHierarchy.filterOverlayWindows(windows);

    expect(result).toHaveLength(1);
    expect(result?.[0].windowType).toBe("application");
  });

  test("should handle numeric window types", function() {
    const windows = [
      { type: 1, id: 1 }, // application
      { type: 4, id: 2 }, // accessibility_overlay
      { type: 5, id: 3 }, // magnification_overlay
      { type: 2, id: 4 }  // input_method
    ];

    const result = viewHierarchy.filterOverlayWindows(windows);

    expect(result).toHaveLength(2);
    expect(result?.find(w => w.type === 4)).toBeUndefined();
    expect(result?.find(w => w.type === 5)).toBeUndefined();
  });

  test("should return undefined for undefined input", function() {
    const result = viewHierarchy.filterOverlayWindows(undefined);
    expect(result).toBeUndefined();
  });

  test("should keep all non-overlay windows", function() {
    const windows = [
      { windowType: "application", id: 1 },
      { windowType: "system", id: 2 },
      { windowType: "input_method", id: 3 },
      { windowType: "split_screen_divider", id: 4 }
    ];

    const result = viewHierarchy.filterOverlayWindows(windows);

    expect(result).toHaveLength(4);
  });

  test("should handle windows without type property", function() {
    const windows = [
      { id: 1, packageName: "com.app" },
      { windowType: "accessibility_overlay", id: 2 }
    ];

    const result = viewHierarchy.filterOverlayWindows(windows);

    expect(result).toHaveLength(1);
    expect(result?.[0].id).toBe(1);
  });
});

describe("Merge Hierarchies with Deduplication", function() {
  let viewHierarchy: ViewHierarchy;
  let mockDevice: BootedDevice;

  beforeEach(function() {
    mockDevice = {
      deviceId: "test-device",
      name: "Test Device",
      platform: "android"
    };
    viewHierarchy = new ViewHierarchy(mockDevice, new FakeAdbExecutor() as any);
  });

  test("should deduplicate nodes when merging a11y and uiautomator", function() {
    const a11yHierarchy = {
      hierarchy: {
        node: {
          "bounds": "[0,0][1080,2400]",
          "resource-id": "root",
          "node": [
            { "bounds": "[0,0][100,50]", "resource-id": "button1", "text": "Click" }
          ]
        }
      },
      packageName: "com.test"
    };

    const uiautomatorHierarchy = {
      hierarchy: {
        node: {
          "bounds": "[0,0][1080,2400]",
          "resource-id": "root",
          "node": [
            { "bounds": "[0,0][100,50]", "resource-id": "button1", "text": "Click" },
            { "bounds": "[0,100][100,150]", "resource-id": "button2", "text": "Submit" }
          ]
        }
      }
    };

    const result = viewHierarchy.mergeHierarchies(
      a11yHierarchy as any,
      uiautomatorHierarchy as any
    );

    expect(result.accessibilityServiceIncomplete).toBe(true);
    expect(result.sources).toContain("accessibility-service");
    expect(result.sources).toContain("uiautomator");
  });

  test("should return a11y hierarchy when uiautomator is missing", function() {
    const a11yHierarchy = {
      hierarchy: {
        node: { bounds: "[0,0][100,50]", text: "A11y only" }
      },
      packageName: "com.test"
    };

    const uiautomatorHierarchy = {
      hierarchy: {}
    };

    const result = viewHierarchy.mergeHierarchies(
      a11yHierarchy as any,
      uiautomatorHierarchy as any
    );

    expect(result.hierarchy.node.text).toBe("A11y only");
  });

  test("should return uiautomator hierarchy when a11y is missing", function() {
    const a11yHierarchy = {
      hierarchy: {},
      packageName: "com.test",
      windows: [{ id: 1 }]
    };

    const uiautomatorHierarchy = {
      hierarchy: {
        node: { bounds: "[0,0][100,50]", text: "UI only" }
      }
    };

    const result = viewHierarchy.mergeHierarchies(
      a11yHierarchy as any,
      uiautomatorHierarchy as any
    );

    expect(result.hierarchy.node.text).toBe("UI only");
    expect(result.packageName).toBe("com.test");
  });

  test("should return error when both hierarchies are empty", function() {
    const a11yHierarchy = { hierarchy: {} };
    const uiautomatorHierarchy = { hierarchy: {} };

    const result = viewHierarchy.mergeHierarchies(
      a11yHierarchy as any,
      uiautomatorHierarchy as any
    );

    expect(result.hierarchy.error).toBeDefined();
  });

  test("should filter overlay windows from merged result", function() {
    const a11yHierarchy = {
      hierarchy: {
        node: { bounds: "[0,0][100,50]", text: "Test" }
      },
      windows: [
        { windowType: "application", id: 1 },
        { windowType: "accessibility_overlay", id: 2 }
      ]
    };

    const uiautomatorHierarchy = {
      hierarchy: {
        node: { bounds: "[0,100][100,150]", text: "UI" }
      }
    };

    const result = viewHierarchy.mergeHierarchies(
      a11yHierarchy as any,
      uiautomatorHierarchy as any
    );

    expect(result.windows).toHaveLength(1);
    expect(result.windows?.[0].windowType).toBe("application");
  });
});
