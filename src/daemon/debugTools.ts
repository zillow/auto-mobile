import { existsSync } from "node:fs";
import { SOCKET_PATH, PID_FILE_PATH } from "./constants";
import { DaemonClient } from "./client";
import { readFile } from "node:fs/promises";
import { PidFileData } from "./types";
import { Timer, defaultTimer } from "../utils/SystemTimer";

/**
 * Daemon Debug Tools
 *
 * Provides diagnostic capabilities for troubleshooting daemon issues
 */

export interface DaemonHealthReport {
  timestamp: string;
  daemonRunning: boolean;
  socketExists: boolean;
  socketAccessible: boolean;
  pidFileExists: boolean;
  pidFileValid: boolean;
  daemonPid?: number;
  daemonPort?: number;
  daemonUptime?: number;
  socketConnectable: boolean;
  lastError?: string;
  recommendations: string[];
}

/**
 * Get comprehensive daemon health report
 */
export async function getDaemonHealthReport(timer: Timer = defaultTimer): Promise<DaemonHealthReport> {
  const report: DaemonHealthReport = {
    timestamp: new Date().toISOString(),
    daemonRunning: false,
    socketExists: false,
    socketAccessible: false,
    pidFileExists: false,
    pidFileValid: false,
    socketConnectable: false,
    recommendations: [],
  };

  // Check socket file
  report.socketExists = existsSync(SOCKET_PATH);
  if (!report.socketExists) {
    report.recommendations.push("Socket file not found. Daemon may not be running.");
  } else {
    report.socketAccessible = true; // If it exists and we can read it, we assume accessible
  }

  // Check PID file
  report.pidFileExists = existsSync(PID_FILE_PATH);
  if (!report.pidFileExists) {
    if (report.socketExists) {
      report.recommendations.push("Socket exists but PID file missing. Daemon may be in bad state.");
    }
  } else {
    try {
      const pidContent = await readFile(PID_FILE_PATH, "utf-8");
      const pidData: PidFileData = JSON.parse(pidContent);
      report.pidFileValid = true;
      report.daemonPid = pidData.pid;
      report.daemonPort = pidData.port;

      // Check if process is actually running
      try {
        process.kill(pidData.pid, 0); // Check if process exists
        report.daemonRunning = true;

        // Calculate uptime
        if (pidData.startedAt) {
          report.daemonUptime = timer.now() - new Date(pidData.startedAt).getTime();
        }
      } catch (error) {
        report.recommendations.push(
          `PID file references process ${pidData.pid} which is not running. ` +
          `Daemon may have crashed. Stale PID file should be cleaned up.`
        );
      }
    } catch (error) {
      report.recommendations.push(`PID file exists but is invalid or unreadable: ${error}`);
    }
  }

  // Try to connect to socket to verify daemon responsiveness
  if (report.socketExists && report.daemonRunning) {
    try {
      const available = await DaemonClient.isAvailable(SOCKET_PATH);
      report.socketConnectable = available;
      if (!available) {
        report.recommendations.push(
          "Socket file exists and process is running, but socket is not responding. " +
          "Daemon may be stuck or unresponsive."
        );
      }
    } catch (error) {
      report.lastError = error instanceof Error ? error.message : String(error);
      report.recommendations.push(
        "Socket connection test failed. Daemon may be unresponsive or socket may be corrupted."
      );
    }
  }

  // Generate recommendations
  if (report.recommendations.length === 0) {
    if (report.daemonRunning && report.socketConnectable) {
      report.recommendations.push("Daemon is healthy and responsive.");
    } else if (!report.daemonRunning && !report.socketExists && !report.pidFileExists) {
      report.recommendations.push("Daemon is not running. Start it with: bunx @kaeawc/auto-mobile@latest --daemon start");
    }
  }

  return report;
}

/**
 * Format health report as human-readable string
 */
export function formatHealthReport(report: DaemonHealthReport): string {
  const lines: string[] = [
    "\n=== AutoMobile Daemon Health Report ===",
    `Timestamp: ${report.timestamp}`,
    "",
    "Status Summary:",
    `  Daemon Running:     ${report.daemonRunning ? "✓ YES" : "✗ NO"}`,
    `  Socket File:        ${report.socketExists ? "✓ EXISTS" : "✗ MISSING"}`,
    `  Socket Accessible:  ${report.socketAccessible ? "✓ YES" : "✗ NO"}`,
    `  PID File:           ${report.pidFileExists ? "✓ EXISTS" : "✗ MISSING"}`,
    `  Socket Connectable: ${report.socketConnectable ? "✓ YES" : "✗ NO"}`,
    "",
    "Details:",
  ];

  if (report.daemonPid) {
    lines.push(`  Daemon PID:  ${report.daemonPid}`);
  }
  if (report.daemonPort) {
    lines.push(`  HTTP Port:   ${report.daemonPort}`);
  }
  if (report.daemonUptime) {
    const seconds = Math.floor(report.daemonUptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      lines.push(`  Uptime:      ${hours}h ${minutes % 60}m ${seconds % 60}s`);
    } else if (minutes > 0) {
      lines.push(`  Uptime:      ${minutes}m ${seconds % 60}s`);
    } else {
      lines.push(`  Uptime:      ${seconds}s`);
    }
  }
  if (report.lastError) {
    lines.push(`  Last Error:  ${report.lastError}`);
  }

  lines.push("", "Recommendations:");
  report.recommendations.forEach(rec => {
    lines.push(`  • ${rec}`);
  });

  lines.push("", "File Locations:");
  lines.push(`  Socket: ${SOCKET_PATH}`);
  lines.push(`  PID:    ${PID_FILE_PATH}`);
  lines.push("", "=== End Report ===\n");

  return lines.join("\n");
}

/**
 * Get daemon statistics and connection info
 */
export interface DaemonStats {
  pid: number;
  port: number;
  uptime: number;
  memoryUsage?: {
    rss: number; // Resident Set Size
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  timestamp: string;
}

/**
 * Check socket diagnostic info
 */
export interface SocketDiagnostics {
  socketExists: boolean;
  socketReadable: boolean;
  socketWritable: boolean;
  socketConnectable: boolean;
  connectionLatency?: number;
  lastTestTime: string;
  issues: string[];
}

/**
 * Run socket diagnostics
 */
export async function runSocketDiagnostics(timer: Timer = defaultTimer): Promise<SocketDiagnostics> {
  const diagnostics: SocketDiagnostics = {
    socketExists: existsSync(SOCKET_PATH),
    socketReadable: false,
    socketWritable: false,
    socketConnectable: false,
    issues: [],
    lastTestTime: new Date().toISOString(),
  };

  if (!diagnostics.socketExists) {
    diagnostics.issues.push("Socket file does not exist");
    return diagnostics;
  }

  // Try to get file stats to check read/write permissions
  try {
    await (await import("node:fs/promises")).stat(SOCKET_PATH);
    diagnostics.socketReadable = true;
    diagnostics.socketWritable = true;
  } catch (error) {
    diagnostics.issues.push(`Cannot access socket file: ${error}`);
    return diagnostics;
  }

  // Try to connect
  try {
    const startTime = timer.now();
    const available = await DaemonClient.isAvailable(SOCKET_PATH);
    const latency = timer.now() - startTime;

    if (available) {
      diagnostics.socketConnectable = true;
      diagnostics.connectionLatency = latency;
    } else {
      diagnostics.issues.push("Socket connection test returned false");
    }
  } catch (error) {
    diagnostics.issues.push(`Connection failed: ${error}`);
  }

  return diagnostics;
}

/**
 * Format socket diagnostics as human-readable string
 */
export function formatSocketDiagnostics(diag: SocketDiagnostics): string {
  const lines: string[] = [
    "\n=== Socket Diagnostics ===",
    `Test Time: ${diag.lastTestTime}`,
    "",
    "Results:",
    `  Socket Exists:      ${diag.socketExists ? "✓" : "✗"}`,
    `  Socket Readable:    ${diag.socketReadable ? "✓" : "✗"}`,
    `  Socket Writable:    ${diag.socketWritable ? "✓" : "✗"}`,
    `  Socket Connectable: ${diag.socketConnectable ? "✓" : "✗"}`,
  ];

  if (diag.connectionLatency !== undefined) {
    lines.push(`  Connection Latency: ${diag.connectionLatency}ms`);
  }

  if (diag.issues.length > 0) {
    lines.push("", "Issues Found:");
    diag.issues.forEach(issue => {
      lines.push(`  ⚠ ${issue}`);
    });
  }

  lines.push("", "Socket Path:", `  ${SOCKET_PATH}`);
  lines.push("", "=== End Diagnostics ===\n");

  return lines.join("\n");
}
