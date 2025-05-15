import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { ChildProcess } from 'child_process';
import { AdbUtils } from '../src/utils/adb.ts';

interface ExecResult {
  stdout: string;
  stderr: string;
}

describe('AdbUtils', () => {
  let adbUtils: AdbUtils;
  let execAsyncStub: sinon.SinonStub;
  let spawnStub: sinon.SinonStub;

  beforeEach(() => {
    // Create stubs for execAsync and spawn
    execAsyncStub = sinon.stub();
    spawnStub = sinon.stub().returns({
      stdout: { on: sinon.stub() },
      stderr: { on: sinon.stub() },
      on: sinon.stub(),
      kill: sinon.stub()
    } as unknown as ChildProcess);
    
    // Create a new AdbUtils instance with our stubs
    adbUtils = new AdbUtils(null, execAsyncStub, spawnStub);
  });

  describe('constructor', () => {
    it('should create an instance with no device ID', () => {
      expect(adbUtils['deviceId']).to.be.null;
    });

    it('should create an instance with a device ID', () => {
      const deviceId = 'test_device';
      const adbWithDevice = new AdbUtils(deviceId, execAsyncStub, spawnStub);
      expect(adbWithDevice['deviceId']).to.equal(deviceId);
    });
  });

  describe('setDeviceId', () => {
    it('should set the device ID', () => {
      const deviceId = 'new_device';
      adbUtils.setDeviceId(deviceId);
      expect(adbUtils['deviceId']).to.equal(deviceId);
    });
  });

  describe('getBaseCommand', () => {
    it('should return "adb" when no device ID is set', () => {
      expect(adbUtils.getBaseCommand()).to.equal('adb');
    });

    it('should include device ID when set', () => {
      const deviceId = 'test_device';
      adbUtils.setDeviceId(deviceId);
      expect(adbUtils.getBaseCommand()).to.equal(`adb -s ${deviceId}`);
    });
  });

  describe('executeCommand', () => {
    it('should execute an ADB command', async () => {
      const command = 'devices';
      const expectedOutput: ExecResult = { stdout: 'List of devices attached\n', stderr: '' };
      
      execAsyncStub.resolves(expectedOutput);
      
      const result = await adbUtils.executeCommand(command);
      
      expect(execAsyncStub.calledOnce).to.be.true;
      expect(execAsyncStub.firstCall.args[0]).to.equal(`adb ${command}`);
      expect(result).to.deep.equal(expectedOutput);
    });
    
    it('should include device ID when set', async () => {
      const deviceId = 'test_device';
      const command = 'devices';
      const expectedOutput: ExecResult = { stdout: 'List of devices attached\n', stderr: '' };
      
      adbUtils.setDeviceId(deviceId);
      execAsyncStub.resolves(expectedOutput);
      
      await adbUtils.executeCommand(command);
      
      expect(execAsyncStub.calledOnce).to.be.true;
      expect(execAsyncStub.firstCall.args[0]).to.equal(`adb -s ${deviceId} ${command}`);
    });
  });

  describe('spawnCommand', () => {
    it('should spawn an ADB command process', () => {
      const command = 'shell getevent';
      
      adbUtils.spawnCommand(command);
      
      expect(spawnStub.calledOnce).to.be.true;
      expect(spawnStub.firstCall.args[0]).to.equal('adb');
      expect(spawnStub.firstCall.args[1]).to.deep.equal(['shell', 'getevent']);
    });
    
    it('should include device ID when set', () => {
      const deviceId = 'test_device';
      const command = 'shell getevent';
      
      adbUtils.setDeviceId(deviceId);
      adbUtils.spawnCommand(command);
      
      expect(spawnStub.calledOnce).to.be.true;
      expect(spawnStub.firstCall.args[0]).to.equal('adb');
      expect(spawnStub.firstCall.args[1]).to.deep.equal(['-s', deviceId, 'shell', 'getevent']);
    });
  });

  describe('getDevices', () => {
    it('should return a list of devices', async () => {
      const mockOutput: ExecResult = { 
        stdout: 'List of devices attached\ndevice1\tdevice\ndevice2\tdevice\n',
        stderr: ''
      };
      const expectedDevices = ['device1', 'device2'];
      
      execAsyncStub.resolves(mockOutput);
      
      const devices = await adbUtils.getDevices();
      
      expect(execAsyncStub.calledOnce).to.be.true;
      expect(execAsyncStub.firstCall.args[0]).to.equal('adb devices');
      expect(devices).to.deep.equal(expectedDevices);
    });
    
    it('should return an empty array when no devices are connected', async () => {
      const mockOutput: ExecResult = { stdout: 'List of devices attached\n\n', stderr: '' };
      
      execAsyncStub.resolves(mockOutput);
      
      const devices = await adbUtils.getDevices();
      
      expect(devices).to.be.an('array').that.is.empty;
    });
  });
});