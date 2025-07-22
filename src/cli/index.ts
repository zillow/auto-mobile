import { ToolRegistry } from "../server/toolRegistry";
import { logger } from "../utils/logger";
import { ActionableError } from "../models";

// Import all tool registration functions
import { registerObserveTools } from "../server/observeTools";
import { registerInteractionTools } from "../server/interactionTools";
import { registerAppTools } from "../server/appTools";
import { registerUtilityTools } from "../server/utilityTools";
import { registerEmulatorTools } from "../server/emulatorTools";
import { registerSimulatorTools } from "../server/simulatorTools";
import { registerPlanTools } from "../server/planTools";

// Initialize tool registry for CLI mode
export function initializeCliTools(): void {

  // Register all tool categories
  registerObserveTools();
  registerInteractionTools();
  registerAppTools();
  registerUtilityTools();
  registerEmulatorTools();
  registerSimulatorTools();
  registerPlanTools();
}

// Parse CLI arguments into tool name and parameters
function parseCliArgs(args: string[]): { toolName: string; params: Record<string, any> } {
  if (args.length === 0) {
    throw new ActionableError("No tool name provided. Usage: --cli <tool-name> [--param value ...]");
  }

  const toolName = args[0];
  const params: Record<string, any> = {};

  // Parse remaining arguments as key-value pairs
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];

    if (!key.startsWith("--")) {
      throw new ActionableError(`Invalid parameter format: ${key}. Parameters must start with --`);
    }

    if (value === undefined) {
      throw new ActionableError(`Missing value for parameter: ${key}`);
    }

    const paramName = key.slice(2); // Remove '--' prefix

    // Try to parse as JSON, fallback to string
    try {
      params[paramName] = JSON.parse(value);
    } catch {
      // If not valid JSON, treat as string
      params[paramName] = value;
    }
  }

  return { toolName, params };
}

// Main CLI command runner
export async function runCliCommand(args: string[]): Promise<void> {
  try {
    // Initialize tool registry
    initializeCliTools();

    if (args.length === 0) {
      // Show help with available tools
      showHelp();
      return;
    }

    // Handle special commands
    if (args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
      if (args.length > 1) {
        showToolHelp(args[1]);
      } else {
        showHelp();
      }
      return;
    }

    // Parse tool name and parameters
    const { toolName, params } = parseCliArgs(args);

    // Get the tool from registry
    const tool = ToolRegistry.getTool(toolName);
    if (!tool) {
      throw new ActionableError(`Unknown tool: ${toolName}. Use '--cli help' to see available tools.`);
    }

    // Validate parameters
    let parsedParams;
    try {
      parsedParams = tool.schema.parse(params);
    } catch (error) {
      throw new ActionableError(`Invalid parameters for tool ${toolName}: ${error}`);
    }

    // Create a simple progress callback for CLI
    const progressCallback = tool.supportsProgress
      ? async (progress: number, total?: number, message?: string) => {
        const percentage = total ? Math.round((progress / total) * 100) : progress;
        const msg = message ? ` - ${message}` : "";
        console.log(`Progress: ${percentage}%${msg}`);
      }
      : undefined;

    logger.info(`Executing tool: ${toolName} with params:`, parsedParams);

    // Execute the tool
    const result = await tool.handler(parsedParams, progressCallback);

    // Output the result
    console.log(JSON.stringify(result, null, 2));

    // Check if the result indicates failure and exit with code 1
    // Handle both direct result format and MCP content format
    let actualResult = result;
    if (result && typeof result === "object" && "content" in result && Array.isArray(result.content)) {
      // MCP format - extract from content array
      if (result.content.length > 0 && result.content[0].type === "text") {
        try {
          actualResult = JSON.parse(result.content[0].text);
        } catch {
          // If parsing fails, keep the original result
          actualResult = result;
        }
      }
    }

    if (actualResult && typeof actualResult === "object" && actualResult.success === false) {
      // Write error message to STDERR
      if (actualResult.error) {
        console.error(actualResult.error);
      }

      // Special handling for executePlan tool
      if (toolName === "executePlan") {
        console.error(`Executed ${actualResult.executedSteps} of ${actualResult.totalSteps} steps`);
        if (actualResult.failedStep) {
          console.error(`Failed at step ${actualResult.failedStep.stepIndex + 1}: ${actualResult.failedStep.tool}`);
          console.error(`Step error: ${actualResult.failedStep.error}`);
        }
      }

      process.exit(1);
    }

  } catch (error) {
    if (error instanceof ActionableError) {
      logger.error(`CLI Error: ${error.message}`);
      console.error(`Error: ${error.message}`);
    } else {
      logger.error(`Unexpected CLI Error: ${error}`);
      console.error(`Unexpected error: ${error}`);
    }
    process.exit(1);
  }
}

// Show general help
function showHelp(): void {
  const tools = ToolRegistry.getAllTools();

  console.log(`
AutoMobile CLI - Android Device Automation

Usage:
  auto-mobile --cli <tool-name> [--param value ...]
  auto-mobile --cli help [tool-name]

Examples:
  auto-mobile --cli listDevices
  auto-mobile --cli observe
  auto-mobile --cli tapOn --text "Submit"
  auto-mobile --cli startEmulator --avdName "pixel_7_api_34"

Options:
  help [tool-name]    Show help for a specific tool

Parameters:
  Parameters are passed as --key value pairs
  Values are parsed as JSON if possible, otherwise as strings
  Boolean values: --flag true or --flag false
  Numbers: --count 5
  Objects: --options '{"key": "value"}'
`);

  // Show categorized tools
  const categories = new Map<string, typeof tools>();

  const emulatorTools = [
    "setActiveDevice",
    "enableDemoMode",
    "disableDemoMode",
    "listAvds",
    "listDevices",
    "startEmulator",
    "killEmulator",
    "checkRunningEmulators"
  ];

  const sourceMapTools = [
    "addAppConfig",
    "setAndroidAppSource",
    "getAppConfigs",
    "getSourceIndex",
    "findActivitySource",
    "findFragmentSource"
  ];

  // Group tools by category (based on their prefixes or common patterns)
  tools.forEach(tool => {
    let category = "General";

    if (emulatorTools.includes(tool.name)) {
      category = "Emulator Management";
    } else if (sourceMapTools.includes(tool.name)) {
      category = "Source Mapping";
    } else if (tool.name.includes("App") || tool.name.includes("app")) {
      category = "App Management";
    } else if (tool.name.startsWith("assert")) {
      category = "Assertions";
    } else if (tool.name.includes("observe")) {
      category = "Observation";
    } else if (tool.name.includes("Plan") || tool.name.includes("plan")) {
      category = "Plan Management";
    } else {
      category = "Interactions";
    }

    if (!categories.has(category)) {
      categories.set(category, []);
    }
    categories.get(category)!.push(tool);
  });

  console.log("\nAvailable Tools:");
  console.log("================");

  // Display tools by category
  categories.forEach((toolList, category) => {
    console.log(`\n${category}:`);
    toolList.forEach(tool => {
      console.log(`  ${tool.name.padEnd(25)} - ${tool.description}`);
    });
  });

  console.log(`\nTotal: ${tools.length} tools available`);
  console.log("\nUse 'auto-mobile --cli help <tool-name>' for detailed information about a specific tool.");
}

// Show help for a specific tool
function showToolHelp(toolName: string): void {
  const tool = ToolRegistry.getTool(toolName);
  if (!tool) {
    console.error(`Unknown tool: ${toolName}`);
    console.log("\nUse 'auto-mobile --cli help' to see available tools.");
    return;
  }

  console.log(`\nTool: ${tool.name}`);
  console.log("=".repeat(tool.name.length + 6));
  console.log(`Description: ${tool.description}`);

  if (tool.supportsProgress) {
    console.log("Supports: Progress notifications");
  }

  // Show schema information
  console.log("\nParameters:");
  try {
    const schema = tool.schema._def;
    if (schema && schema.shape) {
      Object.entries(schema.shape).forEach(([key, value]: [string, any]) => {
        const isOptional = value._def.typeName === "ZodOptional";
        const actualType = isOptional ? value._def.innerType : value;
        const typeName = actualType._def.typeName || "unknown";

        console.log(`  --${key} ${isOptional ? "(optional)" : "(required)"}`);
        console.log(`    Type: ${typeName.replace("Zod", "").toLowerCase()}`);

        if (actualType._def.description) {
          console.log(`    Description: ${actualType._def.description}`);
        }
      });
    } else {
      console.log("  No parameters required");
    }
  } catch (error) {
    console.log("  Could not parse parameter schema");
  }

  console.log(`\nExample usage:`);
  console.log(`  auto-mobile --cli ${toolName} [parameters...]`);
}
