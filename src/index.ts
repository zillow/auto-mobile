#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ObserveCommand } from "./commands/observe.ts";
import { TapCommand } from "./commands/tap.ts";
import { TapOnTextCommand } from "./commands/tapOnText.ts";
import { AdbUtils } from "./utils/adb.ts";
import { DeviceUtils } from "./utils/device.ts";
import { AppUtils } from "./utils/app.ts";
import { InputUtils } from "./utils/input.ts";
import { logger } from './utils/logger.ts';

// Define schema for various tool inputs
const observeSchema = z.object({
  withScreenshot: z.boolean().optional().describe("Whether to include a screenshot"),
  screenshotPath: z.string().optional().describe("Path to save the screenshot")
});

const tapSchema = z.object({
  x: z.number().describe("X coordinate to tap"),
  y: z.number().describe("Y coordinate to tap"),
  waitForIdle: z.boolean().optional().describe("Whether to wait for UI to be idle after tap")
});

const tapOnTextSchema = z.object({
  text: z.string().describe("Text to find and tap on"),
  fuzzyMatch: z.boolean().optional().describe("Whether to use fuzzy matching"),
  caseSensitive: z.boolean().optional().describe("Whether to use case-sensitive matching"),
  waitForIdle: z.boolean().optional().describe("Whether to wait for UI to be idle after tap")
});

const deviceIdSchema = z.object({
  deviceId: z.string().describe("The device ID to set as active")
});

const appActionSchema = z.object({
  packageName: z.string().describe("The package name of the app")
});

const installAppSchema = z.object({
  apkPath: z.string().describe("Path to the APK file to install")
});

const sendKeysSchema = z.object({
  text: z.string().describe("Text to send to the device")
});

const pressButtonSchema = z.object({
  button: z.enum(["home", "back", "menu", "power", "volume_up", "volume_down", "recent"])
    .describe("The button to press")
});

const orientationSchema = z.object({
  orientation: z.enum(["portrait", "landscape"]).describe("The orientation to set")
});

const openUrlSchema = z.object({
  url: z.string().describe("URL to open in the default browser")
});

async function main() {
  // Set up utils and commands
  const adbUtils = new AdbUtils();
  const deviceUtils = new DeviceUtils();
  const appUtils = new AppUtils();
  const inputUtils = new InputUtils();
  const observeCommand = new ObserveCommand();
  const tapCommand = new TapCommand();
  const tapOnTextCommand = new TapOnTextCommand();
  
  // Create a new MCP server
  const server = new Server({
    name: "MCP ADB Firebender",
    version: "1.0.0"
  }, {
    capabilities: {
      tools: {}
    }
  });
  
  // Register the tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "observe",
          description: "Get screen details, view hierarchy, and screenshot",
          inputSchema: {
            type: "object",
            properties: {
              withScreenshot: {
                type: "boolean",
                description: "Whether to include a screenshot"
              },
              screenshotPath: {
                type: "string",
                description: "Path to save the screenshot"
              }
            }
          }
        },
        {
          name: "tap",
          description: "Tap at specific coordinates",
          inputSchema: {
            type: "object",
            properties: {
              x: {
                type: "number",
                description: "X coordinate to tap"
              },
              y: {
                type: "number",
                description: "Y coordinate to tap"
              },
              waitForIdle: {
                type: "boolean",
                description: "Whether to wait for UI to be idle after tap"
              }
            },
            required: ["x", "y"]
          }
        },
        {
          name: "tap_on_text",
          description: "Find and tap on text in the UI",
          inputSchema: {
            type: "object",
            properties: {
              text: {
                type: "string",
                description: "Text to find and tap on"
              },
              fuzzyMatch: {
                type: "boolean",
                description: "Whether to use fuzzy matching"
              },
              caseSensitive: {
                type: "boolean",
                description: "Whether to use case-sensitive matching"
              },
              waitForIdle: {
                type: "boolean",
                description: "Whether to wait for UI to be idle after tap"
              }
            },
            required: ["text"]
          }
        },
        {
          name: "get_devices",
          description: "Get a list of connected devices",
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "set_device",
          description: "Set the active device",
          inputSchema: {
            type: "object",
            properties: {
              deviceId: {
                type: "string",
                description: "The device ID to set as active"
              }
            },
            required: ["deviceId"]
          }
        },
        {
          name: "list_apps",
          description: "List installed apps on the device",
          inputSchema: {
            type: "object",
            properties: {
              includeSystemApps: {
                type: "boolean",
                description: "Whether to include system apps"
              }
            }
          }
        },
        {
          name: "launch_app",
          description: "Launch an app by package name",
          inputSchema: {
            type: "object",
            properties: {
              packageName: {
                type: "string",
                description: "The package name of the app to launch"
              }
            },
            required: ["packageName"]
          }
        },
        {
          name: "terminate_app",
          description: "Terminate an app by package name",
          inputSchema: {
            type: "object",
            properties: {
              packageName: {
                type: "string",
                description: "The package name of the app to terminate"
              }
            },
            required: ["packageName"]
          }
        },
        {
          name: "clear_app_data",
          description: "Clear app data for a specific package",
          inputSchema: {
            type: "object",
            properties: {
              packageName: {
                type: "string",
                description: "The package name of the app to clear data for"
              }
            },
            required: ["packageName"]
          }
        },
        {
          name: "install_app",
          description: "Install an APK file",
          inputSchema: {
            type: "object",
            properties: {
              apkPath: {
                type: "string",
                description: "Path to the APK file to install"
              }
            },
            required: ["apkPath"]
          }
        },
        {
          name: "send_keys",
          description: "Send text input to the device",
          inputSchema: {
            type: "object",
            properties: {
              text: {
                type: "string",
                description: "Text to send to the device"
              }
            },
            required: ["text"]
          }
        },
        {
          name: "press_button",
          description: "Press a hardware button",
          inputSchema: {
            type: "object",
            properties: {
              button: {
                type: "string",
                enum: ["home", "back", "menu", "power", "volume_up", "volume_down", "recent"],
                description: "The button to press"
              }
            },
            required: ["button"]
          }
        },
        {
          name: "set_orientation",
          description: "Change device orientation",
          inputSchema: {
            type: "object",
            properties: {
              orientation: {
                type: "string",
                enum: ["portrait", "landscape"],
                description: "The orientation to set"
              }
            },
            required: ["orientation"]
          }
        },
        {
          name: "open_url",
          description: "Open a URL in the default browser",
          inputSchema: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "URL to open in the default browser"
              }
            },
            required: ["url"]
          }
        }
      ]
    };
  });
  
  // Register the tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { name, arguments: args } = request.params;
      
      switch (name) {
        case "observe": {
          const params = observeSchema.parse(args);
          const result = await observeCommand.execute(params);
          return {
            content: [
              {
                type: "json",
                json: result
              }
            ]
          };
        }
        
        case "tap": {
          const params = tapSchema.parse(args);
          const result = await tapCommand.execute(params);
          return {
            content: [
              {
                type: "json",
                json: result
              }
            ]
          };
        }
        
        case "tap_on_text": {
          const params = tapOnTextSchema.parse(args);
          const result = await tapOnTextCommand.execute(params);
          return {
            content: [
              {
                type: "json",
                json: result
              }
            ]
          };
        }
        
        case "get_devices": {
          const devices = await adbUtils.getDevices();
          return {
            content: [
              {
                type: "json",
                json: { devices }
              }
            ]
          };
        }
        
        case "set_device": {
          const { deviceId } = deviceIdSchema.parse(args);
          adbUtils.setDeviceId(deviceId);
          return {
            content: [
              {
                type: "text",
                text: `Active device set to: ${deviceId}`
              }
            ]
          };
        }
        
        case "list_apps": {
          const includeSystemApps = args.includeSystemApps === true;
          const apps = await appUtils.listInstalledApps(includeSystemApps);
          return {
            content: [
              {
                type: "json",
                json: { apps }
              }
            ]
          };
        }
        
        case "launch_app": {
          const { packageName } = appActionSchema.parse(args);
          await appUtils.launchApp(packageName);
          return {
            content: [
              {
                type: "text",
                text: `Launched app: ${packageName}`
              }
            ]
          };
        }
        
        case "terminate_app": {
          const { packageName } = appActionSchema.parse(args);
          await appUtils.terminateApp(packageName);
          return {
            content: [
              {
                type: "text",
                text: `Terminated app: ${packageName}`
              }
            ]
          };
        }
        
        case "clear_app_data": {
          const { packageName } = appActionSchema.parse(args);
          await appUtils.clearAppData(packageName);
          return {
            content: [
              {
                type: "text",
                text: `Cleared data for app: ${packageName}`
              }
            ]
          };
        }
        
        case "install_app": {
          const { apkPath } = installAppSchema.parse(args);
          await appUtils.installApp(apkPath);
          return {
            content: [
              {
                type: "text",
                text: `Installed app from: ${apkPath}`
              }
            ]
          };
        }
        
        case "send_keys": {
          const { text } = sendKeysSchema.parse(args);
          await inputUtils.sendText(text);
          return {
            content: [
              {
                type: "text",
                text: `Sent text: ${text}`
              }
            ]
          };
        }
        
        case "press_button": {
          const { button } = pressButtonSchema.parse(args);
          await inputUtils.pressButton(button);
          return {
            content: [
              {
                type: "text",
                text: `Pressed button: ${button}`
              }
            ]
          };
        }
        
        case "set_orientation": {
          const { orientation } = orientationSchema.parse(args);
          await deviceUtils.setOrientation(orientation);
          return {
            content: [
              {
                type: "text",
                text: `Set orientation to: ${orientation}`
              }
            ]
          };
        }
        
        case "open_url": {
          const { url } = openUrlSchema.parse(args);
          await appUtils.openUrl(url);
          return {
            content: [
              {
                type: "text",
                text: `Opened URL: ${url}`
              }
            ]
          };
        }
        
        default:
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Unknown tool: ${name}`
              }
            ]
          };
      }
    } catch (error) {
      logger.error('Error executing tool:', error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  });
  
  // Start the server with stdio transport
  logger.debug("Starting MCP ADB Firebender server...");
  
  // Connect using stdio
  const stdioTransport = new StdioServerTransport();
  
  try {
    await server.connect(stdioTransport);
    logger.debug("MCP ADB Firebender server started successfully");
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => logger.error('Error running main function:', error));