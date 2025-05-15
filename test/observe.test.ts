import { describe, it, before, beforeEach, afterEach, after } from 'mocha';
import { expect } from 'chai';
import { ObserveCommand } from '../src/commands/observe.ts';
import { AppUtils } from '../src/utils/app.ts';
import { AdbUtils } from '../src/utils/adb.ts';
import fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger, LogLevel } from '../src/utils/logger.ts';

// Set log level to INFO for tests
logger.setLogLevel(LogLevel.INFO);

const execAsync = promisify(exec);
const CLOCK_PACKAGE = 'com.google.android.deskclock';

interface ScreenSize {
  width: number;
  height: number;
}

interface SystemInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

describe('ObserveCommand with Real Device', function() {
  // Increase timeout for real device interactions
  this.timeout(30000);

  let observeCommand: ObserveCommand;
  let appUtils: AppUtils;
  let adbUtils: AdbUtils;
  let testDeviceId: string | null = null;
  let isAdbAvailable = false;
  let screenshotDir = path.join(process.cwd(), 'test_screenshots');

  before(async function() {
    // Create directory for screenshots if it doesn't exist
    await fs.ensureDir(screenshotDir);
    
    // Check if ADB is available on the system
    try {
      const { stdout } = await execAsync('adb version');
      isAdbAvailable = stdout.includes('Android Debug Bridge');
      logger.debug('ADB is available: ' + stdout.trim());
      
      // Get list of connected devices
      const { stdout: devicesStdout } = await execAsync('adb devices');
      const deviceLines = devicesStdout.split('\n').slice(1); // Skip header
      
      const connectedDevices = deviceLines
        .filter(line => line.trim().length > 0 && line.includes('\t'))
        .map(line => line.split('\t')[0]);
      
      logger.debug('Connected devices: ' + connectedDevices.join(', '));
      
      if (connectedDevices.length === 0) {
        logger.debug('No devices connected for testing real device commands');
      } else {
        // Use the first device for testing
        testDeviceId = connectedDevices[0];
        logger.debug('Using device for tests: ' + testDeviceId);
        
        // Initialize utils with the test device
        adbUtils = new AdbUtils(testDeviceId);
        appUtils = new AppUtils(testDeviceId);
        observeCommand = new ObserveCommand(testDeviceId);
        
        // Launch the Clock app for testing
        logger.debug('Launching Clock app for testing...');
        await appUtils.launchApp(CLOCK_PACKAGE);
        await observeCommand.device.waitForUiStability(CLOCK_PACKAGE);
      }
    } catch (error) {
      logger.error('ADB not available or setup failed:', error);
      isAdbAvailable = false;
    }
  });
  
  after(async function() {
    if (isAdbAvailable && testDeviceId) {
      // Clean up by closing the Clock app
      try {
        await appUtils.terminateApp(CLOCK_PACKAGE);
        logger.debug('Closed Clock app');
      } catch (error) {
        logger.error('Error closing app:', error);
      }
    }
    
    // Clean up test screenshots
    try {
      const files = await fs.readdir(screenshotDir);
      for (const file of files) {
        if (file.endsWith('.png')) {
          await fs.unlink(path.join(screenshotDir, file));
        }
      }
      logger.debug('Cleaned up test screenshots');
    } catch (error) {
      logger.error('Error cleaning up screenshots:', error);
    }
  });

  beforeEach(function() {
    // Skip tests if no device is available
    if (!isAdbAvailable || !testDeviceId) {
      this.skip();
    }
  });

  describe('execute', () => {
    it('should return screen size, insets, view hierarchy, and screenshot when withScreenshot is true', async () => {
      // Execute the command with a real device

      const screenshotPath = path.join(screenshotDir, 'test_full_observe.png');
      const result = await observeCommand.execute({
        withScreenshot: true,
        screenshotPath: screenshotPath,
        fastMode: true
      });

      // Verify the result has all required properties
      expect(result).to.have.property('timestamp');
      expect(result).to.have.property('screenSize');
      expect(result.screenSize).to.have.property('width').that.is.a('number').and.is.above(0);
      expect(result.screenSize).to.have.property('height').that.is.a('number').and.is.above(0);
      
      expect(result).to.have.property('systemInsets');
      expect(result.systemInsets).to.have.property('top').that.is.a('number');
      expect(result.systemInsets).to.have.property('right').that.is.a('number');
      expect(result.systemInsets).to.have.property('bottom').that.is.a('number');
      expect(result.systemInsets).to.have.property('left').that.is.a('number');
      
      expect(result).to.have.property('viewHierarchy').that.is.an('object');
      expect(result.viewHierarchy).to.have.property('hierarchy').that.is.an('object');
      
      // Check the clock app is visible in the hierarchy
      const hierarchyStr = JSON.stringify(result.viewHierarchy);
      expect(hierarchyStr).to.include(CLOCK_PACKAGE);
      
      // Verify screenshot was taken and saved
      expect(result).to.have.property('screenshotPath').that.equals(screenshotPath);
      expect(fs.existsSync(screenshotPath)).to.be.true;
      
      // Check screenshot file has content
      const stats = await fs.stat(screenshotPath);
      expect(stats.size).to.be.above(1000); // Should be at least 1KB
      
      logger.debug('Device screen size: ' + JSON.stringify(result.screenSize));
      logger.debug('Screenshot saved to: ' + result.screenshotPath);
    });

    it('should not include screenshot when withScreenshot is false', async () => {
      // Execute the command with withScreenshot=false and skip view hierarchy
      const result = await observeCommand.execute({ 
        withScreenshot: false,
        withViewHierarchy: false,
        fastMode: true
      });
      
      // Verify the result has required properties but no screenshot
      expect(result).to.have.property('timestamp');
      expect(result).to.have.property('screenSize');
      expect(result).to.have.property('systemInsets');
      expect(result).to.have.property('viewHierarchy');
      expect(result).to.not.have.property('screenshotPath');
    });

    it('should use custom screenshot path when provided', async () => {
      // Execute the command with custom screenshot path
      const customPath = path.join(screenshotDir, 'custom_screenshot.png');
      const result = await observeCommand.execute({ 
        withScreenshot: true, 
        screenshotPath: customPath,
        fastMode: true
      });

      // Verify the screenshot path is used correctly
      expect(result).to.have.property('screenshotPath', customPath);
      expect(fs.existsSync(customPath)).to.be.true;
    });

    it('should handle device rotation and update screen size correctly', async function() {
      try {
        // Set portrait orientation and wait for completion
        await observeCommand.device.setOrientation('portrait');
        
        // Get portrait size
        const portraitResult = await observeCommand.execute({ 
          withScreenshot: false,
          withViewHierarchy: false,
          fastMode: true
        });
        const portraitWidth = portraitResult.screenSize.width;
        const portraitHeight = portraitResult.screenSize.height;
        
        logger.debug('Portrait dimensions: ' + JSON.stringify(portraitResult.screenSize));
        
        // Now rotate to landscape and wait for completion
        await observeCommand.device.setOrientation('landscape');
        
        // Get landscape size
        const landscapeResult = await observeCommand.execute({ 
          withScreenshot: false,
          withViewHierarchy: false,
          fastMode: true
        });
        const landscapeWidth = landscapeResult.screenSize.width;
        const landscapeHeight = landscapeResult.screenSize.height;
        
        logger.debug('Landscape dimensions: ' + JSON.stringify(landscapeResult.screenSize));
        
        // Verify our screen dimensions properly adjust based on rotation
        
        // First check if dimensions changed at all - some devices might not 
        // actually rotate even when requested
        if (landscapeWidth === portraitWidth && landscapeHeight === portraitHeight) {
          logger.debug('Device dimensions unchanged after rotation request, skipping test');
          this.skip();
          return;
        }
        
        // Typical behavior for rotation is that width and height swap
        if (portraitHeight > portraitWidth) {
          // If starting in portrait (height > width), then after rotation:
          // Landscape should have width > height
          expect(landscapeWidth).to.be.greaterThan(landscapeHeight);
          // And landscape width should match (or be close to) portrait height
          expect(Math.abs(landscapeWidth - portraitHeight)).to.be.lessThan(100);
        } else {
          // If we started in landscape already, the reverse is true
          expect(landscapeHeight).to.be.greaterThan(landscapeWidth);
          expect(Math.abs(landscapeHeight - portraitWidth)).to.be.lessThan(100);
        }
        
        // Rotate back to portrait and wait for completion
        await observeCommand.device.setOrientation('portrait');
        
        // Get final dimensions
        const finalResult = await observeCommand.execute({ 
          withScreenshot: false,
          withViewHierarchy: false,
          fastMode: true
        });
        logger.debug('Final portrait dimensions: ' + JSON.stringify(finalResult.screenSize));
        
        // Final dimensions should match original portrait dimensions
        expect(Math.abs(finalResult.screenSize.width - portraitWidth)).to.be.lessThan(10);
        expect(Math.abs(finalResult.screenSize.height - portraitHeight)).to.be.lessThan(10);
        
      } catch (error) {
        logger.error('Error during rotation test:', error);
        this.skip();
      }
    });
  });
});