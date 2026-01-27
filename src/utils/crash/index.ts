// Crash monitoring module
export { LogcatCrashDetector } from "./LogcatCrashDetector";
export { ProcessStateCrashDetector } from "./ProcessStateCrashDetector";
export { TombstoneAnalyzer } from "./TombstoneAnalyzer";
export { DropboxCrashDetector } from "./DropboxCrashDetector";
export { AccessibilityDialogDetector } from "./AccessibilityDialogDetector";
export {
  CrashMonitorCoordinator,
  CrashMonitorCoordinatorDependencies,
} from "./CrashMonitorCoordinator";

// Re-export interfaces from central location
export type {
  CrashMonitor,
  CrashDetector,
  CrashEvent,
  AnrEvent,
  FailureEvent,
  CrashType,
  CrashDetectionSource,
  AnrDetectionSource,
  CrashEventListener,
  AnrEventListener,
  CrashMonitorConfig,
  ParsedCrash,
  ParsedAnr,
} from "../interfaces/CrashMonitor";
