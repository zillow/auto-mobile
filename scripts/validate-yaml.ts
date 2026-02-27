#!/usr/bin/env bun

/**
 * Script to validate all test plan YAML files in the repository
 * Usage: bun scripts/validate-yaml.ts [path]
 * If no path is provided, validates all test plans in the repository
 */

import path from "path";
import { PlanSchemaValidator } from "../src/utils/plan/PlanSchemaValidator";

interface ValidationReport {
  totalFiles: number;
  validFiles: number;
  invalidFiles: number;
  results: Array<{
    file: string;
    valid: boolean;
    errors?: Array<{
      field: string;
      message: string;
      line?: number;
      column?: number;
    }>;
  }>;
}

async function validateTestPlans(searchPath?: string): Promise<ValidationReport> {
  const validator = new PlanSchemaValidator();
  await validator.loadSchema();

  // Find all test plan YAML files
  const pattern = searchPath || "**/test-plans/**/*.yaml";
  const isAbsolute = path.isAbsolute(pattern);
  const globber = new Bun.Glob(isAbsolute ? pattern.slice(1) : pattern);
  const files: string[] = [];
  for await (const file of globber.scan({
    cwd: isAbsolute ? "/" : process.cwd(),
    absolute: true,
    exclude: ["**/node_modules/**", "**/dist/**", "**/build/**"],
  })) {
    files.push(file);
  }

  if (files.length === 0) {
    console.error(`No YAML files found matching pattern: ${pattern}`);
    process.exit(1);
  }

  console.log(`Found ${files.length} test plan file(s) to validate\n`);

  const report: ValidationReport = {
    totalFiles: files.length,
    validFiles: 0,
    invalidFiles: 0,
    results: []
  };

  // Validate each file
  for (const file of files) {
    const relativePath = path.relative(process.cwd(), file);
    const result = await validator.validateFile(file);

    if (result.valid) {
      report.validFiles++;
      console.log(`✓ ${relativePath}`);
    } else {
      report.invalidFiles++;
      console.log(`✗ ${relativePath}`);

      if (result.errors) {
        for (const error of result.errors) {
          const location = error.line !== undefined
            ? `:${error.line}:${error.column}`
            : "";
          console.log(`  ${error.field}${location}: ${error.message}`);
        }
      }
      console.log("");
    }

    report.results.push({
      file: relativePath,
      valid: result.valid,
      errors: result.errors
    });
  }

  return report;
}

async function main() {
  const searchPath = process.argv[2];

  console.log("AutoMobile Test Plan YAML Validation");
  console.log("====================================\n");

  try {
    const report = await validateTestPlans(searchPath);

    console.log("\nValidation Summary");
    console.log("==================");
    console.log(`Total files:   ${report.totalFiles}`);
    console.log(`Valid files:   ${report.validFiles}`);
    console.log(`Invalid files: ${report.invalidFiles}`);

    if (report.invalidFiles > 0) {
      console.log("\n❌ Validation failed - see errors above");
      process.exit(1);
    } else {
      console.log("\n✅ All test plans are valid!");
      process.exit(0);
    }
  } catch (error) {
    console.error("\n❌ Validation script failed:");
    console.error(error);
    process.exit(1);
  }
}

main();
