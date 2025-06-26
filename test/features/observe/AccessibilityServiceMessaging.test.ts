import { expect } from "chai";
import { describe, it, beforeEach } from "mocha";
import { AccessibilityServiceClient } from "../../../src/features/observe/AccessibilityServiceClient";
import { AdbUtils } from "../../../src/utils/adb";
import { logger } from "../../../src/utils/logger";
import { readFileAsync } from "../../../src/utils/io";
import path from "path";

describe("AccessibilityServiceClient - Messaging App", function() {
  let accessibilityServiceClient: AccessibilityServiceClient;
  let mockAdb: AdbUtils;

  beforeEach(function() {
    // Create mock ADB instance
    mockAdb = {
      executeCommand: async () => ({ stdout: "", stderr: "" })
    } as unknown as AdbUtils;

    accessibilityServiceClient = new AccessibilityServiceClient(null, mockAdb);
  });

  it("should parse the messaging app accessibility service JSON data correctly", async function() {
    // Read the messaging app JSON file
    const messagingData = await (async () => {
      const samplePath = path.join(__dirname, "../../../scratch/messages_hierarchy.json");
      const jsonData = await readFileAsync(samplePath, "utf8");
      return JSON.parse(jsonData);
    })();

    // Verify the basic structure of the messaging app data
    expect(messagingData).to.exist;
    expect(messagingData.packageName).to.equal("com.google.android.apps.messaging");
    expect(messagingData.hierarchy).to.exist;

    logger.info(`Messaging app package: ${messagingData.packageName}`);
    logger.info(`Messaging app hierarchy class: ${messagingData.hierarchy.className}`);
  });

  it("should convert messaging app accessibility service data to ViewHierarchyResult format", async function() {
    // Read the messaging app JSON file
    const messagingData = await (async () => {
      const samplePath = path.join(__dirname, "../../../scratch/messages_hierarchy.json");
      const jsonData = await readFileAsync(samplePath, "utf8");
      return JSON.parse(jsonData);
    })();

    // Convert using the accessibility service client
    const result = accessibilityServiceClient.convertToViewHierarchyResult(messagingData);

    // Verify the conversion was successful
    expect(result).to.exist;
    expect(result.hierarchy).to.exist;
    expect(result.hierarchy.error).to.be.undefined;

    // Check that the root hierarchy properties were converted correctly
    expect(result.hierarchy.bounds).to.equal("[0,0][1008,2244]");
    expect(result.hierarchy.clickable).to.be.undefined;
    expect(result.hierarchy.enabled).to.equal("true");

    logger.info("Messaging app conversion completed successfully");
  });

  it("should debug the converted messaging app hierarchy structure", async function() {
    // Read the messaging app JSON file
    const messagingData = await (async () => {
      const samplePath = path.join(__dirname, "../../../scratch/messages_hierarchy.json");
      const jsonData = await readFileAsync(samplePath, "utf8");
      return JSON.parse(jsonData);
    })();

    // Convert using the accessibility service client
    const result = accessibilityServiceClient.convertToViewHierarchyResult(messagingData);

    // Debug the structure
    logger.info("Raw messaging data structure:");
    logger.info(`Original hierarchy has ${messagingData.hierarchy.node ? "node property" : "no node property"}`);
    logger.info(`Original hierarchy.node type: ${Array.isArray(messagingData.hierarchy.node) ? "array" : typeof messagingData.hierarchy.node}`);

    logger.info("Converted result structure:");
    logger.info(`Converted hierarchy has ${result.hierarchy.node ? "node property" : "no node property"}`);
    logger.info(`Converted hierarchy.node type: ${Array.isArray(result.hierarchy.node) ? "array" : typeof result.hierarchy.node}`);

    if (result.hierarchy.node) {
      const nodeAsAny = result.hierarchy.node as any;
      logger.info(`First level node resource-id: ${nodeAsAny["resource-id"] || "none"}`);
      logger.info(`First level node has children: ${nodeAsAny.node ? "yes" : "no"}`);

      if (nodeAsAny.node) {
        const children = Array.isArray(nodeAsAny.node) ? nodeAsAny.node : [nodeAsAny.node];
        logger.info(`Number of children at first level: ${children.length}`);

        // Look for message_text in the converted hierarchy
        let messageTextCount = 0;

        function countMessageText(node: any): void {
          if (!node) {return;}

          if (node["resource-id"] === "message_text") {
            messageTextCount++;
            logger.info(`Found message_text with text: ${node.text || "no text"}`);
          }

          if (node.node) {
            const children = Array.isArray(node.node) ? node.node : [node.node];
            for (const child of children) {
              countMessageText(child);
            }
          }
        }

        countMessageText(result.hierarchy);
        logger.info(`Total message_text elements found: ${messageTextCount}`);
      }
    }

    // This test is just for debugging
    expect(result).to.exist;
  });

  it("should find message text elements in the messaging app hierarchy", async function() {
    // Read the messaging app JSON file
    const messagingData = await (async () => {
      const samplePath = path.join(__dirname, "../../../scratch/messages_hierarchy.json");
      const jsonData = await readFileAsync(samplePath, "utf8");
      return JSON.parse(jsonData);
    })();

    // Convert using the accessibility service client
    const result = accessibilityServiceClient.convertToViewHierarchyResult(messagingData);

    // Find message text elements
    const messageTextElements = (function findElementsByResourceId(hierarchy: any, resourceId: string): any[] {
      const results: any[] = [];

      const traverse = (node: any): void => {
        if (!node) {return;}

        if (node["resource-id"] === resourceId) {
          results.push(node);
        }

        if (node.node) {
          const children = Array.isArray(node.node) ? node.node : [node.node];
          for (const child of children) {
            traverse(child);
          }
        }
      };

      traverse(hierarchy);
      return results;
    })(result.hierarchy, "message_text");

    expect(messageTextElements).to.have.length.greaterThan(0);

    // Check specific message content
    const messages = messageTextElements.map(element => element.text).filter(text => text);

    expect(messages).to.include("I just love you! We are all thinking about you & we know you will just kill it today! 🎆❤️🚗🎉🤩🥳");
    expect(messages).to.include("Ah! ");
    expect(messages).to.include("Maybe take a little nap after? ");
    expect(messages).to.include("I can't wait to hear how it goes!");

    logger.info(`Found ${messageTextElements.length} message text elements`);
    logger.info(`Message texts: ${messages.slice(0, 3).join(", ")}...`);
  });

  it("should find compose text input element in the messaging app hierarchy", async function() {
    // Read the messaging app JSON file
    const messagingData = await (async () => {
      const samplePath = path.join(__dirname, "../../../scratch/messages_hierarchy.json");
      const jsonData = await readFileAsync(samplePath, "utf8");
      return JSON.parse(jsonData);
    })();

    // Convert using the accessibility service client
    const result = accessibilityServiceClient.convertToViewHierarchyResult(messagingData);

    // Find the compose message text input
    const composeElements = (function findElementsByResourceId(hierarchy: any, resourceId: string): any[] {
      const results: any[] = [];

      const traverse = (node: any): void => {
        if (!node) {return;}

        if (node["resource-id"] === resourceId) {
          results.push(node);
        }

        if (node.node) {
          const children = Array.isArray(node.node) ? node.node : [node.node];
          for (const child of children) {
            traverse(child);
          }
        }
      };

      traverse(hierarchy);
      return results;
    })(result.hierarchy, "com.google.android.apps.messaging:id/compose_message_text");

    expect(composeElements).to.have.length(1);

    const composeElement = composeElements[0];
    expect(composeElement.text).to.equal("Text message");
    expect(composeElement.clickable).to.equal("true");
    expect(composeElement.focused).to.equal("true");
    expect(composeElement.bounds).to.equal("[126,1271][630,1397]");

    logger.info("Found compose text input element");
    logger.info(`Compose element bounds: ${composeElement.bounds}`);
  });

  it("should find clickable elements with accessibility scores in the messaging hierarchy", async function() {
    // Read the messaging app JSON file
    const messagingData = await (async () => {
      const samplePath = path.join(__dirname, "../../../scratch/messages_hierarchy.json");
      const jsonData = await readFileAsync(samplePath, "utf8");
      return JSON.parse(jsonData);
    })();

    // Convert using the accessibility service client
    const result = accessibilityServiceClient.convertToViewHierarchyResult(messagingData);

    // Find elements with accessibility scores
    const accessibleElements = (function findElementsWithAccessibilityScores(hierarchy: any): any[] {
      const results: any[] = [];

      const traverse = (node: any): void => {
        if (!node) {return;}

        if (node.clickable === "true" || node.accessible !== undefined) {
          results.push(node);
        }

        if (node.node) {
          const children = Array.isArray(node.node) ? node.node : [node.node];
          for (const child of children) {
            traverse(child);
          }
        }
      };

      traverse(hierarchy);
      return results;
    })(result.hierarchy);

    expect(accessibleElements).to.have.length.greaterThan(0);

    // Check that some elements have accessibility scores
    const elementsWithScores = accessibleElements.filter(element =>
      element.accessible !== undefined && element.accessible !== null
    );

    expect(elementsWithScores).to.have.length.greaterThan(0);

    // Verify the compose text input has full accessibility (1.0)
    const composeElement = accessibleElements.find(element =>
      element["resource-id"] === "com.google.android.apps.messaging:id/compose_message_text"
    );

    expect(composeElement).to.exist;
    expect(composeElement.accessible).to.equal(1.0);

    logger.info(`Found ${elementsWithScores.length} elements with accessibility scores`);
    logger.info(`Compose element accessibility: ${composeElement?.accessible}`);
  });

  it("should find action buttons in the messaging app hierarchy", async function() {
    // Read the messaging app JSON file
    const messagingData = await (async () => {
      const samplePath = path.join(__dirname, "../../../scratch/messages_hierarchy.json");
      const jsonData = await readFileAsync(samplePath, "utf8");
      return JSON.parse(jsonData);
    })();

    // Convert using the accessibility service client
    const result = accessibilityServiceClient.convertToViewHierarchyResult(messagingData);

    // Find action buttons by content description
    const backButton = (function findElementsByContentDesc(hierarchy: any, contentDesc: string): any[] {
      const results: any[] = [];

      const traverse = (node: any): void => {
        if (!node) {return;}

        if (node["content-desc"] === contentDesc) {
          results.push(node);
        }

        if (node.node) {
          const children = Array.isArray(node.node) ? node.node : [node.node];
          for (const child of children) {
            traverse(child);
          }
        }
      };

      traverse(hierarchy);
      return results;
    })(result.hierarchy, "Back");

    const callButton = (function findElementsByContentDesc(hierarchy: any, contentDesc: string): any[] {
      const results: any[] = [];

      const traverse = (node: any): void => {
        if (!node) {return;}

        if (node["content-desc"] === contentDesc) {
          results.push(node);
        }

        if (node.node) {
          const children = Array.isArray(node.node) ? node.node : [node.node];
          for (const child of children) {
            traverse(child);
          }
        }
      };

      traverse(hierarchy);
      return results;
    })(result.hierarchy, "Call");

    const videoButton = (function findElementsByContentDesc(hierarchy: any, contentDesc: string): any[] {
      const results: any[] = [];

      const traverse = (node: any): void => {
        if (!node) {return;}

        if (node["content-desc"] === contentDesc) {
          results.push(node);
        }

        if (node.node) {
          const children = Array.isArray(node.node) ? node.node : [node.node];
          for (const child of children) {
            traverse(child);
          }
        }
      };

      traverse(hierarchy);
      return results;
    })(result.hierarchy, "Video");

    expect(backButton).to.have.length(1);
    expect(callButton).to.have.length(1);
    expect(videoButton).to.have.length(1);

    // Verify back button properties
    expect(backButton[0].bounds).to.equal("[36,158][90,212]");

    // Verify call button properties
    expect(callButton[0].bounds).to.equal("[702,158][756,212]");

    // Verify video button properties
    expect(videoButton[0].bounds).to.equal("[810,158][864,212]");

    logger.info("Found all expected action buttons");
    logger.info(`Back button bounds: ${backButton[0].bounds}`);
    logger.info(`Call button bounds: ${callButton[0].bounds}`);
    logger.info(`Video button bounds: ${videoButton[0].bounds}`);
  });

  it("should find contact information in the messaging app hierarchy", async function() {
    // Read the messaging app JSON file
    const messagingData = await (async () => {
      const samplePath = path.join(__dirname, "../../../scratch/messages_hierarchy.json");
      const jsonData = await readFileAsync(samplePath, "utf8");
      return JSON.parse(jsonData);
    })();

    // Convert using the accessibility service client
    const result = accessibilityServiceClient.convertToViewHierarchyResult(messagingData);

    // Find contact name
    const contactNameElements = (function findElementsByText(hierarchy: any, text: string): any[] {
      const results: any[] = [];

      const traverse = (node: any): void => {
        if (!node) {return;}

        if (node.text === text) {
          results.push(node);
        }

        if (node.node) {
          const children = Array.isArray(node.node) ? node.node : [node.node];
          for (const child of children) {
            traverse(child);
          }
        }
      };

      traverse(hierarchy);
      return results;
    })(result.hierarchy, "Orianna Ellison");

    expect(contactNameElements).to.have.length(1);

    const contactElement = contactNameElements[0];
    expect(contactElement.bounds).to.equal("[243,158][507,212]");
    expect(contactElement.clickable).to.be.undefined;

    logger.info("Found contact information");
    logger.info(`Contact name: ${contactElement.text}`);
    logger.info(`Contact bounds: ${contactElement.bounds}`);
  });

  it("should verify message list scrollable area in the messaging app hierarchy", async function() {
    // Read the messaging app JSON file
    const messagingData = await (async () => {
      const samplePath = path.join(__dirname, "../../../scratch/messages_hierarchy.json");
      const jsonData = await readFileAsync(samplePath, "utf8");
      return JSON.parse(jsonData);
    })();

    // Convert using the accessibility service client
    const result = accessibilityServiceClient.convertToViewHierarchyResult(messagingData);

    // Find the scrollable message list
    const scrollableElements = (function findScrollableElements(hierarchy: any): any[] {
      const results: any[] = [];

      const traverse = (node: any): void => {
        if (!node) {return;}

        if (node.scrollable === "true") {
          results.push(node);
        }

        if (node.node) {
          const children = Array.isArray(node.node) ? node.node : [node.node];
          for (const child of children) {
            traverse(child);
          }
        }
      };

      traverse(hierarchy);
      return results;
    })(result.hierarchy);

    expect(scrollableElements).to.have.length.greaterThan(0);

    // Find the message list specifically
    const messageList = scrollableElements.find(element =>
      element["resource-id"] === "message_list"
    );

    expect(messageList).to.exist;
    expect(messageList.scrollable).to.equal("true");
    expect(messageList.bounds).to.equal("[0,113][1008,2244]");

    logger.info("Found scrollable message list");
    logger.info(`Message list bounds: ${messageList.bounds}`);
  });

  it("should simulate end-to-end messaging app accessibility service retrieval", async function() {
    // Read the messaging app JSON file
    const messagingData = await (async () => {
      const samplePath = path.join(__dirname, "../../../scratch/messages_hierarchy.json");
      const jsonData = await readFileAsync(samplePath, "utf8");
      return JSON.parse(jsonData);
    })();

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
          stdout: JSON.stringify(messagingData),
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

    // Verify messaging app specific elements
    const composeElements = (function findElementsByResourceId(hierarchy: any, resourceId: string): any[] {
      const results: any[] = [];

      const traverse = (node: any): void => {
        if (!node) {return;}

        if (node["resource-id"] === resourceId) {
          results.push(node);
        }

        if (node.node) {
          const children = Array.isArray(node.node) ? node.node : [node.node];
          for (const child of children) {
            traverse(child);
          }
        }
      };

      traverse(hierarchy);
      return results;
    })(result!.hierarchy, "com.google.android.apps.messaging:id/compose_message_text");

    expect(composeElements).to.have.length(1);

    // Verify that all three ADB commands were called
    expect(commandCount).to.equal(3);

    logger.info("End-to-end messaging app accessibility service simulation completed successfully");
  });
});
