// import { expect } from "chai";
// import { DeviceUtils } from "../src/utils/deviceUtils";
//
// describe("DeviceUtils", function() {
//   let deviceUtils: DeviceUtils;
//   let testAvdName: string;
//
//   this.timeout(30000); // Give more time for emulator operations
//
//   beforeEach(() => {
//     deviceUtils = new DeviceUtils();
//     testAvdName = "Medium_Phone_API_35"; // Use the known test AVD
//   });
//
//   describe("listDeviceImages", () => {
//     it("should list available AVDs", async () => {
//       const avds = await deviceUtils.listDeviceImages();
//       expect(avds).to.be.an("array");
//       // We know there's at least one AVD from our earlier testing
//       expect(avds.length).to.be.greaterThan(0);
//       expect(avds).to.include("Medium_Phone_API_35");
//     });
//   });
//
//   describe("getRunningEmulators", () => {
//     it("should get running emulators", async () => {
//       const runningEmulators = await deviceUtils.getRunningEmulators();
//       expect(runningEmulators).to.be.an("array");
//
//       // Each emulator should have the required properties
//       runningEmulators.forEach(emulator => {
//         expect(emulator).to.have.property("name");
//         expect(emulator).to.have.property("isRunning");
//         expect(emulator).to.have.property("deviceId");
//         expect(emulator.isRunning).to.be.true;
//       });
//     });
//   });
//
//   describe("isAvdRunning", () => {
//     it("should check if specific AVD is running", async () => {
//       // First get the list of running emulators
//       const runningEmulators = await deviceUtils.getRunningEmulators();
//
//       if (runningEmulators.length > 0) {
//         // Test with a running emulator
//         const runningEmulator = runningEmulators[0];
//         const isRunning = await deviceUtils.isAvdRunning(runningEmulator.name);
//         expect(isRunning).to.be.true;
//       } else {
//         // If no emulators are running, test with the known AVD which should be false
//         const isRunning = await deviceUtils.isAvdRunning("Medium_Phone_API_35");
//         expect(isRunning).to.be.false;
//       }
//     });
//
//     it("should return false for non-existent AVD", async () => {
//       const isRunning = await deviceUtils.isAvdRunning("NonExistentAVD");
//       expect(isRunning).to.be.false;
//     });
//   });
//
//   describe("startDevice", () => {
//     it("should fail to start non-existent AVD", async () => {
//       try {
//         await deviceUtils.startDevice("NonExistentAVD");
//         expect.fail("Should have thrown an error for non-existent AVD");
//       } catch (error) {
//         expect(error).to.be.an("error");
//         expect((error as Error).message).to.include("not found");
//       }
//     });
//
//     it("should fail to start already running AVD", async function() {
//       // First check if any emulator is already running
//       const runningEmulators = await deviceUtils.getRunningEmulators();
//
//       if (runningEmulators.length > 0) {
//         const runningAvd = runningEmulators[0].name;
//         try {
//           await deviceUtils.startDevice(runningAvd);
//           expect.fail("Should have thrown an error for already running AVD");
//         } catch (error) {
//           expect(error).to.be.an("error");
//           expect((error as Error).message).to.include("already running");
//         }
//       } else {
//         // Skip this test if no emulators are running
//         this.skip();
//       }
//     });
//
//     it("should return a child process when starting valid AVD", async function() {
//       // Only run this test if the AVD is not already running
//       const isRunning = await deviceUtils.isAvdRunning(testAvdName);
//
//       if (isRunning) {
//         this.skip(); // Skip if already running to avoid conflicts
//         return;
//       }
//
//       const childProcess = await deviceUtils.startDevice(testAvdName);
//       expect(childProcess).to.exist;
//       expect(childProcess.pid).to.be.a("number");
//
//       // Clean up: kill the emulator we just started
//       // Wait a moment for it to register
//       await new Promise(resolve => setTimeout(resolve, 3000));
//
//       try {
//         await deviceUtils.killEmulator(testAvdName);
//       } catch (error) {
//         // If kill fails, try to clean up with adb
//         console.warn("Failed to kill emulator cleanly, it may still be starting up");
//       }
//     });
//   });
//
//   describe("killDevice", () => {
//     it("should kill running AVD", async () => {
//       // Make sure the test AVD is not running
//       const isRunning = await deviceUtils.isAvdRunning(testAvdName);
//
//       if (!isRunning) {
//         // Start the emulator and wait for it to be ready
//         await deviceUtils.startDevice(testAvdName);
//         await deviceUtils.waitForDeviceReady(testAvdName);
//       }
//
//       await deviceUtils.killEmulator(testAvdName);
//       await new Promise(resolve => setTimeout(resolve, 2000));
//
//       // Check if it's truly not running after kill
//       const isStillRunning = await deviceUtils.isAvdRunning(testAvdName);
//       expect(isStillRunning).to.be.false;
//     });
//   });
//
//   describe("waitForDeviceReady", () => {
//     it("should timeout when waiting for non-existent emulator", async () => {
//       try {
//         await deviceUtils.waitForDeviceReady("NonExistentAVD", 5000); // 5 second timeout
//         expect.fail("Should have thrown a timeout error");
//       } catch (error) {
//         expect(error).to.be.an("error");
//         expect((error as Error).message).to.include("failed to become ready");
//       }
//     });
//
//     it("should return device ID for already running emulator", async function() {
//       // Check if any emulator is running
//       const runningEmulators = await deviceUtils.getRunningEmulators();
//
//       if (runningEmulators.length > 0) {
//         const runningAvd = runningEmulators[0];
//
//         // Should immediately return the device ID since it's already ready
//         const deviceId = await deviceUtils.waitForDeviceReady(runningAvd.name, 10000);
//         expect(deviceId).to.be.a("string");
//         expect(deviceId).to.equal(runningAvd.deviceId);
//       } else {
//         // Skip this test if no emulators are running
//         this.skip();
//       }
//     });
//   });
// });
