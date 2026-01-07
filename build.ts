#!/usr/bin/env bun

/**
 * Build script using Bun's built-in TypeScript transpiler
 * Replaces the previous tsc-based build process
 */

import { cpSync, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

// Clean dist directory
const distPath = join(import.meta.dir, "dist");
if (existsSync(distPath)) {
  console.log("Cleaning dist directory...");
  rmSync(distPath, { recursive: true, force: true });
}

// Build with Bun - transpile TypeScript to JavaScript
console.log("Building with Bun...");
const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist/src",
  target: "bun",
  format: "esm",
  sourcemap: "external",
  minify: false,
  splitting: false,
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log(`✓ Built ${result.outputs.length} files`);

// Copy migrations for runtime usage (FileMigrationProvider reads from disk)
const migrationsSource = join(import.meta.dir, "src", "db", "migrations");
const migrationsDest = join(import.meta.dir, "dist", "src", "db", "migrations");
if (existsSync(migrationsSource)) {
  mkdirSync(migrationsDest, { recursive: true });
  cpSync(migrationsSource, migrationsDest, { recursive: true });
  console.log("✓ Copied database migrations");
} else {
  console.warn(`Database migrations not found at ${migrationsSource}`);
}

// Build iOS assets using the same bun executable that's running this script
console.log("Building iOS assets...");
const proc = spawnSync(Bun.which("bun") || process.execPath, ["scripts/build-ios-assets.js"], {
  stdio: "inherit",
});

if (proc.status !== 0) {
  console.error("iOS assets build failed");
  process.exit(1);
}

console.log("Build completed successfully!");
