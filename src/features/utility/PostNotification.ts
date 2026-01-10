import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { BootedDevice, PostNotificationResult } from "../../models";
import { Window } from "../observe/Window";
import { logger } from "../../utils/logger";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import path from "path";

export interface PostNotificationAction {
  label: string;
  actionId: string;
}

export interface PostNotificationOptions {
  title: string;
  body: string;
  imageType?: "normal" | "bigPicture";
  imagePath?: string;
  actions?: PostNotificationAction[];
  channelId?: string;
}

const NOTIFICATION_ACTION = "dev.jasonpearson.automobile.sdk.NOTIFICATION_POST";
const NOTIFICATION_RECEIVER = "dev.jasonpearson.automobile.sdk.notifications.AutoMobileNotificationReceiver";
const SDK_RESULT_SUCCESS = 1;
const DEVICE_IMAGE_DIR = "/sdcard/Download/automobile";

export class PostNotification {
  private device: BootedDevice;
  private adb: AdbClient;
  private window: Window;

  constructor(device: BootedDevice, adb: AdbClient | null = null, window: Window | null = null) {
    this.device = device;
    this.adb = adb || new AdbClient(device);
    this.window = window || new Window(device, this.adb);
  }

  async execute(options: PostNotificationOptions, signal?: AbortSignal): Promise<PostNotificationResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("postNotification");

    try {
      if (this.device.platform !== "android") {
        return {
          success: false,
          supported: false,
          error: "postNotification is only supported on Android devices."
        };
      }

      const imageType = options.imageType ?? "normal";

      let imagePath = options.imagePath;
      if (imageType === "bigPicture") {
        if (!imagePath) {
          return {
            success: false,
            supported: false,
            imageType,
            error: "imagePath is required for bigPicture imageType notifications."
          };
        }

        const prepared = await this.prepareDeviceImagePath(imagePath, signal);
        if (!prepared.success) {
          return {
            success: false,
            supported: false,
            imageType,
            error: prepared.error
          };
        }
        imagePath = prepared.devicePath;
      }

      const sdkResult = await this.trySdkPost(
        {
          ...options,
          imagePath
        },
        imageType,
        signal
      );
      return sdkResult;
    } catch (error) {
      return {
        success: false,
        supported: false,
        error: `Failed to post notification: ${error instanceof Error ? error.message : String(error)}`
      };
    } finally {
      perf.end();
    }
  }

  private async trySdkPost(
    options: PostNotificationOptions,
    imageType: "normal" | "bigPicture",
    signal?: AbortSignal
  ): Promise<PostNotificationResult> {
    const appId = await this.getActiveAppId();
    if (!appId) {
      return {
        success: false,
        supported: false,
        imageType,
        error: "Unable to determine the active app for SDK notifications."
      };
    }

    const style = imageType === "bigPicture" ? "bigPicture" : "default";
    const extras = this.buildBroadcastExtras(options, style);
    const component = `${appId}/${NOTIFICATION_RECEIVER}`;
    const command = `shell am broadcast -n ${component} -a ${NOTIFICATION_ACTION} ${extras.join(" ")}`.trim();

    try {
      const result = await this.adb.executeCommand(command, undefined, undefined, true, signal);
      const output = `${result.stdout}\n${result.stderr}`;

      if (this.isReceiverUnavailable(output)) {
        return {
          success: false,
          supported: false,
          imageType,
          appId,
          error: "AutoMobile notification receiver not found in the target app."
        };
      }

      const resultCode = this.parseBroadcastResultCode(output);
      if (resultCode === SDK_RESULT_SUCCESS) {
        return {
          success: true,
          supported: true,
          method: "sdk",
          imageType,
          appId,
          channelId: options.channelId
        };
      }

      return {
        success: false,
        supported: true,
        method: "sdk",
        imageType,
        appId,
        channelId: options.channelId,
        error: resultCode === null
          ? "SDK notification broadcast did not return a result code."
          : "SDK notification receiver reported a failure."
      };
    } catch (error) {
      logger.warn(`[PostNotification] SDK broadcast failed: ${error}`);
      return {
        success: false,
        supported: true,
        method: "sdk",
        imageType,
        appId,
        channelId: options.channelId,
        error: `SDK notification broadcast failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private buildBroadcastExtras(
    options: PostNotificationOptions,
    style: "default" | "bigPicture"
  ): string[] {
    const extras: string[] = [];

    extras.push(`--es ${AutoMobileNotificationExtras.title} ${quoteForShell(options.title)}`);
    extras.push(`--es ${AutoMobileNotificationExtras.body} ${quoteForShell(options.body)}`);

    if (style !== "default") {
      extras.push(`--es ${AutoMobileNotificationExtras.style} ${quoteForShell(style)}`);
    }

    if (options.imagePath) {
      extras.push(`--es ${AutoMobileNotificationExtras.imagePath} ${quoteForShell(options.imagePath)}`);
    }

    if (options.actions && options.actions.length > 0) {
      extras.push(`--es ${AutoMobileNotificationExtras.actions} ${quoteForShell(JSON.stringify(options.actions))}`);
    }

    if (options.channelId) {
      extras.push(`--es ${AutoMobileNotificationExtras.channelId} ${quoteForShell(options.channelId)}`);
    }

    return extras;
  }

  private parseBroadcastResultCode(output: string): number | null {
    const match = output.match(/Broadcast completed: result=(-?\d+)/i);
    if (!match) {
      return null;
    }
    const parsed = Number.parseInt(match[1], 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  private isReceiverUnavailable(output: string): boolean {
    const lower = output.toLowerCase();
    return (
      lower.includes("no receiver") ||
      lower.includes("no receivers") ||
      lower.includes("not found") ||
      lower.includes("does not exist") ||
      lower.includes("securityexception")
    );
  }

  private async prepareDeviceImagePath(
    imagePath: string,
    signal?: AbortSignal
  ): Promise<{ success: true; devicePath: string } | { success: false; error: string }> {
    const trimmed = imagePath.trim();
    if (trimmed.startsWith("data:") || trimmed.startsWith("base64:")) {
      return {
        success: false,
        error: "Base64 image payloads are not supported. Provide a host file path instead."
      };
    }

    const sourcePath = this.resolveHostPath(trimmed);
    if (!sourcePath) {
      return {
        success: false,
        error: "imagePath must be a valid host file path."
      };
    }

    let stats;
    try {
      stats = await fs.stat(sourcePath);
    } catch (error) {
      return {
        success: false,
        error: `Image file not found at ${sourcePath}`
      };
    }

    if (!stats.isFile()) {
      return {
        success: false,
        error: `Image path is not a file: ${sourcePath}`
      };
    }

    const fileName = path.basename(sourcePath);
    const devicePath = `${DEVICE_IMAGE_DIR}/${fileName}`;

    try {
      await this.adb.executeCommand(`shell mkdir -p ${DEVICE_IMAGE_DIR}`, undefined, undefined, true, signal);
      await this.adb.executeCommand(`push ${quoteForAdbArg(sourcePath)} ${quoteForAdbArg(devicePath)}`, undefined, undefined, true, signal);
      return { success: true, devicePath };
    } catch (error) {
      return {
        success: false,
        error: `Failed to push image to device: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private resolveHostPath(imagePath: string): string | null {
    if (imagePath.startsWith("file://")) {
      try {
        return fileURLToPath(imagePath);
      } catch (error) {
        logger.warn(`[PostNotification] Failed to parse file URL: ${error}`);
        return null;
      }
    }

    if (imagePath.startsWith("content://") || imagePath.startsWith("/sdcard")) {
      return null;
    }

    return path.resolve(imagePath);
  }

  private async getActiveAppId(): Promise<string | null> {
    try {
      const cached = await this.window.getCachedActiveWindow();
      if (cached?.appId) {
        return cached.appId;
      }

      const active = await this.window.getActive();
      return active?.appId ?? null;
    } catch (error) {
      logger.warn(`[PostNotification] Failed to read active window: ${error}`);
      return null;
    }
  }
}

const quoteForShell = (value: string): string => {
  const escaped = value.replace(/'/g, "'\\''").replace(/\r?\n/g, "\\n");
  return `'${escaped}'`;
};

const quoteForAdbArg = (value: string): string => {
  const escaped = value.replace(/\\/g, "\\\\").replace(/\"/g, "\\\"");
  return `"${escaped}"`;
};

const AutoMobileNotificationExtras = {
  title: "title",
  body: "body",
  style: "style",
  imagePath: "image_path",
  actions: "actions_json",
  channelId: "channel_id"
};
