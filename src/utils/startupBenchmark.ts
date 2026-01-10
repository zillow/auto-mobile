import { performance } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";

export const STARTUP_BENCHMARK_PREFIX = "STARTUP_BENCHMARK";

export interface StartupBenchmarkReport {
  type: string;
  timestamp: string;
  pid: number;
  label?: string;
  marks: Record<string, number>;
  phases: Record<string, number>;
  memoryUsage: NodeJS.MemoryUsage;
  meta: Record<string, unknown>;
}

const envEnabledRaw =
  process.env.AUTOMOBILE_STARTUP_BENCHMARK ??
  process.env.AUTO_MOBILE_STARTUP_BENCHMARK ??
  "";

const envEnabled = envEnabledRaw.toLowerCase();
const enabled =
  process.argv.includes("--startup-benchmark") ||
  envEnabled === "1" ||
  envEnabled === "true" ||
  envEnabled === "yes";

const outputPath =
  process.env.AUTOMOBILE_STARTUP_BENCHMARK_OUTPUT ??
  process.env.AUTO_MOBILE_STARTUP_BENCHMARK_OUTPUT;

const label =
  process.env.AUTOMOBILE_STARTUP_BENCHMARK_LABEL ??
  process.env.AUTO_MOBILE_STARTUP_BENCHMARK_LABEL;

class StartupBenchmark {
  private marks = new Map<string, number>();
  private phaseStarts = new Map<string, number>();
  private phases = new Map<string, number>();
  private emitted = false;
  private readonly enabled: boolean;

  constructor(isEnabled: boolean) {
    this.enabled = isEnabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  mark(name: string): void {
    if (!this.enabled || this.marks.has(name)) {
      return;
    }
    this.marks.set(name, performance.now());
  }

  startPhase(name: string): void {
    if (!this.enabled || this.phases.has(name) || this.phaseStarts.has(name)) {
      return;
    }
    this.phaseStarts.set(name, performance.now());
  }

  endPhase(name: string): void {
    if (!this.enabled || this.phases.has(name)) {
      return;
    }
    const start = this.phaseStarts.get(name);
    if (start === undefined) {
      return;
    }
    this.phases.set(name, performance.now() - start);
  }

  recordPhase(name: string, durationMs: number): void {
    if (!this.enabled || this.phases.has(name)) {
      return;
    }
    this.phases.set(name, durationMs);
  }

  emit(type: string, meta: Record<string, unknown> = {}): void {
    if (!this.enabled || this.emitted) {
      return;
    }
    this.emitted = true;

    const marks = Object.fromEntries(this.marks.entries());
    const phases = Object.fromEntries(this.phases.entries());

    if (marks.processEntry !== undefined && phases.moduleImports === undefined) {
      phases.moduleImports = marks.processEntry;
    }

    const report: StartupBenchmarkReport = {
      type,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      label,
      marks,
      phases,
      memoryUsage: process.memoryUsage(),
      meta
    };

    const payload = JSON.stringify(report);

    if (outputPath) {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(outputPath, payload, "utf-8");
    }

    process.stderr.write(`${STARTUP_BENCHMARK_PREFIX} ${payload}\n`);
  }
}

export const startupBenchmark = new StartupBenchmark(enabled);

export const isStartupBenchmarkEnabled = (): boolean => startupBenchmark.isEnabled();
