#!/usr/bin/env bun
/**
 * Benchmark script to enforce NPM unpacked size thresholds.
 *
 * Usage:
 *   bun scripts/benchmark-npm-unpacked-size.ts [--config path/to/config.json] [--output path/to/report.json]
 *
 * Options:
 *   --config    Path to threshold configuration file (default: scripts/npm-unpacked-size-thresholds.json)
 *   --output    Path to write JSON report file (optional)
 *
 * Exit codes:
 *   0 - Threshold satisfied
 *   1 - Threshold exceeded or error occurred
 */

import fs from "node:fs";
import path from "node:path";

const DEFAULT_CONFIG_PATH = path.join("scripts", "npm-unpacked-size-thresholds.json");
const REQUIRED_DIST_ENTRY = path.join("dist", "src", "index.js");

interface ThresholdConfig {
  version: string;
  thresholds: {
    unpackedBytes: number;
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
  usage: number;
}

interface BenchmarkReport {
  timestamp: string;
  passed: boolean;
  results: {
    unpackedSize: CategoryResult;
  };
  thresholds: ThresholdConfig["thresholds"];
  package: {
    name: string;
    version: string;
    filename: string | null;
    tarballBytes: number | null;
    unpackedBytes: number;
  };
  violations: string[];
}

interface CliOptions {
  configPath: string;
  outputPath: string | null;
}

const decoder = new TextDecoder();

function parseArgs(args: string[]): CliOptions {
  let configPath = DEFAULT_CONFIG_PATH;
  let outputPath: string | null = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case "--config": {
        const value = args[i + 1];
        if (!value) {
          console.error("Missing value for --config");
          process.exit(1);
        }
        configPath = value;
        i += 1;
        break;
      }
      case "--output": {
        const value = args[i + 1];
        if (!value) {
          console.error("Missing value for --output");
          process.exit(1);
        }
        outputPath = value;
        i += 1;
        break;
      }
      default: {
        console.error(`Unknown option: ${arg}`);
        process.exit(1);
      }
    }
  }

  return { configPath, outputPath };
}

function decodeOutput(output: Uint8Array | null): string {
  if (!output) {
    return "";
  }
  return decoder.decode(output);
}

function runCommand(cmd: string[], allowFailure = false): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync({
    cmd,
    stdout: "pipe",
    stderr: "pipe"
  });

  const stdout = decodeOutput(result.stdout);
  const stderr = decodeOutput(result.stderr);

  if (result.exitCode !== 0 && !allowFailure) {
    let message = `Command failed: ${cmd.join(" ")}`;
    if (stdout.trim()) {
      message += `\nstdout:\n${stdout.trim()}`;
    }
    if (stderr.trim()) {
      message += `\nstderr:\n${stderr.trim()}`;
    }
    throw new Error(message);
  }

  return { stdout, stderr, exitCode: result.exitCode };
}

function loadThresholdConfig(configPath: string): ThresholdConfig {
  if (!fs.existsSync(configPath)) {
    console.error(`Threshold configuration file not found: ${configPath}`);
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(content) as ThresholdConfig;

    if (!config.thresholds || typeof config.thresholds.unpackedBytes !== "number") {
      throw new Error("Missing or invalid unpackedBytes threshold");
    }

    return config;
  } catch (error) {
    console.error(`Error loading threshold configuration: ${error}`);
    process.exit(1);
  }
}

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

function ensureBuildOutput(): void {
  if (!fs.existsSync(REQUIRED_DIST_ENTRY)) {
    console.error(`Build output not found: ${REQUIRED_DIST_ENTRY}`);
    console.error("Run 'bun run build' before benchmarking unpacked size.");
    process.exit(1);
  }
}

function parsePackOutput(stdout: string): {
  name: string;
  version: string;
  filename: string | null;
  tarballBytes: number | null;
  unpackedBytes: number;
} {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("npm pack returned empty output");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`Failed to parse npm pack output: ${error}`);
  }

  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error("npm pack output did not include package details");
  }

  const packResult = payload[0] as {
    name?: string;
    version?: string;
    filename?: string;
    size?: number;
    unpackedSize?: number;
  };

  if (typeof packResult.unpackedSize !== "number") {
    throw new Error("npm pack output missing unpackedSize");
  }

  return {
    name: packResult.name ?? "unknown",
    version: packResult.version ?? "unknown",
    filename: packResult.filename ?? null,
    tarballBytes: typeof packResult.size === "number" ? packResult.size : null,
    unpackedBytes: packResult.unpackedSize
  };
}

function writeReport(outputPath: string, report: BenchmarkReport): void {
  const dir = path.dirname(outputPath);
  if (dir && dir !== ".") {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
}

function runBenchmark(config: ThresholdConfig, outputPath: string | null): BenchmarkReport {
  ensureBuildOutput();

  let packFilename: string | null = null;

  try {
    runCommand(["bun", "run", "prepublishOnly"]);

    const packResult = runCommand(["npm", "pack", "--json"]);
    const packInfo = parsePackOutput(packResult.stdout);
    packFilename = packInfo.filename;

    const result = checkThreshold(packInfo.unpackedBytes, config.thresholds.unpackedBytes);
    const violations: string[] = [];

    if (!result.passed) {
      violations.push(
        `Unpacked size ${packInfo.unpackedBytes} bytes exceeds threshold ${config.thresholds.unpackedBytes} bytes`
      );
    }

    const report: BenchmarkReport = {
      timestamp: new Date().toISOString(),
      passed: result.passed,
      results: {
        unpackedSize: result
      },
      thresholds: config.thresholds,
      package: {
        name: packInfo.name,
        version: packInfo.version,
        filename: packInfo.filename,
        tarballBytes: packInfo.tarballBytes,
        unpackedBytes: packInfo.unpackedBytes
      },
      violations
    };

    if (outputPath) {
      writeReport(outputPath, report);
    }

    if (!report.passed) {
      const details =
        report.violations.length > 0
          ? `\n${report.violations.map(violation => `- ${violation}`).join("\n")}`
          : "";
      throw new Error(`NPM unpacked size benchmark failed - threshold exceeded${details}`);
    }

    console.log(
      `NPM unpacked size: ${packInfo.unpackedBytes} bytes (threshold: ${config.thresholds.unpackedBytes} bytes)`
    );

    return report;
  } finally {
    if (packFilename && fs.existsSync(packFilename)) {
      fs.unlinkSync(packFilename);
    }
    runCommand(["bun", "run", "postpublish"], true);
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const config = loadThresholdConfig(options.configPath);

  try {
    runBenchmark(config, options.outputPath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
