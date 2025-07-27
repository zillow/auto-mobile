import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BaseVisualChange } from "./BaseVisualChange";
import { GestureOptions } from "../../models/GestureOptions";
import { ExecuteGesture } from "./ExecuteGesture";
import { BootedDevice } from "../../models";
import { Axe } from "../../utils/ios-cmdline-tools/axe";

/**
 * Executes a fling gesture with high velocity
 */
export class Fling extends BaseVisualChange {
  private executeGesture: ExecuteGesture;

  constructor(device: BootedDevice, adb: AdbUtils | null = null, axe: Axe | null = null) {
    super(device, adb, axe);
    this.executeGesture = new ExecuteGesture(device, adb);
  }

  /**
   * Execute a fling gesture from one point to another with high velocity
   * @param x1 - Starting X coordinate
   * @param y1 - Starting Y coordinate
   * @param x2 - Ending X coordinate
   * @param y2 - Ending Y coordinate
   * @param options - Additional gesture options
   * @returns Result of the fling operation
   */
  async execute(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    options: GestureOptions = {}
  ): Promise<any> {

    // Use simple swipe for flings
    return this.executeGesture.swipe(
      x1,
      y1,
      x2,
      y2,
      options
    );
  }
}
