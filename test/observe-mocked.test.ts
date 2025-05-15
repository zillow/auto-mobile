import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { ChildProcess } from 'child_process';
import { ObserveCommand } from '../src/commands/observe.ts';
import { DeviceUtils } from '../src/utils/device.ts';
import { AdbUtils } from '../src/utils/adb.ts';

interface ExecResult {
  stdout: string;
  stderr: string;
}

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

describe('ObserveCommand', () => {
  let observeCommand: ObserveCommand;
  let deviceUtilsStub: {
    getScreenSize: sinon.SinonStub;
    getSystemInsets: sinon.SinonStub;
    getViewHierarchy: sinon.SinonStub;
    takeScreenshot: sinon.SinonStub;
  };
  let execAsyncStub: sinon.SinonStub;
  let spawnStub: sinon.SinonStub;

  beforeEach(() => {
    // Create stubs for execAsync and spawn
    execAsyncStub = sinon.stub().resolves({ stdout: '', stderr: '' } as ExecResult);
    spawnStub = sinon.stub().returns({
      stdout: { on: sinon.stub() },
      stderr: { on: sinon.stub() },
      on: sinon.stub(),
      kill: sinon.stub()
    } as unknown as ChildProcess);
    
    // Create stubs for DeviceUtils methods
    deviceUtilsStub = {
      getScreenSize: sinon.stub(),
      getSystemInsets: sinon.stub(),
      getViewHierarchy: sinon.stub(),
      takeScreenshot: sinon.stub()
    };
    
    // Replace DeviceUtils with our stub
    sinon.stub(DeviceUtils.prototype, 'getScreenSize').callsFake(deviceUtilsStub.getScreenSize);
    sinon.stub(DeviceUtils.prototype, 'getSystemInsets').callsFake(deviceUtilsStub.getSystemInsets);
    sinon.stub(DeviceUtils.prototype, 'getViewHierarchy').callsFake(deviceUtilsStub.getViewHierarchy);
    sinon.stub(DeviceUtils.prototype, 'takeScreenshot').callsFake(deviceUtilsStub.takeScreenshot);
    
    // Replace AdbUtils constructor to return our version with stubs
    sinon.stub(AdbUtils.prototype, 'constructor').callsFake((deviceId: string | null) => {
      return new AdbUtils(deviceId, execAsyncStub, spawnStub);
    });
    
    // Create a new ObserveCommand instance
    observeCommand = new ObserveCommand();
  });

  afterEach(() => {
    // Restore original methods
    sinon.restore();
  });

  describe('execute', () => {
    it('should return screen size, insets, view hierarchy, and screenshot when withScreenshot is true', async () => {
      // Setup mock return values
      const mockScreenSize: ScreenSize = { width: 1080, height: 1920 };
      const mockSystemInsets: SystemInsets = { top: 24, right: 0, bottom: 48, left: 0 };
      const mockViewHierarchy = { hierarchy: { node: { text: 'Root' } } };
      const mockScreenshotPath = './test_screenshot.png';
      
      deviceUtilsStub.getScreenSize.resolves(mockScreenSize);
      deviceUtilsStub.getSystemInsets.resolves(mockSystemInsets);
      deviceUtilsStub.getViewHierarchy.resolves(mockViewHierarchy);
      deviceUtilsStub.takeScreenshot.resolves(mockScreenshotPath);
      
      // Execute the command
      const result = await observeCommand.execute({ withScreenshot: true });
      
      // Verify the result
      expect(result).to.have.property('timestamp');
      expect(result).to.have.property('screenSize', mockScreenSize);
      expect(result).to.have.property('systemInsets', mockSystemInsets);
      expect(result).to.have.property('viewHierarchy', mockViewHierarchy);
      expect(result).to.have.property('screenshotPath', mockScreenshotPath);
      
      // Verify method calls
      expect(deviceUtilsStub.getScreenSize.calledOnce).to.be.true;
      expect(deviceUtilsStub.getSystemInsets.calledOnce).to.be.true;
      expect(deviceUtilsStub.getViewHierarchy.calledOnce).to.be.true;
      expect(deviceUtilsStub.takeScreenshot.calledOnce).to.be.true;
    });

    it('should not include screenshot when withScreenshot is false', async () => {
      // Setup mock return values
      const mockScreenSize: ScreenSize = { width: 1080, height: 1920 };
      const mockSystemInsets: SystemInsets = { top: 24, right: 0, bottom: 48, left: 0 };
      const mockViewHierarchy = { hierarchy: { node: { text: 'Root' } } };
      
      deviceUtilsStub.getScreenSize.resolves(mockScreenSize);
      deviceUtilsStub.getSystemInsets.resolves(mockSystemInsets);
      deviceUtilsStub.getViewHierarchy.resolves(mockViewHierarchy);
      
      // Execute the command with withScreenshot=false
      const result = await observeCommand.execute({ withScreenshot: false });
      
      // Verify the result
      expect(result).to.have.property('timestamp');
      expect(result).to.have.property('screenSize', mockScreenSize);
      expect(result).to.have.property('systemInsets', mockSystemInsets);
      expect(result).to.have.property('viewHierarchy', mockViewHierarchy);
      expect(result).to.not.have.property('screenshotPath');
      
      // Verify method calls
      expect(deviceUtilsStub.getScreenSize.calledOnce).to.be.true;
      expect(deviceUtilsStub.getSystemInsets.calledOnce).to.be.true;
      expect(deviceUtilsStub.getViewHierarchy.calledOnce).to.be.true;
      expect(deviceUtilsStub.takeScreenshot.called).to.be.false;
    });

    it('should pass custom screenshot path', async () => {
      // Setup mock return values
      const mockScreenSize: ScreenSize = { width: 1080, height: 1920 };
      const mockSystemInsets: SystemInsets = { top: 24, right: 0, bottom: 48, left: 0 };
      const mockViewHierarchy = { hierarchy: { node: { text: 'Root' } } };
      const customScreenshotPath = './custom_screenshot.png';
      
      deviceUtilsStub.getScreenSize.resolves(mockScreenSize);
      deviceUtilsStub.getSystemInsets.resolves(mockSystemInsets);
      deviceUtilsStub.getViewHierarchy.resolves(mockViewHierarchy);
      deviceUtilsStub.takeScreenshot.resolves(customScreenshotPath);
      
      // Execute the command with custom screenshot path
      const result = await observeCommand.execute({ 
        withScreenshot: true, 
        screenshotPath: customScreenshotPath 
      });
      
      // Verify the takeScreenshot was called with the custom path
      expect(deviceUtilsStub.takeScreenshot.calledWith(customScreenshotPath)).to.be.true;
      expect(result.screenshotPath).to.equal(customScreenshotPath);
    });

    it('should throw an error when a device method fails', async () => {
      // Make getScreenSize throw an error
      const errorMessage = 'Failed to get screen size';
      deviceUtilsStub.getScreenSize.rejects(new Error(errorMessage));
      
      // Execute the command and expect it to throw
      try {
        await observeCommand.execute();
        expect.fail('Command should have thrown an error');
      } catch (error) {
        if (error instanceof Error) {
          expect(error.message).to.include('Observe command failed');
          expect(error.message).to.include(errorMessage);
        } else {
          expect.fail('Error should be an instance of Error');
        }
      }
    });
  });
});