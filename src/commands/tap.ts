import { InputUtils } from '../utils/input.ts';
import { ObserveCommand } from './observe.ts';

interface TapOptions {
  x: number;
  y: number;
  observe?: boolean;
  waitForIdle?: boolean;
  idleTimeout?: number;
}

interface TapResult {
  success: boolean;
  x: number;
  y: number;
  observation?: any;
}

/**
 * Command to tap at specific coordinates
 */
export class TapCommand {
  private input: InputUtils;
  private observe: ObserveCommand;

  constructor(deviceId: string | null = null) {
    this.input = new InputUtils(deviceId);
    this.observe = new ObserveCommand(deviceId);
  }

  /**
   * Execute a tap at specified coordinates
   * @param options - Command options
   * @returns Result of the command, including observation if requested
   */
  async execute(options: TapOptions): Promise<TapResult> {
    if (typeof options.x !== 'number' || typeof options.y !== 'number') {
      throw new Error('Tap command requires x and y coordinates');
    }

    try {
      // Perform the tap
      await this.input.tap(options.x, options.y);
      
      // Wait for idle state if requested
      if (options.waitForIdle !== false) {
        await this.waitForIdle(options.idleTimeout || 100);
      }
      
      // Return observation if requested
      if (options.observe !== false) {
        const observation = await this.observe.execute();
        return {
          success: true,
          x: options.x,
          y: options.y,
          observation
        };
      }
      
      return {
        success: true,
        x: options.x,
        y: options.y
      };
    } catch (error) {
      throw new Error(`Tap command failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Wait for UI to be idle (no touch events)
   * @param timeout - Timeout in ms
   */
  async waitForIdle(timeout: number = 100): Promise<void> {
    // Start capturing events
    const eventProcess = this.input.adb.spawnCommand('shell getevent -l');
    
    let isIdle = false;
    let lastEventTime = Date.now();
    let buffer = '';
    
    // Set timeout to resolve promise after waiting period with no events
    const idlePromise = new Promise<void>((resolve) => {
      // Check buffer for touch events
      const checkIdle = () => {
        const now = Date.now();
        if (now - lastEventTime >= timeout) {
          isIdle = true;
          eventProcess.kill();
          resolve();
        }
      };
      
      // Check idle state every 10ms
      const intervalId = setInterval(checkIdle, 10);
      
      // Update last event time when we get touch data
      eventProcess.stdout?.on('data', (data) => {
        buffer += data.toString();
        
        // If buffer contains touch events, update last event time
        if (buffer.includes('/dev/input/event') && 
            (buffer.includes('ABS_MT_POSITION') || buffer.includes('BTN_TOUCH'))) {
          lastEventTime = Date.now();
        }
        
        // Trim buffer to prevent memory issues
        if (buffer.length > 10000) {
          buffer = buffer.substring(buffer.length - 1000);
        }
      });
      
      // Ensure we don't hang forever
      setTimeout(() => {
        clearInterval(intervalId);
        eventProcess.kill();
        resolve();
      }, timeout + 100);
    });
    
    await idlePromise;
  }
}