export type FeatureFlagKey =
  | "debug"
  | "debug-perf"
  | "ui-perf-mode"
  | "ui-perf-debug"
  | "mem-perf-audit"
  | "accessibility-audit"
  | "predictive-ui"
  | "force-accessibility-mode"
  | "accessibility-auto-detect";

export type FeatureFlagConfig = Record<string, unknown>;

export interface FeatureFlagDefinition {
  key: FeatureFlagKey;
  label: string;
  description: string;
  defaultValue: boolean;
  defaultConfig?: FeatureFlagConfig;
}

export const FEATURE_FLAG_DEFINITIONS: FeatureFlagDefinition[] = [
  {
    key: "debug",
    label: "Debug mode",
    description: "Enable debug tools and include extra debug data in responses.",
    defaultValue: false,
  },
  {
    key: "debug-perf",
    label: "Debug perf (--debug-perf)",
    description: "Collect performance timing data in tool responses.",
    defaultValue: false,
  },
  {
    key: "ui-perf-mode",
    label: "UI performance audit",
    description: "Run UI performance audits during observe.",
    defaultValue: false,
  },
  {
    key: "ui-perf-debug",
    label: "UI performance debug",
    description: "Capture recomposition summaries and store recomposition metrics.",
    defaultValue: false,
  },
  {
    key: "mem-perf-audit",
    label: "Memory audit",
    description: "Run memory audits during tool execution.",
    defaultValue: false,
  },
  {
    key: "accessibility-audit",
    label: "Accessibility audit",
    description: "Run accessibility audits during observe.",
    defaultValue: false,
    defaultConfig: {
      level: "AA",
      failureMode: "report",
      minSeverity: "warning",
      useBaseline: false,
    },
  },
  {
    key: "predictive-ui",
    label: "Predictive UI",
    description: "Enable predictive UI state generation during observe.",
    defaultValue: false,
  },
  {
    key: "force-accessibility-mode",
    label: "Force accessibility mode",
    description: "Force-enable accessibility mode for testing (overrides auto-detection).",
    defaultValue: false,
  },
  {
    key: "accessibility-auto-detect",
    label: "Accessibility auto-detect",
    description: "Automatically detect and adapt to TalkBack/VoiceOver when enabled.",
    defaultValue: true,
  },
];
