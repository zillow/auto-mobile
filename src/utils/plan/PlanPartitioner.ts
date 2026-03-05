import { Plan, PlanStep } from "../../models/Plan";
import { getPlanDeviceLabels } from "./PlanDevices";

/**
 * Represents a step in a device track with position tracking.
 */
export interface TrackedStep {
  step: PlanStep;
  planIndex: number; // Original position in the plan
  trackIndex: number; // Position in this device's track
}

/**
 * Represents a critical section barrier in the execution timeline.
 */
interface CriticalSectionBarrier {
  type: "barrier";
  step: PlanStep;
  planIndex: number;
}

/**
 * Represents a regular device step in the execution timeline.
 */
interface DeviceStepEntry {
  type: "step";
  device: string;
  trackedStep: TrackedStep;
}

/**
 * Union type for timeline entries.
 */
type TimelineEntry = CriticalSectionBarrier | DeviceStepEntry;

/**
 * Result of partitioning a plan into device tracks.
 */
interface PartitionedPlan {
  devices: string[];
  deviceTracks: Map<string, TrackedStep[]>; // device -> ordered steps for that device
  timeline: TimelineEntry[]; // Ordered list of all steps and barriers
}

/**
 * Partitions a multi-device plan into parallel device tracks.
 *
 * For single-device plans (no devices field), returns null to indicate
 * sequential execution should be used.
 */
export class PlanPartitioner {
  /**
   * Partitions a plan into device tracks if it's a multi-device plan.
   * Returns null for single-device plans.
   */
  static partition(plan: Plan): PartitionedPlan | null {
    // If no devices declared, use sequential execution
    if (!plan.devices || plan.devices.length === 0) {
      return null;
    }

    // Single device with devices array is still multi-device mode
    // (for consistency and to enable critical sections)
    const devices = getPlanDeviceLabels(plan.devices);
    const deviceTracks = new Map<string, TrackedStep[]>();
    const timeline: TimelineEntry[] = [];

    // Initialize tracks for each device
    for (const device of devices) {
      deviceTracks.set(device, []);
    }

    // Track position within each device's track
    const trackPositions = new Map<string, number>();
    for (const device of devices) {
      trackPositions.set(device, 0);
    }

    // Partition steps into device tracks
    for (let planIndex = 0; planIndex < plan.steps.length; planIndex++) {
      const step = plan.steps[planIndex];

      // Critical sections are barriers that all devices must reach
      if (step.tool === "criticalSection") {
        timeline.push({
          type: "barrier",
          step,
          planIndex,
        });

        // Add critical section to ALL device tracks at this position
        // so each device will independently call it and coordinate via the coordinator
        for (const device of devices) {
          const track = deviceTracks.get(device)!;
          const trackIndex = trackPositions.get(device)!;
          const trackedStep: TrackedStep = {
            step,
            planIndex,
            trackIndex,
          };
          track.push(trackedStep);
          trackPositions.set(device, trackIndex + 1);
        }

        continue;
      }

      // Regular step - assign to device track
      const device = step.params?.device;

      if (!device) {
        // This should have been caught by validation, but handle gracefully
        throw new Error(
          `Step ${planIndex} (${step.tool}) missing device parameter. This should have been caught during validation.`
        );
      }

      const track = deviceTracks.get(device);
      if (!track) {
        throw new Error(
          `Step ${planIndex} references unknown device "${device}". Declared devices: [${devices.join(", ")}]`
        );
      }

      const trackIndex = trackPositions.get(device)!;
      const trackedStep: TrackedStep = {
        step,
        planIndex,
        trackIndex,
      };

      track.push(trackedStep);
      trackPositions.set(device, trackIndex + 1);

      timeline.push({
        type: "step",
        device,
        trackedStep,
      });
    }

    return {
      devices,
      deviceTracks,
      timeline,
    };
  }

  /**
   * Gets the device label for a step at a given plan index.
   * Returns undefined for critical sections.
   */
  static getStepDevice(plan: Plan, planIndex: number): string | undefined {
    if (planIndex < 0 || planIndex >= plan.steps.length) {
      return undefined;
    }

    const step = plan.steps[planIndex];
    if (step.tool === "criticalSection") {
      return undefined;
    }

    return step.params?.device;
  }

  /**
   * Checks if a plan uses multi-device execution.
   */
  static isMultiDevicePlan(plan: Plan): boolean {
    return plan.devices !== undefined && plan.devices.length > 0;
  }
}
