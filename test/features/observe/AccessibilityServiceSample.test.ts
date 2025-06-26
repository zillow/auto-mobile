import { expect } from "chai";
import { describe, it, beforeEach } from "mocha";
import { AccessibilityServiceClient } from "../../../src/features/observe/AccessibilityServiceClient";
import { AdbUtils } from "../../../src/utils/adb";
import { logger } from "../../../src/utils/logger";
import { readFileAsync } from "../../../src/utils/io";
import path from "path";

describe("AccessibilityServiceClient - Sample Data", function() {
  let accessibilityServiceClient: AccessibilityServiceClient;
  let mockAdb: AdbUtils;

  beforeEach(function() {
    // Create mock ADB instance
    mockAdb = {
      executeCommand: async () => ({ stdout: "", stderr: "" })
    } as unknown as AdbUtils;

    accessibilityServiceClient = new AccessibilityServiceClient(null, mockAdb);
  });

  // Helper function to read the sample JSON file
  async function readSampleJsonFile(): Promise<any> {
    const samplePath = path.join(__dirname, "../../../scratch/latest_hierarchy.json");
    const jsonData = await readFileAsync(samplePath, "utf8");
    return JSON.parse(jsonData);
  }

  it("should parse the sample accessibility service JSON data correctly", async function() {
    // Read the sample JSON file
    const sampleData = await readSampleJsonFile();

    // Verify the basic structure of the sample data
    expect(sampleData).to.exist;
    expect(sampleData.timestamp).to.be.a("number");
    expect(sampleData.packageName).to.equal("com.google.android.deskclock");
    expect(sampleData.hierarchy).to.exist;

    logger.info(`Sample data timestamp: ${sampleData.timestamp}`);
    logger.info(`Sample data package: ${sampleData.packageName}`);
    logger.info(`Sample hierarchy has ${sampleData.hierarchy.node ? sampleData.hierarchy.node.length : 0} top-level nodes`);
  });

  it("should convert sample accessibility service data to ViewHierarchyResult format", async function() {
    // Read the sample JSON file
    const sampleData = await readSampleJsonFile();

    // Convert using the accessibility service client
    const result = accessibilityServiceClient.convertToViewHierarchyResult(sampleData);

    // Verify the conversion was successful
    expect(result).to.exist;
    expect(result.hierarchy).to.exist;
    expect(result.hierarchy.error).to.be.undefined;

    // Check that root hierarchy properties were converted correctly
    expect(result.hierarchy.bounds).to.equal("[0,0][1008,2244]");
    expect(result.hierarchy.clickable).to.be.undefined;
    expect(result.hierarchy.enabled).to.equal("true");

    // Check that child nodes were converted correctly
    if (result.hierarchy.node) {
      const nodes = Array.isArray(result.hierarchy.node) ? result.hierarchy.node : [result.hierarchy.node];

      // Find the digital clock element
      const digitalClock = nodes.find(node =>
        node["resource-id"] === "com.google.android.deskclock:id/digital_clock"
      );

      expect(digitalClock).to.exist;
      expect(digitalClock.text).to.include("6:43");
      expect(digitalClock.text).to.include("AM");
      expect(digitalClock["content-desc"]).to.include("6:43");
      expect(digitalClock["content-desc"]).to.include("AM");
      expect(digitalClock.bounds).to.equal("[175,687][692,973]");
      expect(digitalClock.clickable).to.be.undefined;
      expect(digitalClock.enabled).to.equal("true");

      // Find the date element
      const dateElement = nodes.find(node =>
        node["resource-id"] === "com.google.android.deskclock:id/date_and_next_alarm"
      );

      expect(dateElement).to.exist;
      expect(dateElement.text).to.equal("Thu, Jun 26");
      expect(dateElement["content-desc"]).to.equal("Thursday, June 26");
      expect(dateElement.bounds).to.equal("[327,955][540,1011]");

      logger.info(`Found ${nodes.length} top-level nodes after conversion`);
      logger.info(`Digital clock bounds: ${digitalClock.bounds}`);
      logger.info(`Date element bounds: ${dateElement.bounds}`);
    }
  });

  it("should simulate end-to-end accessibility service retrieval with sample data", async function() {
    // Read the sample JSON file
    const sampleData = await readSampleJsonFile();

    // Mock the ADB commands to simulate a working accessibility service
    let commandCount = 0;
    mockAdb.executeCommand = async (cmd: string) => {
      commandCount++;

      if (cmd.includes("pm list packages")) {
        return {
          stdout: "package:com.zillow.automobile.accessibilityservice\n",
          stderr: ""
        };
      } else if (cmd.includes("settings get secure")) {
        return {
          stdout: "com.zillow.automobile.accessibilityservice/com.zillow.automobile.accessibilityservice.AutomobileAccessibilityService",
          stderr: ""
        };
      } else if (cmd.includes("run-as")) {
        return {
          stdout: JSON.stringify(sampleData),
          stderr: ""
        };
      }

      return { stdout: "", stderr: "" };
    };

    // Test the full flow
    const result = await accessibilityServiceClient.getAccessibilityHierarchy();

    // Verify the result
    expect(result).to.not.be.null;
    expect(result!.hierarchy).to.exist;
    expect(result!.hierarchy.error).to.be.undefined;

    // Verify specific elements from the sample data
    if (result!.hierarchy.node) {
      const nodes = Array.isArray(result!.hierarchy.node) ? result!.hierarchy.node : [result!.hierarchy.node];

      const digitalClock = nodes.find(node =>
        node["resource-id"] === "com.google.android.deskclock:id/digital_clock"
      );

      expect(digitalClock).to.exist;
      expect(digitalClock.text).to.include("6:43");
      expect(digitalClock.text).to.include("AM");
    }

    // Verify that all three ADB commands were called (install check, enabled check, hierarchy fetch)
    expect(commandCount).to.equal(3);

    logger.info("End-to-end accessibility service simulation completed successfully");
  });

  it("should handle the specific structure of the sample data correctly", async function() {
    // Read the sample JSON file
    const sampleData = await readSampleJsonFile();

    // Test the specific structure we expect from the accessibility service
    expect(sampleData.hierarchy.className).to.equal("android.widget.FrameLayout");
    expect(sampleData.hierarchy.packageName).to.equal("com.google.android.deskclock");
    expect(sampleData.hierarchy.bounds.left).to.equal(0);
    expect(sampleData.hierarchy.bounds.top).to.equal(0);
    expect(sampleData.hierarchy.bounds.right).to.equal(1008);
    expect(sampleData.hierarchy.bounds.bottom).to.equal(2244);

    // Verify child nodes structure
    expect(sampleData.hierarchy.node).to.be.an("array");
    expect(sampleData.hierarchy.node).to.have.length(2);

    // Test first child (digital clock)
    const firstChild = sampleData.hierarchy.node[0];
    expect(firstChild.text).to.include("6:43");
    expect(firstChild.text).to.include("AM");
    expect(firstChild["content-desc"]).to.include("6:43");
    expect(firstChild["content-desc"]).to.include("AM");
    expect(firstChild["resource-id"]).to.equal("com.google.android.deskclock:id/digital_clock");
    expect(firstChild.className).to.equal("android.widget.TextView");
    expect(firstChild.bounds.left).to.equal(175);
    expect(firstChild.bounds.top).to.equal(687);
    expect(firstChild.bounds.right).to.equal(692);
    expect(firstChild.bounds.bottom).to.equal(973);

    // Test second child (date)
    const secondChild = sampleData.hierarchy.node[1];
    expect(secondChild.text).to.equal("Thu, Jun 26");
    expect(secondChild["content-desc"]).to.equal("Thursday, June 26");
    expect(secondChild["resource-id"]).to.equal("com.google.android.deskclock:id/date_and_next_alarm");
    expect(secondChild.className).to.equal("android.widget.TextView");
    expect(secondChild.bounds.left).to.equal(327);
    expect(secondChild.bounds.top).to.equal(955);
    expect(secondChild.bounds.right).to.equal(540);
    expect(secondChild.bounds.bottom).to.equal(1011);

    logger.info("Sample data structure validation completed successfully");
  });

  it("should preserve important properties during conversion", async function() {
    // Read the sample JSON file
    const sampleData = await readSampleJsonFile();

    // Convert the data
    const result = accessibilityServiceClient.convertToViewHierarchyResult(sampleData);

    // Verify that important properties are preserved
    expect(result.hierarchy.bounds).to.equal("[0,0][1008,2244]");

    if (result.hierarchy.node) {
      const nodes = Array.isArray(result.hierarchy.node) ? result.hierarchy.node : [result.hierarchy.node];

      // Check that each node has its bounds converted to string format
      for (const node of nodes) {
        expect(node.bounds).to.be.a("string");
        expect(node.bounds).to.match(/^\[\d+,\d+\]\[\d+,\d+\]$/);

        // Verify that text and content-desc are preserved
        if (node.text) {
          expect(node.text).to.be.a("string");
        }
        if (node["content-desc"]) {
          expect(node["content-desc"]).to.be.a("string");
        }
        if (node["resource-id"]) {
          expect(node["resource-id"]).to.be.a("string");
        }
      }
    }

    logger.info("Property preservation validation completed successfully");
  });
});
