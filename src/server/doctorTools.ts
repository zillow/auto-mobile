/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { createJSONToolResponse } from "../utils/toolUtils";
import { runDoctor } from "../doctor";

/**
 * Schema for the doctor tool
 */
export const doctorSchema = z.object({
  android: z.boolean().optional().describe("Run Android-specific checks only"),
  ios: z.boolean().optional().describe("Run iOS-specific checks only"),
  installCmdlineTools: z.boolean().optional().describe(
    "Automatically download and install Android SDK Command-line Tools to ANDROID_HOME if missing"
  ),
}).strict();

/**
 * Arguments for the doctor tool
 */
export interface DoctorArgs {
  android?: boolean;
  ios?: boolean;
  installCmdlineTools?: boolean;
}

/**
 * Register the doctor diagnostic tool
 */
export function registerDoctorTools(): void {
  ToolRegistry.register(
    "doctor",
    "Run diagnostic checks to verify AutoMobile setup and environment configuration",
    doctorSchema,
    async (args: DoctorArgs) => {
      const report = await runDoctor({
        android: args.android,
        ios: args.ios,
        installCmdlineTools: args.installCmdlineTools,
      });

      return createJSONToolResponse(report);
    }
  );
}
