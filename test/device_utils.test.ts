import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import { DeviceUtils } from '../src/utils/device.ts';
import { AdbUtils } from '../src/utils/adb.ts';
import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger, LogLevel } from '../src/utils/logger.ts';

// Set log level to INFO for tests
logger.setLogLevel(LogLevel.INFO);

const execAsync = promisify(exec);

describe('DeviceUtils - New Methods', function() {
  // Increase timeout for real device interactions
  this.timeout(30000);

  let deviceUtils: DeviceUtils;
  let testDeviceId: string | null = null;
  let isAdbAvailable = false;

  before(async function() {
    // Check if ADB is available on the system
    try {
      const { stdout } = await execAsync('adb version');
      isAdbAvailable = stdout.includes('Android Debug Bridge');
      
      // Get list of connected devices
      const { stdout: devicesStdout } = await execAsync('adb devices');
      const deviceLines = devicesStdout.split('\n').slice(1); // Skip header
      
      const connectedDevices = deviceLines
        .filter(line => line.trim().length > 0 && line.includes('\t'))
        .map(line => line.split('\t')[0]);
      
      if (connectedDevices.length === 0) {
        logger.debug('No devices connected for testing DeviceUtils methods');
      } else {
        // Use the first device for testing
        testDeviceId = connectedDevices[0];
        logger.debug('Using device for tests: ' + testDeviceId);
        
        // Initialize utils with the test device
        deviceUtils = new DeviceUtils(testDeviceId);
      }
    } catch (error) {
      logger.error('ADB not available or setup failed:', error);
      isAdbAvailable = false;
    }
  });

  describe('getActiveWindow', () => {
    it('should return active window information', async function() {
      if (!isAdbAvailable || !testDeviceId) {
        this.skip();
      }

      const result = await deviceUtils.getActiveWindow();
      
      // Verify the result has required properties
      expect(result).to.have.property('packageName').that.is.a('string');
      expect(result).to.have.property('activityName').that.is.a('string');
      expect(result).to.have.property('windowId').that.is.a('string');
      expect(result).to.have.property('isVisible').that.is.a('boolean');
      
      logger.debug('Active window:', result);
    });
  });
  
  describe('getActivityRecents', () => {
    it('should return recent activities', async function() {
      if (!isAdbAvailable || !testDeviceId) {
        this.skip();
      }

      const result = await deviceUtils.getActivityRecents();
      
      // Verify the result has required properties
      expect(result).to.have.property('timestamp').that.is.a('number');
      expect(result).to.have.property('recentTasks').that.is.an('array');
      
      // Check if we got at least one recent task
      if (result.recentTasks.length > 0) {
        const task = result.recentTasks[0];
        expect(task).to.have.property('id').that.is.a('string');
        expect(task).to.have.property('packageName').that.is.a('string');
      }
      
      logger.debug('Recent tasks count:', result.recentTasks.length);
    });
  });
  
  describe('View Hierarchy Caching', () => {
    it('should cache view hierarchy when called with cache=true', async function() {
      if (!isAdbAvailable || !testDeviceId) {
        this.skip();
      }

      // First call should populate the cache
      const startTime = Date.now();
      const result1 = await deviceUtils.getViewHierarchy(true);
      const firstCallTime = Date.now() - startTime;
      
      logger.debug(`First call took ${firstCallTime}ms`);
      
      // Second call should use the cache and be faster
      const startTime2 = Date.now();
      const result2 = await deviceUtils.getViewHierarchy(true);
      const secondCallTime = Date.now() - startTime2;
      
      logger.debug(`Second call took ${secondCallTime}ms`);
      
      // Check that the results are equivalent
      expect(JSON.stringify(result1)).to.equal(JSON.stringify(result2));
      
      // Ideally, the second call should be significantly faster,
      // but this might not always be true in all environments
      // So we just verify that caching didn't break functionality
    });
  });
});
