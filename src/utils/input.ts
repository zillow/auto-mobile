import { ChildProcess } from 'child_process';
import { AdbUtils } from './adb.ts';

interface Point {
  x: number;
  y: number;
  delay?: number;
}

interface FingerPath {
  points: Point[];
  finger: number;
}

export class InputUtils {
  adb: AdbUtils;
  private touchDevice: string | null = null;

  /**
   * Create an InputUtils instance
   * @param deviceId - Optional device ID
   * @param adbUtils - Optional AdbUtils instance for testing
   */
  constructor(deviceId: string | null = null, adbUtils: AdbUtils | null = null) {
    this.adb = adbUtils || new AdbUtils(deviceId);
  }

  /**
   * Find touch input device
   * @returns Promise with the event device path for touch input
   */
  async findTouchDevice(): Promise<string> {
    if (this.touchDevice) {
      return this.touchDevice;
    }

    const { stdout } = await this.adb.executeCommand('shell getevent -pl');
    const lines = stdout.split('\n');
    
    let devicePath: string | null = null;
    let inDevice = false;
    let hasTouchscreen = false;
    
    for (const line of lines) {
      if (line.startsWith('add device')) {
        const match = line.match(/add device \d+: (.+)/);
        if (match) {
          inDevice = true;
          devicePath = match[1];
          hasTouchscreen = false;
        }
      } else if (inDevice && line.includes('INPUT_PROP_DIRECT')) {
        hasTouchscreen = true;
      } else if (line.trim() === '') {
        if (inDevice && hasTouchscreen && devicePath) {
          this.touchDevice = devicePath;
          return devicePath;
        }
        inDevice = false;
      }
    }

    // Fallback to a common touch device path if we can't find it
    this.touchDevice = '/dev/input/event2';
    return this.touchDevice;
  }

  /**
   * Send a tap event at specific coordinates
   * @param x - X coordinate
   * @param y - Y coordinate
   */
  async tap(x: number, y: number): Promise<void> {
    await this.adb.executeCommand(`shell input tap ${x} ${y}`);
  }

  /**
   * Send a swipe event from one point to another
   * @param x1 - Starting X coordinate
   * @param y1 - Starting Y coordinate
   * @param x2 - Ending X coordinate
   * @param y2 - Ending Y coordinate
   * @param duration - Duration in milliseconds
   */
  async swipe(x1: number, y1: number, x2: number, y2: number, duration: number = 300): Promise<void> {
    await this.adb.executeCommand(`shell input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`);
  }

  /**
   * Send a complex gesture using sendevent commands
   * @param points - Array of points with optional delay
   */
  async sendComplexGesture(points: Point[]): Promise<void> {
    if (!points || points.length < 2) {
      throw new Error('Complex gesture requires at least 2 points');
    }

    const touchDevice = await this.findTouchDevice();
    
    // Start touch
    await this.adb.executeCommand(`shell sendevent ${touchDevice} 3 57 0`); // ABS_MT_TRACKING_ID 0
    await this.adb.executeCommand(`shell sendevent ${touchDevice} 3 53 ${points[0].x}`); // ABS_MT_POSITION_X
    await this.adb.executeCommand(`shell sendevent ${touchDevice} 3 54 ${points[0].y}`); // ABS_MT_POSITION_Y
    await this.adb.executeCommand(`shell sendevent ${touchDevice} 3 58 50`); // ABS_MT_PRESSURE
    await this.adb.executeCommand(`shell sendevent ${touchDevice} 3 48 5`); // ABS_MT_TOUCH_MAJOR
    await this.adb.executeCommand(`shell sendevent ${touchDevice} 0 0 0`); // SYN_REPORT
    
    // Move through each point
    for (let i = 1; i < points.length; i++) {
      const point = points[i];
      const delay = point.delay || 10;
      
      // Wait for specified delay
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      // Send position update
      await this.adb.executeCommand(`shell sendevent ${touchDevice} 3 53 ${point.x}`); // ABS_MT_POSITION_X
      await this.adb.executeCommand(`shell sendevent ${touchDevice} 3 54 ${point.y}`); // ABS_MT_POSITION_Y
      await this.adb.executeCommand(`shell sendevent ${touchDevice} 0 0 0`); // SYN_REPORT
    }
    
    // End touch
    await this.adb.executeCommand(`shell sendevent ${touchDevice} 3 57 -1`); // ABS_MT_TRACKING_ID -1 (end touch)
    await this.adb.executeCommand(`shell sendevent ${touchDevice} 0 0 0`); // SYN_REPORT
  }

  /**
   * Send a multi-touch gesture (like pinch or zoom)
   * @param fingerPaths - Array of finger paths
   */
  async sendMultiTouchGesture(fingerPaths: FingerPath[]): Promise<void> {
    if (!fingerPaths || fingerPaths.length < 2) {
      throw new Error('Multi-touch gesture requires at least 2 finger paths');
    }

    const touchDevice = await this.findTouchDevice();
    const maxFingers = fingerPaths.length;
    
    // Start touches for each finger
    for (let i = 0; i < maxFingers; i++) {
      const fingerPath = fingerPaths[i];
      const firstPoint = fingerPath.points[0];
      
      await this.adb.executeCommand(`shell sendevent ${touchDevice} 3 57 ${i}`); // ABS_MT_TRACKING_ID i
      await this.adb.executeCommand(`shell sendevent ${touchDevice} 3 53 ${firstPoint.x}`); // ABS_MT_POSITION_X
      await this.adb.executeCommand(`shell sendevent ${touchDevice} 3 54 ${firstPoint.y}`); // ABS_MT_POSITION_Y
      await this.adb.executeCommand(`shell sendevent ${touchDevice} 3 58 50`); // ABS_MT_PRESSURE
      await this.adb.executeCommand(`shell sendevent ${touchDevice} 3 48 5`); // ABS_MT_TOUCH_MAJOR
      
      if (i < maxFingers - 1) {
        await this.adb.executeCommand(`shell sendevent ${touchDevice} 0 0 0`); // SYN_REPORT between fingers
      }
    }
    
    await this.adb.executeCommand(`shell sendevent ${touchDevice} 0 0 0`); // SYN_REPORT for all fingers
    
    // Find the max path length
    const maxPathLength = Math.max(...fingerPaths.map(fp => fp.points.length));
    
    // Move each finger through its path
    for (let step = 1; step < maxPathLength; step++) {
      // Default delay between steps
      await new Promise(resolve => setTimeout(resolve, 10));
      
      for (let i = 0; i < maxFingers; i++) {
        const fingerPath = fingerPaths[i];
        
        // Skip if this finger's path doesn't have this step
        if (step >= fingerPath.points.length) continue;
        
        const point = fingerPath.points[step];
        
        // Update finger position
        await this.adb.executeCommand(`shell sendevent ${touchDevice} 3 57 ${i}`); // ABS_MT_TRACKING_ID i
        await this.adb.executeCommand(`shell sendevent ${touchDevice} 3 53 ${point.x}`); // ABS_MT_POSITION_X
        await this.adb.executeCommand(`shell sendevent ${touchDevice} 3 54 ${point.y}`); // ABS_MT_POSITION_Y
        
        if (i < maxFingers - 1) {
          await this.adb.executeCommand(`shell sendevent ${touchDevice} 0 0 0`); // SYN_REPORT between fingers
        }
      }
      
      await this.adb.executeCommand(`shell sendevent ${touchDevice} 0 0 0`); // SYN_REPORT for all fingers
    }
    
    // End touches for each finger
    for (let i = 0; i < maxFingers; i++) {
      await this.adb.executeCommand(`shell sendevent ${touchDevice} 3 57 -1`); // ABS_MT_TRACKING_ID -1 (end touch)
      
      if (i < maxFingers - 1) {
        await this.adb.executeCommand(`shell sendevent ${touchDevice} 0 0 0`); // SYN_REPORT between fingers
      }
    }
    
    await this.adb.executeCommand(`shell sendevent ${touchDevice} 0 0 0`); // Final SYN_REPORT
  }

  /**
   * Send a sequence of key events with random delays
   * @param text - The text to type
   */
  async sendText(text: string): Promise<void> {
    await this.adb.executeCommand(`shell input text "${text.replace(/"/g, '\\"')}"`);
  }

  /**
   * Send a keyevent code
   * @param keyCode - Android key code
   */
  async sendKeyEvent(keyCode: number | string): Promise<void> {
    await this.adb.executeCommand(`shell input keyevent ${keyCode}`);
  }

  /**
   * Press a hardware button
   * @param button - Button name (home, back, menu, power, volume_up, volume_down)
   */
  async pressButton(button: string): Promise<void> {
    const keyCodeMap: Record<string, number> = {
      'home': 3,
      'back': 4,
      'menu': 82,
      'power': 26,
      'volume_up': 24,
      'volume_down': 25,
      'recent': 187,
    };
    
    const keyCode = keyCodeMap[button.toLowerCase()];
    if (!keyCode) {
      throw new Error(`Unknown button: ${button}`);
    }
    
    await this.sendKeyEvent(keyCode);
  }
}