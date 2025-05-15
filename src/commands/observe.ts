import { DeviceUtils } from '../utils/device.ts';
import { logger } from '../utils/logger.ts';

interface ObserveOptions {
  withScreenshot?: boolean;
  screenshotPath?: string;
  withViewHierarchy?: boolean;
  fastMode?: boolean;
}

interface ObserveResult {
  timestamp: string;
  screenSize: {
    width: number;
    height: number;
  };
  systemInsets: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  viewHierarchy: any;
  screenshotPath?: string;
}

/**
 * Observe command class that combines screen details, view hierarchy and screenshot
 */
export class ObserveCommand {
  private device: DeviceUtils;

  constructor(deviceId: string | null = null) {
    this.device = new DeviceUtils(deviceId);
  }

  /**
   * Execute the observe command
   * @param options - Command options
   * @returns The observation result
   */
  async execute(options: ObserveOptions = {}): Promise<ObserveResult> {
    const { 
      withScreenshot = true, 
      screenshotPath = '',
      withViewHierarchy = true,
      fastMode = false
    } = options;
    
    try {
      logger.debug('Executing observe command withScreenshot: ', withScreenshot, ' withViewHierarchy: ', withViewHierarchy, ' fastMode: ', fastMode);
      const startTime = Date.now();
      
      // Get screen size
      const screenSizeStart = Date.now();
      const screenSize = await this.device.getScreenSize();
      logger.debug(`Screen size retrieval took ${Date.now() - screenSizeStart}ms`);
      
      // Get system insets
      const insetsStart = Date.now();
      const systemInsets = await this.device.getSystemInsets();
      logger.debug(`System insets retrieval took ${Date.now() - insetsStart}ms`);
      
      // Get view hierarchy if requested, using cache when appropriate
      const viewHierarchyStart = Date.now();
      const viewHierarchy = withViewHierarchy 
        ? await this.device.getViewHierarchy(fastMode) // Use cache if fastMode is enabled
        : { hierarchy: { node: { text: "View hierarchy collection skipped" } } };
      logger.debug(`View hierarchy retrieval took ${Date.now() - viewHierarchyStart}ms`);

      // Build the result object
      const result: ObserveResult = {
        timestamp: new Date().toISOString(),
        screenSize,
        systemInsets,
        viewHierarchy
      };
      
      // Take a screenshot if requested
      if (withScreenshot) {
        const screenshotStart = Date.now();
        const path = await this.device.takeScreenshot(screenshotPath, fastMode);
        result.screenshotPath = path;
        logger.debug(`Screenshot took ${Date.now() - screenshotStart}ms`);
      }
      
      logger.debug('Observe command completed successfully');
      logger.debug(`Total observe command execution took ${Date.now() - startTime}ms`);
      return result;
    } catch (err) {
      throw new Error(`Observe command failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}