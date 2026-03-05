import { getMcpServerVersion } from "../mcpVersion";

type MigrationWarning = {
  message: string;
  stepIndex?: number;
};

type PlanMigrationReport = {
  appliedMigrations: string[];
  warnings: MigrationWarning[];
  originalVersion: string;
  targetVersion: string;
  migrated: boolean;
  outdated: boolean;
};

const parseVersion = (version: string | undefined): number[] | null => {
  if (!version || version === "unknown" || version === "latest") {
    return null;
  }
  const numericParts = version.split(".").map(part => parseInt(part.replace(/\D/g, ""), 10));
  if (numericParts.some(part => Number.isNaN(part))) {
    return null;
  }
  return numericParts.slice(0, 3);
};

const isOlderVersion = (version: string | undefined, target: string): boolean => {
  const parsedVersion = parseVersion(version);
  const parsedTarget = parseVersion(target);
  if (!parsedVersion || !parsedTarget) {
    return true;
  }
  const length = Math.max(parsedVersion.length, parsedTarget.length);
  for (let i = 0; i < length; i++) {
    const current = parsedVersion[i] ?? 0;
    const targetPart = parsedTarget[i] ?? 0;
    if (current < targetPart) {
      return true;
    }
    if (current > targetPart) {
      return false;
    }
  }
  return false;
};

const isRecord = (value: unknown): value is Record<string, any> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const recordWarning = (
  warnings: MigrationWarning[],
  message: string,
  stepIndex?: number
): void => {
  warnings.push(stepIndex === undefined ? { message } : { message, stepIndex });
};

const ensureMetadata = (plan: Record<string, any>, warnings: MigrationWarning[]): Record<string, any> => {
  if (!isRecord(plan.metadata)) {
    if (plan.metadata !== undefined) {
      recordWarning(warnings, "Plan metadata was not an object; resetting to defaults.");
    }
    plan.metadata = {};
  }
  return plan.metadata as Record<string, any>;
};

const migratePlanFields = (plan: Record<string, any>, warnings: MigrationWarning[]): boolean => {
  let changed = false;
  const metadata = ensureMetadata(plan, warnings);

  if (!plan.name && typeof plan.planName === "string") {
    plan.name = plan.planName;
    delete plan.planName;
    recordWarning(warnings, "Renamed planName to name.");
    changed = true;
  }

  if (!plan.name && typeof metadata.name === "string") {
    plan.name = metadata.name;
    delete metadata.name;
    recordWarning(warnings, "Moved metadata.name to plan name.");
    changed = true;
  }

  if (!plan.description && typeof metadata.description === "string") {
    plan.description = metadata.description;
    delete metadata.description;
    recordWarning(warnings, "Moved metadata.description to plan description.");
    changed = true;
  }

  if (typeof plan.generated === "string" && !metadata.createdAt) {
    metadata.createdAt = plan.generated;
    recordWarning(warnings, "Mapped generated timestamp to metadata.createdAt.");
    changed = true;
  }
  if (plan.generated !== undefined) {
    delete plan.generated;
    recordWarning(warnings, "Removed deprecated generated field.");
    changed = true;
  }

  if (typeof plan.appId === "string" && !metadata.appId) {
    metadata.appId = plan.appId;
    recordWarning(warnings, "Moved top-level appId to metadata.appId.");
    changed = true;
  }
  if (plan.appId !== undefined) {
    delete plan.appId;
    recordWarning(warnings, "Removed deprecated top-level appId field.");
    changed = true;
  }

  if (typeof metadata.mcpVersion === "string" && !plan.mcpVersion) {
    plan.mcpVersion = metadata.mcpVersion;
    delete metadata.mcpVersion;
    recordWarning(warnings, "Moved metadata.mcpVersion to top-level mcpVersion.");
    changed = true;
  }

  if (typeof plan.mcpVersion !== "string" || !plan.mcpVersion) {
    plan.mcpVersion = "unknown";
    recordWarning(warnings, "Defaulted missing mcpVersion to \"unknown\".");
    changed = true;
  }

  if (!metadata.createdAt) {
    metadata.createdAt = new Date().toISOString();
    recordWarning(warnings, "Defaulted missing metadata.createdAt.");
    changed = true;
  }

  if (!metadata.version) {
    metadata.version = "1.0.0";
    recordWarning(warnings, "Defaulted missing metadata.version to 1.0.0.");
    changed = true;
  }

  return changed;
};

const migrateStepFields = (
  step: Record<string, any>,
  stepIndex: number,
  warnings: MigrationWarning[]
): boolean => {
  let changed = false;

  if (!step.tool && typeof step.command === "string") {
    step.tool = step.command;
    delete step.command;
    recordWarning(warnings, "Renamed command to tool.", stepIndex);
    changed = true;
  }
  if (step.command !== undefined) {
    delete step.command;
    recordWarning(warnings, "Removed deprecated command field.", stepIndex);
    changed = true;
  }

  if (typeof step.description === "string" && !step.label) {
    step.label = step.description;
    recordWarning(warnings, "Mapped step description to label.", stepIndex);
    changed = true;
  }
  if (step.description !== undefined) {
    delete step.description;
    recordWarning(warnings, "Removed deprecated step description field.", stepIndex);
    changed = true;
  }

  const toolName = step.tool;
  if (typeof toolName !== "string") {
    return changed;
  }

  const paramsFromStep = isRecord(step.params) ? { ...step.params } : {};
  const inlineParams: Record<string, any> = {};
  for (const [key, value] of Object.entries(step)) {
    if (["tool", "command", "label", "params"].includes(key)) {
      continue;
    }
    inlineParams[key] = value;
    delete step[key];
    changed = true;
  }
  const mergedParams = { ...inlineParams, ...paramsFromStep };

  let normalizedTool = toolName;
  if (toolName === "tapOnText") {
    normalizedTool = "tapOn";
    recordWarning(warnings, "Renamed tapOnText to tapOn.", stepIndex);
    changed = true;
  }
  if (toolName === "swipeOnScreen") {
    normalizedTool = "swipeOn";
    recordWarning(warnings, "Renamed swipeOnScreen to swipeOn.", stepIndex);
    if (mergedParams.autoTarget === undefined) {
      mergedParams.autoTarget = false;
      recordWarning(warnings, "Defaulted autoTarget=false for swipeOnScreen migration.", stepIndex);
    }
    changed = true;
  }
  if (toolName === "scroll") {
    normalizedTool = "swipeOn";
    recordWarning(warnings, "Renamed scroll to swipeOn.", stepIndex);
    if (!mergedParams.gestureType) {
      mergedParams.gestureType = "scrollTowardsDirection";
      recordWarning(warnings, "Defaulted gestureType=scrollTowardsDirection for scroll migration.", stepIndex);
    }
    changed = true;
  }

  step.tool = normalizedTool;

  if (["launchApp", "terminateApp", "stopApp"].includes(normalizedTool)) {
    if (mergedParams.appId === undefined && typeof mergedParams.packageName === "string") {
      mergedParams.appId = mergedParams.packageName;
      delete mergedParams.packageName;
      recordWarning(warnings, "Renamed packageName to appId.", stepIndex);
      changed = true;
    }
    if (mergedParams.appId === undefined && typeof mergedParams.bundleId === "string") {
      mergedParams.appId = mergedParams.bundleId;
      delete mergedParams.bundleId;
      recordWarning(warnings, "Renamed bundleId to appId.", stepIndex);
      changed = true;
    }
  }

  if (normalizedTool === "tapOn") {
    if (!mergedParams.action) {
      mergedParams.action = "tap";
      recordWarning(warnings, "Defaulted tapOn.action to tap.", stepIndex);
      changed = true;
    }
    if (mergedParams.elementId === undefined && typeof mergedParams.id === "string") {
      mergedParams.elementId = mergedParams.id;
      delete mergedParams.id;
      recordWarning(warnings, "Renamed id to elementId for tapOn.", stepIndex);
      changed = true;
    }
  }

  if (normalizedTool === "inputText") {
    if (mergedParams.text === undefined && typeof mergedParams.value === "string") {
      mergedParams.text = mergedParams.value;
      delete mergedParams.value;
      recordWarning(warnings, "Renamed inputText.value to text.", stepIndex);
      changed = true;
    }
  }

  if (normalizedTool === "openLink") {
    if (mergedParams.url === undefined && typeof mergedParams.link === "string") {
      mergedParams.url = mergedParams.link;
      delete mergedParams.link;
      recordWarning(warnings, "Renamed openLink.link to url.", stepIndex);
      changed = true;
    }
  }

  if (normalizedTool === "swipeOn") {
    const container = isRecord(mergedParams.container) ? { ...mergedParams.container } : {};
    if (typeof mergedParams.containerElementId === "string" && !container.elementId) {
      container.elementId = mergedParams.containerElementId;
      delete mergedParams.containerElementId;
      recordWarning(warnings, "Renamed containerElementId to container.elementId.", stepIndex);
      changed = true;
    }
    if (typeof mergedParams.containerText === "string" && !container.text) {
      container.text = mergedParams.containerText;
      delete mergedParams.containerText;
      recordWarning(warnings, "Renamed containerText to container.text.", stepIndex);
      changed = true;
    }
    if (Object.keys(container).length > 0) {
      mergedParams.container = container;
    }
    if (mergedParams.duration !== undefined) {
      if (!mergedParams.speed && typeof mergedParams.duration === "number") {
        mergedParams.speed = mergedParams.duration >= 800 ? "slow" : mergedParams.duration <= 250 ? "fast" : "normal";
        recordWarning(warnings, "Mapped swipe duration to speed.", stepIndex);
      }
      delete mergedParams.duration;
      recordWarning(warnings, "Removed deprecated swipe duration field.", stepIndex);
      changed = true;
    }
    if (mergedParams.scrollMode !== undefined) {
      delete mergedParams.scrollMode;
      recordWarning(warnings, "Removed deprecated scrollMode field.", stepIndex);
      changed = true;
    }
  }

  if (normalizedTool === "observe") {
    if (mergedParams.withViewHierarchy !== undefined) {
      delete mergedParams.withViewHierarchy;
      recordWarning(warnings, "Removed deprecated observe.withViewHierarchy field.", stepIndex);
      changed = true;
    }
  }

  step.params = mergedParams;

  return changed;
};

export const migratePlan = (rawPlan: unknown): { plan: Record<string, any>; report: PlanMigrationReport } => {
  if (!isRecord(rawPlan)) {
    throw new Error("Plan is not a valid object");
  }

  const warnings: MigrationWarning[] = [];
  const plan = rawPlan;
  const targetVersion = getMcpServerVersion();
  const originalVersion = typeof plan.mcpVersion === "string" ? plan.mcpVersion : typeof plan.metadata?.mcpVersion === "string" ? plan.metadata.mcpVersion : "unknown";
  const outdated = isOlderVersion(originalVersion, targetVersion);

  let migrated = false;
  const appliedMigrations: string[] = [];

  const planChanged = migratePlanFields(plan, warnings);
  if (planChanged) {
    appliedMigrations.push("plan-fields");
    migrated = true;
  }

  if (Array.isArray(plan.steps)) {
    let stepsChanged = false;
    plan.steps = plan.steps.map((step, index) => {
      if (!isRecord(step)) {
        return step;
      }
      const stepChanged = migrateStepFields(step, index, warnings);
      stepsChanged = stepsChanged || stepChanged;
      return step;
    });
    if (stepsChanged) {
      appliedMigrations.push("step-fields");
      migrated = true;
    }
  }

  return {
    plan,
    report: {
      appliedMigrations,
      warnings,
      originalVersion,
      targetVersion,
      migrated,
      outdated
    }
  };
};
