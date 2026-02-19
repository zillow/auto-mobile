import type { AdbExecutor } from "../../../utils/android-cmdline-tools/interfaces/AdbExecutor";
import { logger } from "../../../utils/logger";

/** A /dev/input/eventN node that reports multitouch position */
export interface TouchInputNode {
  path: string;
  name: string;
  axisXMin: number;
  axisXMax: number;
  axisYMin: number;
  axisYMax: number;
}

/**
 * Run `shell getevent -p` and return the first input node that reports both
 * ABS_MT_POSITION_X (0x35) and ABS_MT_POSITION_Y (0x36) with valid axis ranges.
 */
export async function discoverTouchNode(
  adb: AdbExecutor
): Promise<TouchInputNode | null> {
  const { stdout } = await adb.executeCommand("shell getevent -p");
  const nodes = parseTouchNodes(stdout);
  if (nodes.length === 0) {
    logger.warn("[TouchNodeDiscovery] No multitouch input device found");
    return null;
  }
  if (nodes.length > 1) {
    logger.debug(
      `[TouchNodeDiscovery] Found ${nodes.length} multitouch devices, using first: ${nodes[0].path}`
    );
  }
  return nodes[0];
}

/**
 * Pure parser exposed for unit testing.
 * Handles both `getevent -p` (hex codes) and `getevent -pl` (named codes) output.
 */
export function parseTouchNodes(output: string): TouchInputNode[] {
  const lines = output.split("\n");
  const nodes: TouchInputNode[] = [];

  let currentPath: string | null = null;
  let currentName: string | null = null;
  let axisXMin = 0;
  let axisXMax = 0;
  let axisYMin = 0;
  let axisYMax = 0;
  let hasX = false;
  let hasY = false;

  const commitDevice = (): void => {
    if (currentPath && hasX && hasY) {
      nodes.push({
        path: currentPath,
        name: currentName ?? currentPath,
        axisXMin,
        axisXMax,
        axisYMin,
        axisYMax,
      });
    }
    currentPath = null;
    currentName = null;
    axisXMin = axisXMax = axisYMin = axisYMax = 0;
    hasX = hasY = false;
  };

  for (const line of lines) {
    // New device section
    const deviceMatch = line.match(/^add device \d+:\s+(.+)/);
    if (deviceMatch) {
      commitDevice();
      currentPath = deviceMatch[1].trim();
      continue;
    }

    if (!currentPath) {continue;}

    // Device name line: `  name:     "Touchscreen"`
    const nameMatch = line.match(/^\s+name:\s+"(.+)"/);
    if (nameMatch) {
      currentName = nameMatch[1];
      continue;
    }

    // X axis – absinfo line for ABS_MT_POSITION_X (0035) in either format:
    //   getevent -p:  "    0035  : value 0, min 0, max 1079, ..."
    //   getevent -pl: "    ABS_MT_POSITION_X (0035): value 0, min 0, max 1079, ..."
    if (
      (line.includes("0035") || line.includes("ABS_MT_POSITION_X")) &&
      line.includes("min") &&
      line.includes("max")
    ) {
      const rangeMatch = line.match(/\bmin\s+(-?\d+),\s*max\s+(-?\d+)/);
      if (rangeMatch) {
        axisXMin = parseInt(rangeMatch[1], 10);
        axisXMax = parseInt(rangeMatch[2], 10);
        hasX = true;
      }
      continue;
    }

    // Y axis
    if (
      (line.includes("0036") || line.includes("ABS_MT_POSITION_Y")) &&
      line.includes("min") &&
      line.includes("max")
    ) {
      const rangeMatch = line.match(/\bmin\s+(-?\d+),\s*max\s+(-?\d+)/);
      if (rangeMatch) {
        axisYMin = parseInt(rangeMatch[1], 10);
        axisYMax = parseInt(rangeMatch[2], 10);
        hasY = true;
      }
      continue;
    }
  }

  // Don't forget the last device
  commitDevice();

  return nodes;
}
