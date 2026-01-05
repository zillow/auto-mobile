import { ToolRegistry } from "../server/toolRegistry";
import { logger } from "../utils/logger";
import { ActionableError } from "../models";
import { DaemonClient, DaemonUnavailableError } from "../daemon/client";
import { DaemonManager } from "../daemon/manager";

// Import all tool registration functions
import { registerObserveTools } from "../server/observeTools";
import { registerInteractionTools } from "../server/interactionTools";
import { registerAppTools } from "../server/appTools";
import { registerUtilityTools } from "../server/utilityTools";
import { registerDeviceTools } from "../server/deviceTools";
import { registerPlanTools } from "../server/planTools";
import { registerDoctorTools } from "../server/doctorTools";

// Initialize tool registry for CLI mode
export function initializeCliTools(): void {

  // Register all tool categories
  registerObserveTools();
  registerInteractionTools();
  registerAppTools();
  registerUtilityTools();
  registerDeviceTools();
  registerPlanTools();
  registerDoctorTools();
}

// Parse CLI arguments into tool name, session UUID, and parameters
function parseCliArgs(args: string[]): { toolName: string; sessionUuid?: string; params: Record<string, any> } {
  if (args.length === 0) {
    throw new ActionableError("No tool name provided. Usage: --cli [--session-uuid <uuid>] <tool-name> [--param value ...]");
  }

  let toolNameIndex = 0;
  let sessionUuid: string | undefined;

  // Check for --session-uuid parameter before tool name
  if (args[0] === "--session-uuid") {
    if (args.length < 3) {
      throw new ActionableError("--session-uuid requires a value and a tool name");
    }
    sessionUuid = args[1];
    toolNameIndex = 2;
  }

  const toolName = args[toolNameIndex];
  const params: Record<string, any> = {};

  // Parse remaining arguments as key-value pairs or boolean flags
  for (let i = toolNameIndex + 1; i < args.length; i++) {
    const key = args[i];

    if (!key.startsWith("--")) {
      throw new ActionableError(`Invalid parameter format: ${key}. Parameters must start with --`);
    }

    // Remove '--' prefix and convert kebab-case to camelCase
    // e.g., --session-uuid -> sessionUuid
    const paramName = key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

    const nextArg = args[i + 1];

    // Check if this is a boolean flag (no value or next arg is also a flag)
    if (nextArg === undefined || nextArg.startsWith("--")) {
      // Boolean flag without value - treat as true
      params[paramName] = true;
    } else {
      // Key-value pair
      i++; // Skip the value in the next iteration

      // Try to parse as JSON, fallback to string
      try {
        params[paramName] = JSON.parse(nextArg);
      } catch {
        // If not valid JSON, treat as string
        params[paramName] = nextArg;
      }
    }
  }

  return { toolName, sessionUuid, params };
}

/**
 * Ensure daemon is running, starting it if necessary
 * with a timeout for startup
 */
async function ensureDaemonRunning(timeout: number = 10000): Promise<void> {
  const available = await DaemonClient.isAvailable();
  if (available) {
    return; // Daemon already running and responsive
  }

  logger.debug("Daemon not available, attempting to start...");

  const manager = new DaemonManager();
  try {
    await manager.start();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ActionableError(
      `Failed to start daemon: ${message}. ` +
      `Try running: auto-mobile --daemon restart`
    );
  }
}

/**
 * Execute tool via daemon (mandatory - no fallback)
 * Daemon must be available or this will throw
 */
async function runToolViaDaemon(
  toolName: string,
  params: Record<string, any>
): Promise<any> {
  // Ensure daemon is running before attempting to call
  await ensureDaemonRunning();

  const client = new DaemonClient();

  try {
    const result = await client.callTool(toolName, params);
    if (result === null) {
      throw new ActionableError(
        "Daemon returned null result. This may indicate a daemon connectivity issue. " +
        "Try: auto-mobile --daemon restart"
      );
    }
    return result;
  } catch (error) {
    if (error instanceof DaemonUnavailableError) {
      throw new ActionableError(
        `Daemon became unavailable during tool execution: ${error.message}. ` +
        `Try: auto-mobile --daemon restart`
      );
    }
    if (error instanceof ActionableError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ActionableError(
      `Error calling daemon: ${message}. ` +
      `Try: auto-mobile --daemon restart`
    );
  } finally {
    // Always close the client connection to prevent connection leaks
    await client.close();
  }
}

/**
 * Run the doctor command with daemon fallback to direct execution
 */
async function runDoctorCommand(params: Record<string, any>): Promise<void> {
  const jsonOutput = params.json === true;

  // Try daemon first
  try {
    logger.debug("Attempting to run doctor via daemon");
    const daemonResult = await runToolViaDaemon("doctor", params);
    handleDoctorResult(daemonResult, jsonOutput);
    return;
  } catch (error) {
    logger.debug(`Daemon not available for doctor, falling back to direct execution: ${error}`);
  }

  // Fallback to direct execution
  const { runDoctor, formatConsoleOutput, formatJsonOutput } = await import("../doctor");
  const report = await runDoctor({
    android: params.android,
    ios: params.ios,
  });

  if (jsonOutput) {
    console.log(formatJsonOutput(report));
  } else {
    console.log(formatConsoleOutput(report, process.stdout.isTTY ?? true));
  }

  // Exit with error code if any failures
  if (report.summary.failed > 0) {
    process.exit(1);
  }
}

/**
 * Handle doctor command result from daemon
 */
function handleDoctorResult(result: any, jsonOutput: boolean): void {
  // Extract the report from MCP response format
  let report = result;
  if (result && typeof result === "object" && "content" in result && Array.isArray(result.content)) {
    if (result.content.length > 0 && result.content[0].type === "text") {
      try {
        report = JSON.parse(result.content[0].text);
      } catch {
        // Keep original result
      }
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    // Use the formatter for console output
    import("../doctor").then(({ formatConsoleOutput }) => {
      console.log(formatConsoleOutput(report, process.stdout.isTTY ?? true));
    });
  }

  // Exit with error code if any failures
  if (report && report.summary && report.summary.failed > 0) {
    process.exit(1);
  }
}

function handleToolResult(result: any, toolName: string): void {
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
}

// Main CLI command runner
export async function runCliCommand(args: string[]): Promise<void> {
  try {
    if (args.length === 0) {
      // Show help with available tools
      initializeCliTools();
      showHelp();
      return;
    }

    // Handle special commands
    if (args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
      initializeCliTools();
      if (args.length > 1) {
        showToolHelp(args[1]);
      } else {
        showHelp();
      }
      return;
    }

    // Parse tool name, session UUID, and parameters
    const { toolName, sessionUuid, params } = parseCliArgs(args);

    // Add session UUID to params if provided
    if (sessionUuid) {
      params.sessionUuid = sessionUuid;
      logger.debug(`Using session UUID: ${sessionUuid}`);
    }

    // Special handling for doctor command - try daemon first, fallback to direct
    if (toolName === "doctor") {
      await runDoctorCommand(params);
      return;
    }

    // All tool execution goes through daemon (mandatory)
    logger.debug(`Executing tool via daemon: ${toolName}`);
    const daemonResult = await runToolViaDaemon(toolName, params);
    handleToolResult(daemonResult, toolName);

    // Note: Session cleanup for executePlan now happens automatically on the daemon side
    // See toolRegistry.ts registerDeviceAware() finally block

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
  auto-mobile --cli [--session-uuid <uuid>] <tool-name> [--param value ...]
  auto-mobile --cli help [tool-name]

Examples:
  auto-mobile --cli listDevices
  auto-mobile --cli observe
  auto-mobile --cli tapOn --text "Submit"
  auto-mobile --cli startDevice --avdName "pixel_7_api_34"
  auto-mobile --cli --session-uuid abc-123-uuid observe
  auto-mobile --cli --session-uuid $SESSION_UUID tapOn --text "Submit"

Options:
  help [tool-name]              Show help for a specific tool
  --session-uuid <uuid>         Associate tool execution with a session (optional)

Parameters:
  Parameters are passed as --key value pairs
  Values are parsed as JSON if possible, otherwise as strings
  Boolean values: --flag true or --flag false
  Numbers: --count 5
  Objects: --options '{"key": "value"}'

Session-based Execution:
  When using --session-uuid, the tool will be executed on the device assigned to that session.
  This allows multiple tool calls to target the same device in parallel.
`);

  // Show categorized tools
  const categories = new Map<string, typeof tools>();

  const deviceTools = [
    "setActiveDevice",
    "enableDemoMode",
    "disableDemoMode",
    "listDeviceImages",
    "listDevices",
    "startDevice",
    "killDevice",
    "checkRunningDevices"
  ];
  const systemConfigTools = [
    "setLocale",
    "setTimeZone",
    "setTextDirection",
    "set24HourFormat",
    "getCalendarSystem"
  ];

  // Group tools by category (based on their prefixes or common patterns)
  tools.forEach(tool => {
    let category = "General";

    if (systemConfigTools.includes(tool.name)) {
      category = "System Configuration";
    } else if (deviceTools.includes(tool.name)) {
      category = "Device Management";
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
