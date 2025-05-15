import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger.ts';

const execAsync = promisify(exec);

interface ExecResult {
  stdout: string;
  stderr: string;
}

export class AdbUtils {
  private deviceId: string | null;
  private execAsync: (command: string) => Promise<ExecResult>;
  private spawnFn: typeof spawn;

  /**
   * Create an AdbUtils instance
   * @param deviceId - Optional device ID 
   * @param execAsyncFn - promisified exec function (for testing)
   * @param spawnFn - spawn function (for testing)
   */
  constructor(
    deviceId: string | null = null, 
    execAsyncFn: ((command: string) => Promise<ExecResult>) | null = null,
    spawnFn: typeof spawn | null = null
  ) {
    this.deviceId = deviceId;
    this.execAsync = execAsyncFn || execAsync;
    this.spawnFn = spawnFn || spawn;
  }

  /**
   * Set the target device ID
   * @param deviceId - Device identifier
   */
  setDeviceId(deviceId: string): void {
    this.deviceId = deviceId;
  }

  /**
   * Get the base ADB command with optional device ID
   * @returns The base ADB command
   */
  getBaseCommand(): string {
    return this.deviceId ? `adb -s ${this.deviceId}` : 'adb';
  }

  /**
   * Execute an ADB command
   * @param command - The command to execute
   * @param timeoutMs - Optional timeout in milliseconds
   * @returns Promise with stdout and stderr
   */
  async executeCommand(command: string, timeoutMs?: number): Promise<ExecResult> {
    const fullCommand = `${this.getBaseCommand()} ${command}`;
    logger.debug(`Executing command: ${fullCommand}`);
    
    // Use Promise.race to implement timeout if specified
    if (timeoutMs) {
      return await Promise.race([
        this.execAsync(fullCommand),
        new Promise<ExecResult>((_, reject) => {
          setTimeout(() => reject(new Error(`Command timed out after ${timeoutMs}ms: ${fullCommand}`)), timeoutMs);
        })
      ]);
    }
    
    return await this.execAsync(fullCommand);
  }

  /**
   * Spawn a long-running ADB command as a process
   * @param command - The command to execute
   * @returns The spawned child process
   */
  spawnCommand(command: string): ChildProcess {
    const parts = command.split(' ');
    const baseCommand = this.getBaseCommand().split(' ');
    
    // If we have a device specified, first parts will be ['adb', '-s', 'deviceId']
    // Otherwise just ['adb']
    const args = [...baseCommand.slice(1), ...parts];
    
    logger.debug(`Spawning command: ${baseCommand[0]} ${args.join(' ')}`);
    return this.spawnFn(baseCommand[0], args, { shell: true });
  }

  /**
   * Get the list of connected devices
   * @returns Promise with an array of device IDs
   */
  async getDevices(): Promise<string[]> {
    logger.debug('Getting list of connected devices');
    const { stdout } = await this.execAsync('adb devices');
    const lines = stdout.split('\n').slice(1); // Skip the first line which is the header
    
    return lines
      .filter(line => line.trim().length > 0)
      .map(line => line.split('\t')[0]);
  }
}