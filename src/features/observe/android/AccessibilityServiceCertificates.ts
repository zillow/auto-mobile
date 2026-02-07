/**
 * AccessibilityServiceCertificates - Delegate for CA certificate and permission operations.
 *
 * This delegate handles CA certificate installation/removal (device owner only),
 * device owner status queries, and permission requests.
 */

import WebSocket from "ws";
import fs from "fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../../../utils/logger";
import type { PerformanceTracker } from "../../../utils/PerformanceTracker";
import { NoOpPerformanceTracker } from "../../../utils/PerformanceTracker";
import type {
  CertificatesDelegateContext,
  A11yCaCertResult,
  A11yDeviceOwnerStatusResult,
  A11yPermissionResult,
} from "./types";
import { generateSecureId, quoteForAdbArg } from "./types";

/** Directory on device for pushing certificate files */
const DEVICE_CERT_DIR = "/sdcard/Download/automobile/ca_certs";

/**
 * Delegate class for handling CA certificate and permission operations.
 */
export class AccessibilityServiceCertificates {
  private readonly context: CertificatesDelegateContext;

  // Legacy pending request state for CA cert removal (still uses manual promise pattern)
  private pendingCaCertRequestId: string | null = null;
  private pendingCaCertResolve: ((result: A11yCaCertResult) => void) | null = null;

  constructor(context: CertificatesDelegateContext) {
    this.context = context;
  }

  /**
   * Request installation of a CA certificate via the accessibility service.
   * The certificate payload can be PEM or base64-encoded DER.
   */
  async requestInstallCaCertificate(
    certificate: string,
    timeoutMs: number = 10000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yCaCertResult> {
    const startTime = this.context.timer.now();
    const trimmed = certificate.trim();

    if (!trimmed) {
      return {
        success: false,
        action: "install",
        totalTimeMs: this.context.timer.now() - startTime,
        error: "Certificate payload is required"
      };
    }

    try {
      const connected = await perf.track("ensureConnection", () => this.context.ensureConnected(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for CA cert install");
        return {
          success: false,
          action: "install",
          totalTimeMs: this.context.timer.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      const requestId = this.context.requestManager.generateId("caCertInstall");

      // Register request with automatic timeout handling
      const caCertPromise = this.context.requestManager.register<A11yCaCertResult>(
        requestId,
        "caCertInstall",
        timeoutMs,
        (_id, _type, timeout) => ({
          success: false,
          action: "install",
          totalTimeMs: this.context.timer.now() - startTime,
          error: `CA cert install timeout after ${timeout}ms`
        })
      );

      await perf.track("sendRequest", async () => {
        const ws = this.context.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({
          type: "install_ca_cert",
          requestId,
          certificate: trimmed
        });
        ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent CA cert install request (requestId: ${requestId})`);
      });

      const result = await perf.track("waitForCaCertInstall", () => caCertPromise);
      const clientDuration = this.context.timer.now() - startTime;

      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] CA cert install completed: clientTime=${clientDuration}ms, deviceTotalTime=${result.totalTimeMs}ms, alias=${result.alias ?? "unknown"}`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] CA cert install failed after ${clientDuration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = this.context.timer.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] CA cert install request failed after ${duration}ms: ${error}`);
      return {
        success: false,
        action: "install",
        totalTimeMs: duration,
        error: `${error}`
      };
    }
  }

  /**
   * Request installation of a CA certificate from a host file path.
   * Pushes the file to the device before requesting installation.
   */
  async requestInstallCaCertificateFromFile(
    certificatePath: string,
    timeoutMs: number = 10000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yCaCertResult> {
    const startTime = this.context.timer.now();
    const resolvedPath = this.resolveCertificatePath(certificatePath);

    if (!resolvedPath) {
      return {
        success: false,
        action: "install",
        totalTimeMs: this.context.timer.now() - startTime,
        error: "certificatePath must be a valid host file path"
      };
    }

    try {
      const stats = await fs.stat(resolvedPath);
      if (!stats.isFile()) {
        return {
          success: false,
          action: "install",
          totalTimeMs: this.context.timer.now() - startTime,
          error: `Certificate path is not a file: ${resolvedPath}`
        };
      }

      if (stats.size === 0) {
        return {
          success: false,
          action: "install",
          totalTimeMs: this.context.timer.now() - startTime,
          error: `Certificate file is empty: ${resolvedPath}`
        };
      }

      const devicePath = await perf.track("pushCertificate", async () => {
        return this.pushCertificateToDevice(resolvedPath);
      });

      const connected = await perf.track("ensureConnection", () => this.context.ensureConnected(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for CA cert install");
        return {
          success: false,
          action: "install",
          totalTimeMs: this.context.timer.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      const requestId = this.context.requestManager.generateId("caCertInstallFromPath");

      // Register request with automatic timeout handling
      const caCertPromise = this.context.requestManager.register<A11yCaCertResult>(
        requestId,
        "caCertInstallFromPath",
        timeoutMs,
        (_id, _type, timeout) => ({
          success: false,
          action: "install",
          totalTimeMs: this.context.timer.now() - startTime,
          error: `CA cert install timeout after ${timeout}ms`
        })
      );

      await perf.track("sendRequest", async () => {
        const ws = this.context.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({
          type: "install_ca_cert_from_path",
          requestId,
          devicePath
        });
        ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent CA cert install request (requestId: ${requestId}, devicePath: ${devicePath})`);
      });

      const result = await perf.track("waitForCaCertInstall", () => caCertPromise);
      const clientDuration = this.context.timer.now() - startTime;

      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] CA cert install completed: clientTime=${clientDuration}ms, deviceTotalTime=${result.totalTimeMs}ms, alias=${result.alias ?? "unknown"}`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] CA cert install failed after ${clientDuration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        action: "install",
        totalTimeMs: this.context.timer.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Request removal of a CA certificate via the accessibility service.
   * Uses the alias returned from installation.
   */
  async requestRemoveCaCertificate(
    alias: string,
    timeoutMs: number = 10000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yCaCertResult> {
    const startTime = this.context.timer.now();
    const trimmedAlias = alias.trim();

    if (!trimmedAlias) {
      return {
        success: false,
        action: "remove",
        totalTimeMs: this.context.timer.now() - startTime,
        error: "Certificate alias is required"
      };
    }

    try {
      const connected = await perf.track("ensureConnection", () => this.context.ensureConnected(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for CA cert removal");
        return {
          success: false,
          action: "remove",
          totalTimeMs: this.context.timer.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      const requestId = `ca_cert_remove_${this.context.timer.now()}_${generateSecureId()}`;
      this.pendingCaCertRequestId = requestId;

      const caCertPromise = new Promise<A11yCaCertResult>(resolve => {
        this.pendingCaCertResolve = resolve;

        this.context.timer.setTimeout(() => {
          if (this.pendingCaCertResolve === resolve) {
            this.pendingCaCertResolve = null;
            this.pendingCaCertRequestId = null;
            resolve({
              success: false,
              action: "remove",
              totalTimeMs: this.context.timer.now() - startTime,
              error: `CA cert removal timeout after ${timeoutMs}ms`
            });
          }
        }, timeoutMs);
      });

      await perf.track("sendRequest", async () => {
        const ws = this.context.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({
          type: "remove_ca_cert",
          requestId,
          alias: trimmedAlias
        });
        ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent CA cert removal request (requestId: ${requestId}, alias: ${trimmedAlias})`);
      });

      const result = await perf.track("waitForCaCertRemoval", () => caCertPromise);
      const clientDuration = this.context.timer.now() - startTime;

      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] CA cert removal completed: clientTime=${clientDuration}ms, deviceTotalTime=${result.totalTimeMs}ms, alias=${result.alias ?? trimmedAlias}`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] CA cert removal failed after ${clientDuration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = this.context.timer.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] CA cert removal request failed after ${duration}ms: ${error}`);
      return {
        success: false,
        action: "remove",
        totalTimeMs: duration,
        error: `${error}`
      };
    }
  }

  /**
   * Request device owner status via the accessibility service.
   */
  async requestDeviceOwnerStatus(
    timeoutMs: number = 5000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yDeviceOwnerStatusResult> {
    const startTime = this.context.timer.now();

    try {
      const connected = await perf.track("ensureConnection", () => this.context.ensureConnected(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for device owner status");
        return {
          success: false,
          isDeviceOwner: false,
          isAdminActive: false,
          totalTimeMs: this.context.timer.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      const requestId = this.context.requestManager.generateId("deviceOwnerStatus");

      // Register request with automatic timeout handling
      const statusPromise = this.context.requestManager.register<A11yDeviceOwnerStatusResult>(
        requestId,
        "deviceOwnerStatus",
        timeoutMs,
        (_id, _type, timeout) => ({
          success: false,
          isDeviceOwner: false,
          isAdminActive: false,
          totalTimeMs: this.context.timer.now() - startTime,
          error: `Device owner status timeout after ${timeout}ms`
        })
      );

      await perf.track("sendRequest", async () => {
        const ws = this.context.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({
          type: "get_device_owner_status",
          requestId
        });
        ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent device owner status request (requestId: ${requestId})`);
      });

      const result = await perf.track("waitForDeviceOwnerStatus", () => statusPromise);
      const clientDuration = this.context.timer.now() - startTime;

      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] Device owner status received: clientTime=${clientDuration}ms, deviceTotalTime=${result.totalTimeMs}ms, owner=${result.isDeviceOwner}, admin=${result.isAdminActive}`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] Device owner status failed after ${clientDuration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = this.context.timer.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Device owner status request failed after ${duration}ms: ${error}`);
      return {
        success: false,
        isDeviceOwner: false,
        isAdminActive: false,
        totalTimeMs: duration,
        error: `${error}`
      };
    }
  }

  /**
   * Request permission status via the accessibility service.
   */
  async requestPermission(
    permission: string,
    requestPermission: boolean = true,
    timeoutMs: number = 5000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yPermissionResult> {
    const startTime = this.context.timer.now();
    const trimmedPermission = permission.trim();

    if (!trimmedPermission) {
      return {
        success: false,
        permission: "unknown",
        granted: false,
        totalTimeMs: this.context.timer.now() - startTime,
        requestLaunched: false,
        canRequest: false,
        requiresSettings: false,
        error: "Permission name is required"
      };
    }

    try {
      const connected = await perf.track("ensureConnection", () => this.context.ensureConnected(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for permission request");
        return {
          success: false,
          permission: trimmedPermission,
          granted: false,
          totalTimeMs: this.context.timer.now() - startTime,
          requestLaunched: false,
          canRequest: false,
          requiresSettings: false,
          error: "Failed to connect to accessibility service"
        };
      }

      const requestId = this.context.requestManager.generateId("permission");

      // Register request with automatic timeout handling
      const permissionPromise = this.context.requestManager.register<A11yPermissionResult>(
        requestId,
        "permission",
        timeoutMs,
        (_id, _type, timeout) => ({
          success: false,
          permission: trimmedPermission,
          granted: false,
          totalTimeMs: this.context.timer.now() - startTime,
          requestLaunched: false,
          canRequest: false,
          requiresSettings: false,
          error: `Permission request timeout after ${timeout}ms`
        })
      );

      await perf.track("sendRequest", async () => {
        const ws = this.context.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({
          type: "get_permission",
          requestId,
          permission: trimmedPermission,
          requestPermission
        });
        ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent permission request (requestId: ${requestId}, permission: ${trimmedPermission})`);
      });

      const result = await perf.track("waitForPermission", () => permissionPromise);
      const clientDuration = this.context.timer.now() - startTime;

      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] Permission status received: clientTime=${clientDuration}ms, deviceTotalTime=${result.totalTimeMs}ms, permission=${result.permission}, granted=${result.granted}`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] Permission request failed after ${clientDuration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = this.context.timer.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Permission request failed after ${duration}ms: ${error}`);
      return {
        success: false,
        permission: trimmedPermission,
        granted: false,
        totalTimeMs: duration,
        requestLaunched: false,
        canRequest: false,
        requiresSettings: false,
        error: `${error}`
      };
    }
  }

  /**
   * Handle CA cert removal result from WebSocket message.
   * This is called by the main client when a ca_cert_result with remove action is received.
   */
  handleCaCertRemovalResult(requestId: string, result: A11yCaCertResult): boolean {
    if (this.pendingCaCertRequestId === requestId && this.pendingCaCertResolve) {
      const resolve = this.pendingCaCertResolve;
      this.pendingCaCertResolve = null;
      this.pendingCaCertRequestId = null;
      resolve(result);
      return true;
    }
    return false;
  }

  /**
   * Resolve a certificate path from various formats to an absolute host path.
   */
  private resolveCertificatePath(certificatePath: string): string | null {
    const trimmedPath = certificatePath.trim();
    if (!trimmedPath) {
      return null;
    }

    if (trimmedPath.startsWith("file://")) {
      try {
        return fileURLToPath(trimmedPath);
      } catch (error) {
        logger.warn(`[ACCESSIBILITY_SERVICE] Failed to parse certificate file URL: ${error}`);
        return null;
      }
    }

    if (trimmedPath.startsWith("content://") || trimmedPath.startsWith("/sdcard")) {
      return null;
    }

    return path.resolve(trimmedPath);
  }

  /**
   * Push a certificate file to the device.
   */
  private async pushCertificateToDevice(sourcePath: string): Promise<string> {
    await this.context.adb.executeCommand(`shell mkdir -p ${DEVICE_CERT_DIR}`, undefined, undefined, true);

    const devicePath = this.buildDeviceCertificatePath(sourcePath);
    await this.context.adb.executeCommand(
      `push ${quoteForAdbArg(sourcePath)} ${quoteForAdbArg(devicePath)}`,
      undefined,
      undefined,
      true
    );

    return devicePath;
  }

  /**
   * Build a unique device path for a certificate file.
   */
  private buildDeviceCertificatePath(sourcePath: string): string {
    const ext = path.extname(sourcePath) || ".crt";
    const base = path.basename(sourcePath, ext);
    const fileName = `${base}_${this.context.timer.now()}_${generateSecureId()}${ext}`;
    return `${DEVICE_CERT_DIR}/${fileName}`;
  }
}
