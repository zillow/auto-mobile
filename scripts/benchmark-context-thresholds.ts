#!/usr/bin/env bun
/**
 * Benchmark script to enforce MCP context usage thresholds.
 *
 * Usage:
 *   bun scripts/benchmark-context-thresholds.ts [--config path/to/config.json] [--output path/to/report.json]
 *
 * Options:
 *   --config    Path to threshold configuration file (default: scripts/context-thresholds.json)
 *   --output    Path to write JSON report file (optional)
 *
 * Exit codes:
 *   0 - All thresholds passed
 *   1 - One or more thresholds exceeded or error occurred
 */

import { Tiktoken } from "js-tiktoken/lite";
import cl100k_base from "js-tiktoken/ranks/cl100k_base";
import { ToolRegistry } from "../src/server/toolRegistry";
import { ResourceRegistry } from "../src/server/resourceRegistry";

// Import all tool registration functions
import { registerObserveTools } from "../src/server/observeTools";
import { registerInteractionTools } from "../src/server/interactionTools";
import { registerAppTools } from "../src/server/appTools";
import { registerUtilityTools } from "../src/server/utilityTools";
import { registerDeviceTools } from "../src/server/deviceTools";
import { registerDeepLinkTools } from "../src/server/deepLinkTools";
import { registerNavigationTools } from "../src/server/navigationTools";
import { registerPlanTools } from "../src/server/planTools";
import { registerDoctorTools } from "../src/server/doctorTools";
import { registerFeatureFlagTools } from "../src/server/featureFlagTools";

// Import resource registration functions
import { registerObservationResources } from "../src/server/observationResources";
import { registerBootedDeviceResources } from "../src/server/bootedDeviceResources";
import { registerDeviceImageResources } from "../src/server/deviceImageResources";
import { registerAppResources } from "../src/server/appResources";
import { registerNavigationResources } from "../src/server/navigationResources";

import fs from "node:fs";
import path from "node:path";

// Token encoder for Claude models
const tokenizer = new Tiktoken(cl100k_base);

interface ThresholdConfig {
  version: string;
  thresholds: {
    tools: number;
    resources: number;
    resourceTemplates: number;
    total: number;
  };
  metadata?: {
    generatedAt?: string;
    description?: string;
  };
}

interface CategoryResult {
  actual: number;
  threshold: number;
  passed: boolean;
  usage: number; // percentage
}

interface BenchmarkReport {
  timestamp: string;
  passed: boolean;
  results: {
    tools: CategoryResult;
    resources: CategoryResult;
    resourceTemplates: CategoryResult;
    total: CategoryResult;
  };
  thresholds: ThresholdConfig["thresholds"];
  violations: string[];
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
  registerPlanTools();
  registerDoctorTools();
  registerFeatureFlagTools();
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
function estimateToolTokens(): number {
  const toolDefinitions = ToolRegistry.getToolDefinitions();
  let total = 0;

  for (const tool of toolDefinitions) {
    const toolJson = JSON.stringify(stripOutputSchema(tool), null, 2);
    total += estimateTokens(toolJson);
  }

  return total;
}

function stripOutputSchema(tool: Record<string, unknown>): Record<string, unknown> {
  const { outputSchema, ...rest } = tool;
  return rest;
}

/**
 * Estimate tokens for all resource definitions
 */
function estimateResourceTokens(): number {
  const resourceDefinitions = ResourceRegistry.getResourceDefinitions();
  let total = 0;

  for (const resource of resourceDefinitions) {
    const resourceJson = JSON.stringify(resource, null, 2);
    total += estimateTokens(resourceJson);
  }

  return total;
}

/**
 * Estimate tokens for all resource template definitions
 */
function estimateResourceTemplateTokens(): number {
  const templateDefinitions = ResourceRegistry.getTemplateDefinitions();
  let total = 0;

  for (const template of templateDefinitions) {
    const templateJson = JSON.stringify(template, null, 2);
    total += estimateTokens(templateJson);
  }

  return total;
}

/**
 * Load threshold configuration from file
 */
function loadThresholdConfig(configPath: string): ThresholdConfig {
  if (!fs.existsSync(configPath)) {
    console.error(`Threshold configuration file not found: ${configPath}`);
    process.exit(1);
  }

  try {
    const configContent = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(configContent) as ThresholdConfig;

    // Validate configuration
    if (!config.thresholds) {
      throw new Error("Missing 'thresholds' section in configuration");
    }

    const required = ["tools", "resources", "resourceTemplates", "total"];
    for (const key of required) {
      if (typeof config.thresholds[key as keyof typeof config.thresholds] !== "number") {
        throw new Error(`Missing or invalid threshold: ${key}`);
      }
    }

    return config;
  } catch (error) {
    console.error(`Error loading threshold configuration: ${error}`);
    process.exit(1);
  }
}

/**
 * Check if actual value exceeds threshold
 */
function checkThreshold(actual: number, threshold: number): CategoryResult {
  const passed = actual <= threshold;
  const usage = threshold > 0 ? Math.round((actual / threshold) * 100) : 0;

  return {
    actual,
    threshold,
    passed,
    usage
  };
}

/**
 * Run benchmark and check thresholds
 */
function runBenchmark(config: ThresholdConfig): BenchmarkReport {
  console.log("Initializing MCP server components...");

  // Register all tools and resources
  registerAllTools();
  registerAllResources();

  console.log("Estimating token usage...\n");

  // Estimate tokens for each category
  const toolsActual = estimateToolTokens();
  const resourcesActual = estimateResourceTokens();
  const resourceTemplatesActual = estimateResourceTemplateTokens();
  const totalActual = toolsActual + resourcesActual + resourceTemplatesActual;

  // Check each threshold
  const toolsResult = checkThreshold(toolsActual, config.thresholds.tools);
  const resourcesResult = checkThreshold(resourcesActual, config.thresholds.resources);
  const resourceTemplatesResult = checkThreshold(resourceTemplatesActual, config.thresholds.resourceTemplates);
  const totalResult = checkThreshold(totalActual, config.thresholds.total);

  // Collect violations
  const violations: string[] = [];
  if (!toolsResult.passed) {
    violations.push(`Tools: ${toolsResult.actual} tokens exceeds threshold of ${toolsResult.threshold} tokens`);
  }
  if (!resourcesResult.passed) {
    violations.push(`Resources: ${resourcesResult.actual} tokens exceeds threshold of ${resourcesResult.threshold} tokens`);
  }
  if (!resourceTemplatesResult.passed) {
    violations.push(`Resource Templates: ${resourceTemplatesResult.actual} tokens exceeds threshold of ${resourceTemplatesResult.threshold} tokens`);
  }
  if (!totalResult.passed) {
    violations.push(`Total: ${totalResult.actual} tokens exceeds threshold of ${totalResult.threshold} tokens`);
  }

  const passed = violations.length === 0;

  return {
    timestamp: new Date().toISOString(),
    passed,
    results: {
      tools: toolsResult,
      resources: resourcesResult,
      resourceTemplates: resourceTemplatesResult,
      total: totalResult
    },
    thresholds: config.thresholds,
    violations
  };
}

/**
 * Print benchmark report to console
 */
function printReport(report: BenchmarkReport): void {
  console.log("\n" + "=".repeat(80));
  console.log("MCP CONTEXT THRESHOLD BENCHMARK REPORT");
  console.log("=".repeat(80) + "\n");

  const formatRow = (label: string, result: CategoryResult) => {
    const status = result.passed ? "✓ PASS" : "✗ FAIL";
    const statusColor = result.passed ? "\x1b[32m" : "\x1b[31m";
    const resetColor = "\x1b[0m";

    return `  ${label.padEnd(25)} ${result.actual.toString().padStart(8)} / ${result.threshold.toString().padEnd(8)} (${result.usage.toString().padStart(3)}%)  ${statusColor}${status}${resetColor}`;
  };

  console.log("Category                     Actual / Threshold       Usage  Status");
  console.log("-".repeat(80));
  console.log(formatRow("Tools", report.results.tools));
  console.log(formatRow("Resources", report.results.resources));
  console.log(formatRow("Resource Templates", report.results.resourceTemplates));
  console.log("-".repeat(80));
  console.log(formatRow("TOTAL", report.results.total));
  console.log("=".repeat(80));

  if (report.violations.length > 0) {
    console.log("\n" + "⚠️  THRESHOLD VIOLATIONS:".padStart(40));
    console.log("-".repeat(80));
    for (const violation of report.violations) {
      console.log(`  • ${violation}`);
    }
    console.log("-".repeat(80));
  }

  const overallStatus = report.passed ? "✓ PASSED" : "✗ FAILED";
  const statusColor = report.passed ? "\x1b[32m" : "\x1b[31m";
  const resetColor = "\x1b[0m";
  console.log(`\n${statusColor}Overall Status: ${overallStatus}${resetColor}\n`);
}

/**
 * Write benchmark report to JSON file
 */
function writeReportToFile(report: BenchmarkReport, outputPath: string): void {
  try {
    // Ensure parent directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const reportJson = JSON.stringify(report, null, 2);
    fs.writeFileSync(outputPath, reportJson, "utf-8");
    console.log(`Benchmark report written to: ${outputPath}`);
  } catch (error) {
    console.error(`Error writing report to file: ${error}`);
    process.exit(1);
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  let configPath = path.join(__dirname, "context-thresholds.json");
  let outputPath: string | null = null;

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--config" && i + 1 < args.length) {
      configPath = args[i + 1];
      i++;
    } else if (args[i] === "--output" && i + 1 < args.length) {
      outputPath = args[i + 1];
      i++;
    }
  }

  console.log(`Loading threshold configuration from: ${configPath}\n`);

  // Load threshold configuration
  const config = loadThresholdConfig(configPath);

  // Run benchmark
  const report = runBenchmark(config);

  // Print report to console
  printReport(report);

  // Write report to file if output path specified
  if (outputPath) {
    writeReportToFile(report, outputPath);
  }

  // Exit with appropriate code
  process.exit(report.passed ? 0 : 1);
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
