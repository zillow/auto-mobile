import { setDebugPerfEnabled } from "../../utils/PerformanceTracker";
import { setDebugModeEnabled } from "../../utils/debug";
import { serverConfig } from "../../utils/ServerConfig";
import type { FeatureFlagConfig, FeatureFlagKey } from "./FeatureFlagDefinitions";
import type { AccessibilityAuditConfig } from "../../models/AccessibilityAudit";

export interface FeatureFlagApplier {
  apply(key: FeatureFlagKey, enabled: boolean, config?: FeatureFlagConfig | null): void;
}

const DEFAULT_ACCESSIBILITY_CONFIG: AccessibilityAuditConfig = {
  level: "AA",
  failureMode: "report",
  useBaseline: false,
  minSeverity: "warning",
};

export class DefaultFeatureFlagApplier implements FeatureFlagApplier {
  apply(key: FeatureFlagKey, enabled: boolean, config?: FeatureFlagConfig | null): void {
    switch (key) {
      case "debug":
        setDebugModeEnabled(enabled);
        break;
      case "debug-perf":
        setDebugPerfEnabled(enabled);
        break;
      case "ui-perf-mode":
        serverConfig.setUiPerfMode(enabled);
        break;
      case "ui-perf-debug":
        serverConfig.setUiPerfDebugMode(enabled);
        break;
      case "mem-perf-audit":
        serverConfig.setMemPerfAuditMode(enabled);
        break;
      case "accessibility-audit":
        serverConfig.setAccessibilityAuditConfig(
          enabled ? applyAccessibilityConfig(config) : null
        );
        break;
      case "predictive-ui":
        serverConfig.setPredictiveUiEnabled(enabled);
        break;
    }
  }
}

const applyAccessibilityConfig = (config?: FeatureFlagConfig | null): AccessibilityAuditConfig => {
  if (!config) {
    return DEFAULT_ACCESSIBILITY_CONFIG;
  }

  const level =
    config.level === "A" || config.level === "AA" || config.level === "AAA"
      ? config.level
      : DEFAULT_ACCESSIBILITY_CONFIG.level;
  const failureMode =
    config.failureMode === "report" || config.failureMode === "threshold" || config.failureMode === "strict"
      ? config.failureMode
      : DEFAULT_ACCESSIBILITY_CONFIG.failureMode;
  const minSeverity =
    config.minSeverity === "error" || config.minSeverity === "warning" || config.minSeverity === "info"
      ? config.minSeverity
      : DEFAULT_ACCESSIBILITY_CONFIG.minSeverity;
  const useBaseline =
    typeof config.useBaseline === "boolean"
      ? config.useBaseline
      : DEFAULT_ACCESSIBILITY_CONFIG.useBaseline;

  return {
    level,
    failureMode,
    minSeverity,
    useBaseline,
  };
};
