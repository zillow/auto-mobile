/**
 * Backward compatibility layer for planUtils
 * Re-exports functions from the new focused modules
 *
 * @deprecated Use PlanSerializer and PlanExecutor classes directly instead
 */

import { YamlPlanSerializer } from "./plan/PlanSerializer";
import { DefaultPlanExecutor } from "./plan/PlanExecutor";
// Create singleton instances
const serializer = new YamlPlanSerializer();
const executor = new DefaultPlanExecutor();

// Re-export functions for backward compatibility
export const exportPlanFromLogs = serializer.exportPlanFromLogs.bind(serializer);
export const importPlanFromYaml = serializer.importPlanFromYaml.bind(serializer);
export const executePlan = executor.executePlan.bind(executor);
