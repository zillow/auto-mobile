#!/usr/bin/env bun
/**
 * Script to estimate MCP context usage across tool definitions, resources, and operations.
 *
 * Usage:
 *   bun scripts/estimate-context-usage.ts [--traces path/to/traces.json]
 *
 * Options:
 *   --traces    Path to JSON file containing recorded operation traces
 *
 * Output:
 *   Prints a detailed report including:
 *   - Tool list definitions token count (with per-tool breakdown)
 *   - Resource list token count (with per-resource breakdown)
 *   - Operation traces token count (with per-operation breakdown, if provided)
 *   - Total estimated context usage
 */

import { Tiktoken } from "js-tiktoken/lite";
import cl100k_base from "js-tiktoken/ranks/cl100k_base";
import { ToolRegistry } from "../src/server/toolRegistry";
import { ResourceRegistry } from "../src/server/resourceRegistry";

// Import all tool registration functions to populate the registry
import { registerObserveTools } from "../src/server/observeTools";
import { registerInteractionTools } from "../src/server/interactionTools";
import { registerAppTools } from "../src/server/appTools";
import { registerUtilityTools } from "../src/server/utilityTools";
import { registerDeviceTools } from "../src/server/deviceTools";
import { registerDeepLinkTools } from "../src/server/deepLinkTools";
import { registerNavigationTools } from "../src/server/navigationTools";
import { registerDaemonTools } from "../src/server/daemonTools";
import { registerPlanTools } from "../src/server/planTools";
import { registerDoctorTools } from "../src/server/doctorTools";
import { registerFeatureFlagTools } from "../src/server/featureFlagTools";
import { registerTestTimingTools } from "../src/server/testTimingTools";
import { registerPerformanceTools } from "../src/server/performanceTools";

// Import resource registration functions
import { registerObservationResources } from "../src/server/observationResources";
import { registerBootedDeviceResources } from "../src/server/bootedDeviceResources";
import { registerDeviceImageResources } from "../src/server/deviceImageResources";
import { registerAppResources } from "../src/server/appResources";
import { registerNavigationResources } from "../src/server/navigationResources";

import fs from "node:fs";

// Token encoder for Claude models (cl100k_base is used by Claude)
const tokenizer = new Tiktoken(cl100k_base);

interface TokenEstimate {
  text: string;
  tokenCount: number;
}

interface ToolEstimate extends TokenEstimate {
  name: string;
}

interface ResourceEstimate extends TokenEstimate {
  uri: string;
  name: string;
}

interface OperationEstimate extends TokenEstimate {
  index: number;
  operation?: string;
}

interface EstimationReport {
  tools: {
    total: number;
    items: ToolEstimate[];
  };
  resources: {
    total: number;
    items: ResourceEstimate[];
  };
  resourceTemplates: {
    total: number;
    items: ResourceEstimate[];
  };
  operations?: {
    total: number;
    items: OperationEstimate[];
  };
  grandTotal: number;
}

/**
 * Estimate token count for a text string
 */
function estimateTokens(text: string): number {
  try {
    const tokens = tokenizer.encode(text);
    return tokens.length;
  } catch (error) {
    console.error(`Error encoding text: ${error}`);
    return 0;
  }
}

/**
 * Register all tools in the registry
 */
function registerAllTools(): void {
  registerObserveTools();
  registerInteractionTools();
  registerAppTools();
  registerUtilityTools();
  registerDeviceTools();
  registerDeepLinkTools();
  registerNavigationTools();
  registerDaemonTools();
  registerPlanTools();
  registerTestTimingTools();
  registerDoctorTools();
  registerFeatureFlagTools();
  registerPerformanceTools();

  // Only register debug tools if debug mode is enabled
  // For estimation purposes, we'll skip them to match typical production usage
  // registerDebugTools();
}

/**
 * Register all resources in the registry
 */
function registerAllResources(): void {
  registerObservationResources();
  registerBootedDeviceResources();
  registerDeviceImageResources();
  registerAppResources();
  registerNavigationResources();
}

/**
 * Estimate tokens for all tool definitions
 */
function estimateToolTokens(): { total: number; items: ToolEstimate[] } {
  const toolDefinitions = ToolRegistry.getToolDefinitions();
  const items: ToolEstimate[] = [];

  for (const tool of toolDefinitions) {
    const toolJson = JSON.stringify(tool, null, 2);
    const tokenCount = estimateTokens(toolJson);
    items.push({
      name: tool.name,
      text: toolJson,
      tokenCount
    });
  }

  const total = items.reduce((sum, item) => sum + item.tokenCount, 0);
  return { total, items };
}

/**
 * Estimate tokens for all resource definitions
 */
function estimateResourceTokens(): { total: number; items: ResourceEstimate[] } {
  const resourceDefinitions = ResourceRegistry.getResourceDefinitions();
  const items: ResourceEstimate[] = [];

  for (const resource of resourceDefinitions) {
    const resourceJson = JSON.stringify(resource, null, 2);
    const tokenCount = estimateTokens(resourceJson);
    items.push({
      uri: resource.uri,
      name: resource.name,
      text: resourceJson,
      tokenCount
    });
  }

  const total = items.reduce((sum, item) => sum + item.tokenCount, 0);
  return { total, items };
}

/**
 * Estimate tokens for all resource template definitions
 */
function estimateResourceTemplateTokens(): { total: number; items: ResourceEstimate[] } {
  const templateDefinitions = ResourceRegistry.getTemplateDefinitions();
  const items: ResourceEstimate[] = [];

  for (const template of templateDefinitions) {
    const templateJson = JSON.stringify(template, null, 2);
    const tokenCount = estimateTokens(templateJson);
    items.push({
      uri: template.uriTemplate,
      name: template.name,
      text: templateJson,
      tokenCount
    });
  }

  const total = items.reduce((sum, item) => sum + item.tokenCount, 0);
  return { total, items };
}

/**
 * Load and estimate tokens for operation traces
 */
function estimateOperationTokens(tracePath: string): { total: number; items: OperationEstimate[] } | null {
  if (!fs.existsSync(tracePath)) {
    console.error(`Trace file not found: ${tracePath}`);
    return null;
  }

  try {
    const traceContent = fs.readFileSync(tracePath, "utf-8");
    const traces = JSON.parse(traceContent);

    if (!Array.isArray(traces)) {
      console.error("Trace file must contain an array of operations");
      return null;
    }

    const items: OperationEstimate[] = [];

    for (let i = 0; i < traces.length; i++) {
      const operation = traces[i];
      const operationJson = JSON.stringify(operation, null, 2);
      const tokenCount = estimateTokens(operationJson);

      items.push({
        index: i,
        operation: operation.method || operation.tool || `operation-${i}`,
        text: operationJson,
        tokenCount
      });
    }

    const total = items.reduce((sum, item) => sum + item.tokenCount, 0);
    return { total, items };
  } catch (error) {
    console.error(`Error reading trace file: ${error}`);
    return null;
  }
}

/**
 * Format number with thousand separators
 */
function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Print a formatted estimation report
 */
function printReport(report: EstimationReport): void {
  console.log("\n" + "=".repeat(80));
  console.log("MCP CONTEXT USAGE ESTIMATION REPORT");
  console.log("=".repeat(80) + "\n");

  // Tool definitions section
  console.log(`TOOL DEFINITIONS: ${formatNumber(report.tools.total)} tokens`);
  console.log("-".repeat(80));
  const sortedTools = [...report.tools.items].sort((a, b) => b.tokenCount - a.tokenCount);
  for (const tool of sortedTools) {
    console.log(`  ${tool.name.padEnd(30)} ${formatNumber(tool.tokenCount).padStart(10)} tokens`);
  }
  console.log("");

  // Resource definitions section
  console.log(`RESOURCE DEFINITIONS: ${formatNumber(report.resources.total)} tokens`);
  console.log("-".repeat(80));
  if (report.resources.items.length === 0) {
    console.log("  (no static resources registered)");
  } else {
    const sortedResources = [...report.resources.items].sort((a, b) => b.tokenCount - a.tokenCount);
    for (const resource of sortedResources) {
      console.log(`  ${resource.name.padEnd(30)} ${formatNumber(resource.tokenCount).padStart(10)} tokens`);
    }
  }
  console.log("");

  // Resource template definitions section
  console.log(`RESOURCE TEMPLATES: ${formatNumber(report.resourceTemplates.total)} tokens`);
  console.log("-".repeat(80));
  if (report.resourceTemplates.items.length === 0) {
    console.log("  (no resource templates registered)");
  } else {
    const sortedTemplates = [...report.resourceTemplates.items].sort((a, b) => b.tokenCount - a.tokenCount);
    for (const template of sortedTemplates) {
      console.log(`  ${template.name.padEnd(30)} ${formatNumber(template.tokenCount).padStart(10)} tokens`);
    }
  }
  console.log("");

  // Operations section (if provided)
  if (report.operations) {
    console.log(`OPERATION TRACES: ${formatNumber(report.operations.total)} tokens`);
    console.log("-".repeat(80));
    const sortedOps = [...report.operations.items].sort((a, b) => b.tokenCount - a.tokenCount);
    for (const op of sortedOps.slice(0, 20)) { // Show top 20
      const label = `  [${op.index}] ${op.operation || "unknown"}`;
      console.log(`${label.padEnd(40)} ${formatNumber(op.tokenCount).padStart(10)} tokens`);
    }
    if (sortedOps.length > 20) {
      console.log(`  ... and ${sortedOps.length - 20} more operations`);
    }
    console.log("");
  }

  // Summary section
  console.log("=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  console.log(`  Tool definitions:        ${formatNumber(report.tools.total).padStart(10)} tokens (${report.tools.items.length} tools)`);
  console.log(`  Resource definitions:    ${formatNumber(report.resources.total).padStart(10)} tokens (${report.resources.items.length} resources)`);
  console.log(`  Resource templates:      ${formatNumber(report.resourceTemplates.total).padStart(10)} tokens (${report.resourceTemplates.items.length} templates)`);
  if (report.operations) {
    console.log(`  Operation traces:        ${formatNumber(report.operations.total).padStart(10)} tokens (${report.operations.items.length} operations)`);
  }
  console.log("-".repeat(80));
  console.log(`  TOTAL ESTIMATED TOKENS:  ${formatNumber(report.grandTotal).padStart(10)}`);
  console.log("=".repeat(80) + "\n");
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  let tracePath: string | null = null;

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--traces" && i + 1 < args.length) {
      tracePath = args[i + 1];
      i++;
    }
  }

  console.log("Initializing MCP server components...");

  // Register all tools and resources
  registerAllTools();
  registerAllResources();

  console.log("Estimating token usage...\n");

  // Estimate tool tokens
  const toolEstimate = estimateToolTokens();

  // Estimate resource tokens
  const resourceEstimate = estimateResourceTokens();

  // Estimate resource template tokens
  const resourceTemplateEstimate = estimateResourceTemplateTokens();

  // Estimate operation tokens if trace file provided
  let operationEstimate: { total: number; items: OperationEstimate[] } | null = null;
  if (tracePath) {
    operationEstimate = estimateOperationTokens(tracePath);
  }

  // Calculate grand total
  let grandTotal = toolEstimate.total + resourceEstimate.total + resourceTemplateEstimate.total;
  if (operationEstimate) {
    grandTotal += operationEstimate.total;
  }

  // Create report
  const report: EstimationReport = {
    tools: toolEstimate,
    resources: resourceEstimate,
    resourceTemplates: resourceTemplateEstimate,
    operations: operationEstimate || undefined,
    grandTotal
  };

  // Print report
  printReport(report);
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
