import { spawn } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { logger } from "../utils/logger";
import { ActionableError } from "../models";
import {
  PID_FILE_PATH,
  SOCKET_PATH,
  DAEMON_STARTUP_TIMEOUT_MS,
  DAEMON_SHUTDOWN_TIMEOUT_MS,
} from "./constants";
import { DaemonStatus, PidFileData, DaemonOptions } from "./types";

/**
 * Daemon Manager
 *
 * Handles daemon lifecycle:
 * - Start daemon in background
 * - Stop daemon gracefully
 * - Check daemon status
 * - Restart daemon
 */
export class DaemonManager {
  /**
   * Start the daemon in background (detached process)
   */
  async start(options: DaemonOptions = {}): Promise<void> {
    // Check if daemon is already running
    const status = await this.status();
    if (status.running) {
      console.log(
        `Daemon already running (PID ${status.pid}, port ${status.port})`
      );
      return;
    }

    console.log("Starting AutoMobile daemon...");

    // Get the path to the current executable
    const bunExe = process.argv[0]; // "bun" executable
    const scriptPath = process.argv[1]; // Path to index.ts/js

    // Start daemon as detached process
    const args = ["--daemon-mode"];
    if (options.port) {
      args.push("--port", options.port.toString());
    }
    if (options.debug) {
      args.push("--debug");
    }
    if (options.debugPerf) {
      args.push("--debug-perf");
    }

    const daemonProcess = spawn(bunExe, [scriptPath, ...args], {
      detached: true,
      stdio: "ignore", // Don't pipe stdio
    });

    // Unref so parent process can exit
    daemonProcess.unref();

    // Wait for daemon to be ready
    const ready = await this.waitForReady(DAEMON_STARTUP_TIMEOUT_MS);
    if (!ready) {
      throw new ActionableError(
        `Daemon failed to start within ${DAEMON_STARTUP_TIMEOUT_MS}ms`
      );
    }

    const newStatus = await this.status();
    console.log(
      `Daemon started successfully (PID ${newStatus.pid}, port ${newStatus.port})`
    );
    console.log(`Socket: ${newStatus.socketPath}`);
  }

  /**
   * Stop the daemon gracefully
   */
  async stop(timeout: number = DAEMON_SHUTDOWN_TIMEOUT_MS): Promise<void> {
    const status = await this.status();

    if (!status.running) {
      console.log("Daemon is not running");
      return;
    }

    console.log(`Stopping daemon (PID ${status.pid})...`);

    const pid = status.pid!;

    try {
      // Send SIGTERM for graceful shutdown
      process.kill(pid, "SIGTERM");

      // Wait for process to exit
      const stopped = await this.waitForStop(pid, timeout);

      if (!stopped) {
        console.log(`Daemon did not stop gracefully, sending SIGKILL...`);
        process.kill(pid, "SIGKILL");

        // Wait a bit more
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Clean up stale PID file if it exists
      if (existsSync(PID_FILE_PATH)) {
        await unlink(PID_FILE_PATH);
      }

      console.log("Daemon stopped");
    } catch (error) {
      // Process doesn't exist or we don't have permission
      if (
        error instanceof Error &&
        (error.message.includes("ESRCH") || error.message.includes("EPERM"))
      ) {
        // Clean up stale PID file
        if (existsSync(PID_FILE_PATH)) {
          await unlink(PID_FILE_PATH);
        }
        console.log("Daemon was not running (cleaned up stale PID file)");
      } else {
        throw error;
      }
    }
  }

  /**
   * Check daemon status
   */
  async status(): Promise<DaemonStatus> {
    // Check if PID file exists
    if (!existsSync(PID_FILE_PATH)) {
      return { running: false };
    }

    try {
      // Read PID file
      const pidFileContent = await readFile(PID_FILE_PATH, "utf-8");
      const pidData: PidFileData = JSON.parse(pidFileContent);

      // Check if process is actually running
      const running = this.isProcessRunning(pidData.pid);

      if (!running) {
        // Clean up stale PID file
        await unlink(PID_FILE_PATH);
        return { running: false };
      }

      return {
        running: true,
        pid: pidData.pid,
        port: pidData.port,
        socketPath: pidData.socketPath,
        startedAt: pidData.startedAt,
        version: pidData.version,
      };
    } catch (error) {
      logger.warn(`Error reading PID file: ${error}`);
      return { running: false };
    }
  }

  /**
   * Restart the daemon
   */
  async restart(options: DaemonOptions = {}): Promise<void> {
    console.log("Restarting daemon...");
    await this.stop();
    // Wait a bit before starting
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.start(options);
  }

  /**
   * Wait for daemon to be ready (socket listening)
   */
  async waitForReady(timeout: number): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 100; // Poll every 100ms

    while (Date.now() - startTime < timeout) {
      // Check if socket exists
      if (existsSync(SOCKET_PATH)) {
        // Check if daemon is responding
        const status = await this.status();
        if (status.running) {
          return true;
        }
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return false;
  }

  /**
   * Wait for daemon process to stop
   */
  private async waitForStop(pid: number, timeout: number): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 100;

    while (Date.now() - startTime < timeout) {
      if (!this.isProcessRunning(pid)) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return false;
  }

  /**
   * Check if a process is running
   */
  private isProcessRunning(pid: number): boolean {
    try {
      // Sending signal 0 checks if process exists without actually sending a signal
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get daemon PID from lock file
   */
  getPid(): number | null {
    if (!existsSync(PID_FILE_PATH)) {
      return null;
    }

    try {
      const pidFileContent = require("fs").readFileSync(
        PID_FILE_PATH,
        "utf-8"
      );
      const pidData: PidFileData = JSON.parse(pidFileContent);
      return pidData.pid;
    } catch (error) {
      return null;
    }
  }
}

/**
 * Run daemon management command
 */
export async function runDaemonCommand(
  command: string,
  args: string[]
): Promise<void> {
  const manager = new DaemonManager();

  try {
    switch (command) {
      case "start": {
        const options: DaemonOptions = {};

        // Parse args
        for (let i = 0; i < args.length; i++) {
          if (args[i] === "--port") {
            options.port = parseInt(args[i + 1], 10);
            i++;
          } else if (args[i] === "--debug") {
            options.debug = true;
          } else if (args[i] === "--debug-perf") {
            options.debugPerf = true;
          }
        }

        await manager.start(options);
        break;
      }

      case "stop":
        await manager.stop();
        break;

      case "status": {
        const status = await manager.status();
        if (status.running) {
          console.log("Daemon is running");
          console.log(`  PID: ${status.pid}`);
          console.log(`  Port: ${status.port}`);
          console.log(`  Socket: ${status.socketPath}`);
          console.log(`  Version: ${status.version || "unknown"}`);
          console.log(
            `  Started: ${status.startedAt ? new Date(status.startedAt).toISOString() : "unknown"}`
          );
        } else {
          console.log("Daemon is not running");
        }
        break;
      }

      case "restart": {
        const options: DaemonOptions = {};

        // Parse args (same as start)
        for (let i = 0; i < args.length; i++) {
          if (args[i] === "--port") {
            options.port = parseInt(args[i + 1], 10);
            i++;
          } else if (args[i] === "--debug") {
            options.debug = true;
          } else if (args[i] === "--debug-perf") {
            options.debugPerf = true;
          }
        }

        await manager.restart(options);
        break;
      }

      default:
        console.error(`Unknown daemon command: ${command}`);
        console.log("\nAvailable commands:");
        console.log("  start     Start the daemon");
        console.log("  stop      Stop the daemon");
        console.log("  status    Check daemon status");
        console.log("  restart   Restart the daemon");
        process.exit(1);
    }
  } catch (error) {
    if (error instanceof ActionableError) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error(`Unexpected error: ${error}`);
    }
    process.exit(1);
  }
}
