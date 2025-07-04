import { AdbUtils } from "../../utils/adb";
import { logger } from "../../utils/logger";
import { DemoModeResult } from "../../models/DemoModeResult";
import { BaseVisualChange } from "../action/BaseVisualChange";

export interface DemoModeOptions {
  time?: string; // In format "HHMM", default "1000"
  batteryLevel?: number; // 0-100, default 100
  batteryPlugged?: boolean; // default false
  wifiLevel?: number; // 0-4, default 4
  mobileDataType?: "4g" | "5g" | "lte" | "3g" | "edge" | "none"; // default 4g
  mobileSignalLevel?: number; // 0-4, default 4
  hideNotifications?: boolean; // default true
}

export class DemoMode extends BaseVisualChange {

  constructor(deviceId: string, adb: AdbUtils | null = null) {
    super(deviceId, adb);
  }

  /**
   * Setup demo mode on the Android device
   * @param options - Optional demo mode configuration
   * @returns Promise with result indicating success or failure
   */
  async execute(options: DemoModeOptions = {}): Promise<DemoModeResult> {
    const {
      time = "1000",
      batteryLevel = 100,
      batteryPlugged = false,
      wifiLevel = 4,
      mobileDataType = "4g",
      mobileSignalLevel = 4,
      hideNotifications = true,
    } = options;

    return this.observedInteraction(
      async () => {
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
      },
      {
        changeExpected: false // TODO: Could make this true if we establish demo mode was off previously
      }
    );
  }

  /**
   * Exit demo mode on the Android device
   * @returns Promise with result indicating success or failure
   */
  async exitDemoMode(): Promise<DemoModeResult> {
    return this.observedInteraction(
      async () => {
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
      },
      {
        changeExpected: false // TODO: Could make this true if we establish demo mode was on previously
      }
    );
  }
}
