import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { SimCtlClient, AppleDevice } from "../../utils/ios-cmdline-tools/SimCtlClient";
import { logger } from "../../utils/logger";
import { DemoModeResult } from "../../models/DemoModeResult";
import { BaseVisualChange } from "../action/BaseVisualChange";
import { BootedDevice, ExecResult } from "../../models";

export interface DemoModeOptions {
  time?: string; // In format "HHMM", default "1000"
  batteryLevel?: number; // 0-100, default 100
  batteryPlugged?: boolean; // default false
  wifiLevel?: number; // 0-4, default 4
  mobileDataType?: "4g" | "5g" | "lte" | "3g" | "edge" | "none"; // default 4g
  mobileSignalLevel?: number; // 0-4, default 4
  hideNotifications?: boolean; // default true
}

interface DemoModeSimctl {
  executeCommand(command: string, timeoutMs?: number): Promise<ExecResult>;
  isAvailable(): Promise<boolean>;
  getDeviceInfo(udid: string): Promise<AppleDevice | null>;
}

export class DemoMode extends BaseVisualChange {
  private simctl: DemoModeSimctl | null;

  constructor(device: BootedDevice, adb: AdbClient | null = null, simctl: DemoModeSimctl | null = null) {
    super(device, adb);
    this.simctl = simctl ?? (device.platform === "ios" ? new SimCtlClient(device) : null);
  }

  /**
   * Setup demo mode on the Android device
   * @param options - Optional demo mode configuration
   * @returns Promise with result indicating success or failure
   */
  async execute(options: DemoModeOptions = {}): Promise<DemoModeResult> {
    if (this.device.platform === "ios") {
      return this.executeIos(options);
    }

    const {
      time = "1000",
      batteryLevel = 100,
      batteryPlugged = false,
      wifiLevel = 4,
      mobileDataType = "4g",
      mobileSignalLevel = 4,
      hideNotifications = true,
    } = options;

    try {
      // Get current package name from active window
      const activeWindow = await this.window.getActive(true);
      logger.info("Setting up Android demo mode for current app:", activeWindow.appId);

      // Allow demo mode
      await this.adb.executeCommand("shell settings put global sysui_demo_allowed 1");

      // Enter demo mode
      await this.adb.executeCommand("shell am broadcast -a com.android.systemui.demo -e command enter");

      // Set battery status
      await this.adb.executeCommand(
        `shell am broadcast -a com.android.systemui.demo -e command battery -e plugged ${
          batteryPlugged ? "true" : "false"
        } -e level ${batteryLevel}`
      );

      // Set clock time
      await this.adb.executeCommand(
        `shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm ${time}`
      );

      // Handle notifications
      if (hideNotifications) {
        await this.adb.executeCommand(
          "shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false"
        );
      }

      // Set network status
      await this.adb.executeCommand(
        `shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level ${wifiLevel} -e mobile show -e datatype ${mobileDataType} -e level ${mobileSignalLevel}`
      );

      logger.info("Demo mode setup completed successfully");
      return {
        success: true,
        message: "Demo mode enabled successfully",
        demoModeEnabled: true,
        packageName: activeWindow.appId,
        activityName: activeWindow.activityName
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("Failed to set up demo mode:", err);
      return {
        success: false,
        error: `Failed to set up demo mode: ${errorMessage}`,
        demoModeEnabled: false
      };
    }
  }

  /**
   * Exit demo mode on the Android device
   * @returns Promise with result indicating success or failure
   */
  async exitDemoMode(): Promise<DemoModeResult> {
    if (this.device.platform === "ios") {
      return this.exitIosDemoMode();
    }

    try {
      // Get current package name from active window
      const activeWindow = await this.window.getActive(true);
      logger.info("Exiting Android demo mode for current app:", activeWindow.appId);

      await this.adb.executeCommand("shell am broadcast -a com.android.systemui.demo -e command exit");

      logger.info("Successfully exited demo mode");
      return {
        success: true,
        message: "Demo mode disabled successfully",
        demoModeEnabled: false,
        packageName: activeWindow.appId,
        activityName: activeWindow.activityName
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("Failed to exit demo mode:", err);
      return {
        success: false,
        error: `Failed to exit demo mode: ${errorMessage}`,
        demoModeEnabled: true
      };
    }
  }

  private async executeIos(options: DemoModeOptions): Promise<DemoModeResult> {
    if (!this.simctl) {
      logger.warn("iOS demo mode requires simctl, but no simctl client was available.");
      return {
        success: false,
        error: "simctl is not available. iOS demo mode is supported on simulators only.",
        demoModeEnabled: false
      };
    }

    const available = await this.simctl.isAvailable();
    if (!available) {
      logger.warn("simctl is not available - iOS demo mode requires Xcode command line tools.");
      return {
        success: false,
        error: "simctl is not available. Please install Xcode command line tools.",
        demoModeEnabled: false
      };
    }

    const deviceInfo = await this.simctl.getDeviceInfo(this.device.deviceId);
    if (!deviceInfo || deviceInfo.state !== "Booted") {
      logger.warn(`iOS demo mode requested for non-booted simulator ${this.device.deviceId}.`);
      return {
        success: false,
        error: "iOS demo mode is supported on booted simulators only.",
        demoModeEnabled: false
      };
    }

    const {
      time = "1000",
      batteryLevel = 100,
      batteryPlugged = false,
      wifiLevel = 4,
      mobileDataType = "4g",
      mobileSignalLevel = 4,
      hideNotifications = true,
    } = options;

    if (hideNotifications) {
      logger.warn("iOS simctl status bar overrides do not support hiding notifications.");
    }

    const args: string[] = [];
    const normalizedTime = this.normalizeIosTime(time);
    if (normalizedTime) {
      args.push(`--time ${normalizedTime}`);
    } else {
      logger.warn(`Invalid time format for iOS demo mode: '${time}'. Expected HHMM or HH:MM.`);
    }

    const dataNetwork = this.mapIosDataNetwork(mobileDataType);
    if (dataNetwork.warning) {
      logger.warn(dataNetwork.warning);
    }
    if (dataNetwork.value) {
      args.push(`--dataNetwork ${dataNetwork.value}`);
    }

    const wifiBars = this.clamp(wifiLevel, 0, 3);
    args.push(`--wifiMode ${wifiBars > 0 ? "active" : "failed"}`);
    args.push(`--wifiBars ${wifiBars}`);

    const cellularBars = this.clamp(mobileSignalLevel, 0, 4);
    const cellularMode = dataNetwork.value === "hide" ? "notSupported" : (cellularBars > 0 ? "active" : "failed");
    args.push(`--cellularMode ${cellularMode}`);
    args.push(`--cellularBars ${cellularBars}`);

    const batteryState = batteryPlugged ? "charging" : "discharging";
    args.push(`--batteryState ${batteryState}`);
    args.push(`--batteryLevel ${this.clamp(batteryLevel, 0, 100)}`);

    try {
      if (args.length === 0) {
        logger.warn("No iOS demo mode overrides were provided; skipping simctl status_bar override.");
        return {
          success: false,
          error: "No valid status bar overrides were provided.",
          demoModeEnabled: false
        };
      }

      const command = `status_bar ${this.device.deviceId} override ${args.join(" ")}`;
      logger.info(`Setting up iOS demo mode for simulator ${this.device.deviceId}`);
      await this.simctl.executeCommand(command);

      return {
        success: true,
        message: "Demo mode enabled successfully",
        demoModeEnabled: true
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (/status_bar/i.test(errorMessage) || /unrecognized subcommand/i.test(errorMessage)) {
        logger.warn("simctl status_bar overrides are not supported by this Xcode installation.");
      } else {
        logger.warn(`Failed to set iOS demo mode overrides: ${errorMessage}`);
      }
      return {
        success: false,
        error: `Failed to set iOS demo mode: ${errorMessage}`,
        demoModeEnabled: false
      };
    }
  }

  private async exitIosDemoMode(): Promise<DemoModeResult> {
    if (!this.simctl) {
      logger.warn("iOS demo mode reset requires simctl, but no simctl client was available.");
      return {
        success: false,
        error: "simctl is not available. iOS demo mode is supported on simulators only.",
        demoModeEnabled: true
      };
    }

    const available = await this.simctl.isAvailable();
    if (!available) {
      logger.warn("simctl is not available - iOS demo mode reset requires Xcode command line tools.");
      return {
        success: false,
        error: "simctl is not available. Please install Xcode command line tools.",
        demoModeEnabled: true
      };
    }

    try {
      const command = `status_bar ${this.device.deviceId} clear`;
      logger.info(`Clearing iOS demo mode for simulator ${this.device.deviceId}`);
      await this.simctl.executeCommand(command);

      return {
        success: true,
        message: "Demo mode disabled successfully",
        demoModeEnabled: false
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (/status_bar/i.test(errorMessage) || /unrecognized subcommand/i.test(errorMessage)) {
        logger.warn("simctl status_bar overrides are not supported by this Xcode installation.");
      } else {
        logger.warn(`Failed to clear iOS demo mode overrides: ${errorMessage}`);
      }
      return {
        success: false,
        error: `Failed to clear iOS demo mode: ${errorMessage}`,
        demoModeEnabled: true
      };
    }
  }

  private normalizeIosTime(value: string | undefined): string | null {
    const trimmed = value?.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.includes(":")) {
      return trimmed;
    }

    if (/^\d{4}$/.test(trimmed)) {
      return `${trimmed.slice(0, 2)}:${trimmed.slice(2)}`;
    }

    if (/^\d{3}$/.test(trimmed)) {
      return `${trimmed.slice(0, 1)}:${trimmed.slice(1)}`;
    }

    return null;
  }

  private mapIosDataNetwork(value: DemoModeOptions["mobileDataType"]): { value: string | null; warning?: string } {
    switch (value) {
      case "4g":
      case "5g":
      case "lte":
      case "3g":
        return { value };
      case "none":
        return { value: "hide" };
      case "edge":
        return { value: "3g", warning: "iOS simctl does not support 'edge'; using '3g' instead." };
      default:
        return { value: null };
    }
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
