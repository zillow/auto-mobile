import { Plan } from "../../models/Plan";
import { ActionableError } from "../../models";

/**
 * Validates a plan structure and enforces multi-device rules.
 */
export class PlanValidator {
  // Tools that don't require device labels (exceptions to the rule)
  private static readonly DEVICE_AGNOSTIC_TOOLS = new Set(["criticalSection"]);

  /**
   * Validates a plan and throws ActionableError if invalid.
   * @param plan Plan to validate
   * @throws ActionableError if validation fails
   */
  static validate(plan: Plan): void {
    // Validate basic structure
    if (!plan.name || typeof plan.name !== "string") {
      throw new ActionableError("Plan must have a valid name");
    }

    if (!plan.steps || !Array.isArray(plan.steps)) {
      throw new ActionableError("Plan must have a steps array");
    }

    // Validate multi-device requirements
    this.validateMultiDeviceRequirements(plan);

    // Validate devices field if present
    if (plan.devices !== undefined) {
      this.validateDevicesField(plan);
      this.validateDeviceLabelsPresent(plan);
    }
  }

  /**
   * Validates the devices field structure.
   */
  private static validateDevicesField(plan: Plan): void {
    if (!Array.isArray(plan.devices)) {
      throw new ActionableError(
        "Plan 'devices' field must be an array of device labels"
      );
    }

    if (plan.devices.length === 0) {
      throw new ActionableError(
        "Plan 'devices' array cannot be empty. Remove the field or specify at least one device."
      );
    }

    // Check for duplicates
    const uniqueDevices = new Set(plan.devices);
    if (uniqueDevices.size !== plan.devices.length) {
      throw new ActionableError(
        `Plan 'devices' array contains duplicate labels: [${plan.devices.join(", ")}]`
      );
    }

    // Validate each device label
    for (const device of plan.devices) {
      if (typeof device !== "string" || device.trim() === "") {
        throw new ActionableError(
          `Invalid device label: ${JSON.stringify(device)}. Device labels must be non-empty strings.`
        );
      }
    }
  }

  /**
   * Validates that all steps have device labels when devices field is present.
   * Exception: criticalSection and other device-agnostic tools don't need labels.
   */
  private static validateDeviceLabelsPresent(plan: Plan): void {
    if (!plan.devices || plan.devices.length === 0) {
      return;
    }

    const deviceSet = new Set(plan.devices);
    const missingLabels: Array<{ index: number; tool: string }> = [];
    const invalidLabels: Array<{ index: number; tool: string; device: string }> = [];

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];

      // Skip device-agnostic tools
      if (this.DEVICE_AGNOSTIC_TOOLS.has(step.tool)) {
        continue;
      }

      // Check if device parameter exists
      const device = step.params?.device;

      if (device === undefined || device === null || device === "") {
        missingLabels.push({ index: i, tool: step.tool });
        continue;
      }

      // Validate device label is in the declared devices list
      if (!deviceSet.has(device)) {
        invalidLabels.push({ index: i, tool: step.tool, device });
      }
    }

    // Report all validation errors
    const errors: string[] = [];

    if (missingLabels.length > 0) {
      const steps = missingLabels
        .map(m => `step ${m.index} (${m.tool})`)
        .join(", ");
      errors.push(
        `Plan declares 'devices' field but the following steps are missing 'device' parameter: ${steps}`
      );
    }

    if (invalidLabels.length > 0) {
      const steps = invalidLabels
        .map(m => `step ${m.index} (${m.tool}): device="${m.device}"`)
        .join(", ");
      errors.push(
        `Plan declares devices [${plan.devices.join(", ")}] but the following steps use invalid device labels: ${steps}`
      );
    }

    if (errors.length > 0) {
      throw new ActionableError(errors.join("\n"));
    }
  }

  /**
   * Checks if a plan uses multi-device features (devices field or device labels).
   * This determines if the plan requires the devices field to be declared.
   */
  static hasMultiDeviceFeatures(plan: Plan): boolean {
    // Check if devices field is present
    if (plan.devices && plan.devices.length > 0) {
      return true;
    }

    // Check if any step uses device parameter or criticalSection
    for (const step of plan.steps) {
      if (step.tool === "criticalSection") {
        return true;
      }
      if (step.params?.device !== undefined) {
        return true;
      }
    }

    return false;
  }

  /**
   * Validates that if a plan uses multi-device features, it must declare devices.
   */
  static validateMultiDeviceRequirements(plan: Plan): void {
    const hasFeatures = this.hasMultiDeviceFeatures(plan);

    // If plan uses device labels or criticalSection, it must declare devices
    if (hasFeatures && (!plan.devices || plan.devices.length === 0)) {
      throw new ActionableError(
        "Plan uses multi-device features (device labels or criticalSection) but does not declare 'devices' field. " +
          "Add a 'devices' array at the top level of your plan."
      );
    }
  }
}
