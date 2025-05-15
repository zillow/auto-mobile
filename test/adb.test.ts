import { describe, it, beforeEach, before } from 'mocha';
import { expect } from 'chai';
import { AdbUtils } from '../src/utils/adb.ts';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger, LogLevel } from '../src/utils/logger.ts';

const execAsync = promisify(exec);

// Set log level to INFO for tests
logger.setLogLevel(LogLevel.INFO);

describe('AdbUtils with Real ADB', function() {
  // These tests will interact with a real ADB server and device
  // Increase timeout for real device interactions
  this.timeout(10000);
  
  let adbUtils: AdbUtils;
  let connectedDevices: string[] = [];
  let isAdbAvailable = false;
  let testDeviceId: string | null = null;

  before(async function() {
    // Check if ADB is available on the system
    try {
      const { stdout } = await execAsync('adb version');
      isAdbAvailable = stdout.includes('Android Debug Bridge');
      logger.debug('ADB is available: ' + stdout.trim());
      
      // Get list of connected devices
      const { stdout: devicesStdout } = await execAsync('adb devices');
      const deviceLines = devicesStdout.split('\n').slice(1); // Skip header
      
      connectedDevices = deviceLines
        .filter(line => line.trim().length > 0 && line.includes('\t'))
        .map(line => line.split('\t')[0]);
      
      logger.debug('Connected devices: ' + connectedDevices.join(', '));
      
      if (connectedDevices.length === 0) {
        logger.warn('No devices connected for testing real ADB commands');
      } else {
        // Use the first device for testing
        testDeviceId = connectedDevices[0];
        logger.debug('Using device for tests: ' + testDeviceId);
      }
    } catch (err) {
      logger.error('ADB not available: ' + err);
      isAdbAvailable = false;
    }
  });
  
  beforeEach(function() {
    // Skip all tests if ADB is not available
    if (!isAdbAvailable) {
      this.skip();
    }
    
    // Create a new instance for each test
    adbUtils = new AdbUtils(null);
  });
  
  describe('constructor', () => {
    it('should create an instance with no device ID', () => {
      expect(adbUtils).to.be.an.instanceOf(AdbUtils);
      expect(adbUtils['deviceId']).to.be.null;
    });

    it('should create an instance with a device ID', () => {
      if (!testDeviceId) {
        logger.warn('Skipping test because no device is connected');
        return;
      }
      
      const adbWithDevice = new AdbUtils(testDeviceId);
      expect(adbWithDevice).to.be.an.instanceOf(AdbUtils);
      expect(adbWithDevice['deviceId']).to.equal(testDeviceId);
    });
  });

  describe('setDeviceId', () => {
    it('should set the device ID', () => {
      if (!testDeviceId) {
        logger.warn('Skipping test because no device is connected');
        return;
      }
      
      adbUtils.setDeviceId(testDeviceId);
      expect(adbUtils['deviceId']).to.equal(testDeviceId);
    });
  });

  describe('getBaseCommand', () => {
    it('should return "adb" when no device ID is set', () => {
      expect(adbUtils.getBaseCommand()).to.equal('adb');
    });

    it('should include device ID when set', () => {
      if (!testDeviceId) {
        logger.warn('Skipping test because no device is connected');
        return;
      }
      
      adbUtils.setDeviceId(testDeviceId);
      expect(adbUtils.getBaseCommand()).to.equal(`adb -s ${testDeviceId}`);
    });
  });

  describe('executeCommand', () => {
    it('should execute an ADB command', async () => {
      const result = await adbUtils.executeCommand('version');
      expect(result).to.have.property('stdout');
      expect(result.stdout).to.include('Android Debug Bridge');
    });
    
    it('should include device ID when set', async () => {
      if (!testDeviceId) {
        logger.warn('Skipping test because no device is connected');
        return;
      }
      
      adbUtils.setDeviceId(testDeviceId);
      
      // Test a command that requires a device
      const result = await adbUtils.executeCommand('shell echo "test"');
      expect(result).to.have.property('stdout');
      expect(result.stdout.trim()).to.equal('test');
    });
  });

  describe('spawnCommand', () => {
    it('should spawn an ADB command process and collect output', (done) => {
      const childProcess = adbUtils.spawnCommand('version');
      let output = '';
      
      childProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      childProcess.on('close', (code) => {
        expect(code).to.equal(0);
        expect(output).to.include('Android Debug Bridge');
        done();
      });
    });
    
    it('should include device ID when set and execute device commands', function(done) {
      if (!testDeviceId) {
        logger.warn('Skipping test because no device is connected');
        this.skip();
        return;
      }
      
      adbUtils.setDeviceId(testDeviceId);
      const childProcess = adbUtils.spawnCommand('shell echo "test_spawn"');
      let output = '';
      
      childProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      childProcess.on('close', (code) => {
        expect(code).to.equal(0);
        expect(output.trim()).to.equal('test_spawn');
        done();
      });
    });
  });

  describe('getDevices', () => {
    it('should return a list of connected devices', async () => {
      const devices = await adbUtils.getDevices();
      expect(devices).to.be.an('array');
      
      // Verify the device list matches what we found in setup
      expect(devices).to.have.members(connectedDevices);
    });
  });
});