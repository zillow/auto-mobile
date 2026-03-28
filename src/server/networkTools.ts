import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { createJSONToolResponse } from "../utils/toolUtils";
import { addDeviceTargetingToSchema } from "./toolSchemaHelpers";
import { NetworkState, type SimulatedErrorType } from "./NetworkState";
import { getNetworkEvents } from "../db/networkEventRepository";
import { buildNetworkGraph } from "./networkGraph";
import { serverConfig } from "../utils/ServerConfig";
import { ActionableError } from "../models";
import { defaultTimer } from "../utils/SystemTimer";
import { CtrlProxyClient } from "../features/observe/android";
import type { BootedDevice } from "../utils/deviceUtils";
import { logger } from "../utils/logger";

// --- network tool ---

const simulateErrorsSchema = z.object({
  errorType: z
    .enum(["http500", "timeout", "connectionRefused", "dnsFailure", "tlsFailure"])
    .optional()
    .describe("Type of error to simulate. Default: http500"),
  limit: z.number().int().positive().optional().describe("Max errors to inject. Omit for unlimited"),
  durationSeconds: z.number().positive().optional().describe("How long to simulate errors. Required unless cancel is true"),
  cancel: z.boolean().optional().describe("Set to true to cancel active simulation"),
});

const networkSchema = addDeviceTargetingToSchema(
  z.object({
    capture: z.boolean().optional().describe("Toggle network capture on/off"),
    simulateErrors: simulateErrorsSchema
      .optional()
      .describe("Start error simulation, or set cancel:true to stop"),
    notifFilter: z
      .enum(["all", "errors", "slow"])
      .optional()
      .describe("Filter which events trigger resource notifications"),
    notifDebounceMs: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Debounce interval for notifications in ms. Default: 100"),
    slowThresholdMs: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Duration threshold in ms for 'slow' filter. Default: 2000"),
  })
);

type NetworkArgs = z.infer<typeof networkSchema>;

// --- mockNetwork tool ---

const mockNetworkSchema = addDeviceTargetingToSchema(
  z.object({
    host: z.string().describe("Host pattern (regex)"),
    path: z.string().describe("Path pattern (regex)"),
    method: z.string().optional().describe("HTTP method to match. Default: * (any)"),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Number of times to serve mock before reverting. Omit for unlimited"),
    statusCode: z.number().int().min(100).max(599).optional().describe("Response status code. Default: 200"),
    responseHeaders: z
      .record(z.string(), z.string())
      .optional()
      .describe("Response headers"),
    responseBody: z.string().optional().describe("Response body (max 10KB)"),
    contentType: z.string().optional().describe("Content-Type header. Default: application/json"),
  })
);

type MockNetworkArgs = z.infer<typeof mockNetworkSchema>;

// --- clearMockNetwork tool ---

const clearMockNetworkSchema = addDeviceTargetingToSchema(
  z.object({
    mockId: z.string().optional().describe("ID of specific mock to clear. Omit to clear all"),
  })
);

type ClearMockNetworkArgs = z.infer<typeof clearMockNetworkSchema>;

// --- getNetworkGraph tool ---

const getNetworkGraphSchema = addDeviceTargetingToSchema(
  z.object({
    sinceSeconds: z
      .number()
      .positive()
      .optional()
      .describe("Only include traffic from the last N seconds"),
    method: z.string().optional().describe("Filter by HTTP method"),
    minRequests: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Exclude endpoints with fewer requests. Default: 1"),
  })
);

type GetNetworkGraphArgs = z.infer<typeof getNetworkGraphSchema>;

function syncMockRulesToDevice(device: BootedDevice, state: NetworkState): void {
  if (device.platform !== "android") {return;}
  try {
    const client = CtrlProxyClient.getInstance(device);
    // Use limit (not remaining) since the server never tracks consumption —
    // the device-side NetworkMockRuleStore manages its own remaining count
    const rules = Array.from(state.getMocks().values()).map(r => ({
      mockId: r.mockId,
      host: r.host,
      path: r.path,
      method: r.method,
      limit: r.limit,
      remaining: r.limit,
      statusCode: r.statusCode,
      responseHeaders: r.responseHeaders,
      responseBody: r.responseBody,
      contentType: r.contentType,
    }));
    const msg = JSON.stringify({ type: "set_network_mock_rules", rules });
    const sent = (client as any).sendMessage(msg);
    logger.info(`[networkTools] syncMockRules: ${rules.length} rules, sent=${sent}`);
  } catch (e) {
    logger.info(`[networkTools] Failed to sync mock rules to device: ${e}`);
  }
}

function syncErrorSimulationToDevice(device: BootedDevice, state: NetworkState): void {
  if (device.platform !== "android") {return;}
  try {
    const client = CtrlProxyClient.getInstance(device);
    const sim = state.simulation;
    client.sendMessage(JSON.stringify({
      type: "set_network_error_simulation",
      enabled: sim !== null,
      errorType: sim?.errorType ?? null,
      limit: sim?.limit ?? null,
      expiresAtEpochMs: sim?.expiresAt ?? null,
    }));
  } catch (e) {
    logger.debug(`[networkTools] Failed to sync error simulation to device: ${e}`);
  }
}

export function registerNetworkTools(): void {
  const state = NetworkState.getInstance();

  // --- network ---
  ToolRegistry.registerDeviceAware(
    "network",
    "Control network capture, error simulation, and notification settings. Call with no args to read current state.",
    networkSchema,
    async (device, args: NetworkArgs) => {
      if (args.capture !== undefined) {
        state.setCapture(args.capture);
      }

      if (args.simulateErrors !== undefined) {
        if (device.platform !== "android") {
          throw new ActionableError(
            "Network error simulation is only supported on Android devices."
          );
        }
        if (args.simulateErrors.cancel) {
          state.cancelSimulation();
        } else {
          if (!args.simulateErrors.durationSeconds) {
            throw new ActionableError("durationSeconds is required unless cancel is true");
          }
          const errorType: SimulatedErrorType =
            args.simulateErrors.errorType ?? "http500";
          state.startSimulation(
            errorType,
            args.simulateErrors.durationSeconds,
            args.simulateErrors.limit ?? null
          );
        }
        syncErrorSimulationToDevice(device, state);
      }

      if (args.notifFilter !== undefined) {
        state.setNotifFilter(args.notifFilter);
      }
      if (args.notifDebounceMs !== undefined) {
        state.setNotifDebounceMs(args.notifDebounceMs);
      }
      if (args.slowThresholdMs !== undefined) {
        state.setSlowThresholdMs(args.slowThresholdMs);
      }

      return createJSONToolResponse(state.getSnapshot());
    }
  );

  // --- mockNetwork ---
  ToolRegistry.registerDeviceAware(
    "mockNetwork",
    "Add a mock response rule for matching network requests. Requires --network-mockable flag.",
    mockNetworkSchema,
    async (device, args: MockNetworkArgs) => {
      if (!serverConfig.isNetworkMockableEnabled()) {
        throw new ActionableError(
          "Network mocking is disabled. Start the server with --network-mockable to enable."
        );
      }
      if (device.platform !== "android") {
        throw new ActionableError(
          "Network mocking is only supported on Android devices."
        );
      }

      const mock = state.addMock({
        host: args.host,
        path: args.path,
        method: args.method ?? "*",
        limit: args.limit ?? null,
        remaining: args.limit ?? null,
        statusCode: args.statusCode ?? 200,
        responseHeaders: args.responseHeaders ?? {},
        responseBody: args.responseBody ?? "",
        contentType: args.contentType ?? "application/json",
      });

      syncMockRulesToDevice(device, state);

      return createJSONToolResponse({
        mockId: mock.mockId,
        mocked: state.getMockSummary(),
      });
    }
  );

  // --- clearMockNetwork ---
  ToolRegistry.registerDeviceAware(
    "clearMockNetwork",
    "Clear mock network response rules. Optionally target a specific mock by ID. Requires --network-mockable flag.",
    clearMockNetworkSchema,
    async (device, args: ClearMockNetworkArgs) => {
      if (!serverConfig.isNetworkMockableEnabled()) {
        throw new ActionableError(
          "Network mocking is disabled. Start the server with --network-mockable to enable."
        );
      }
      if (device.platform !== "android") {
        throw new ActionableError(
          "Network mocking is only supported on Android devices."
        );
      }

      let cleared: number;
      if (args.mockId) {
        cleared = state.removeMock(args.mockId) ? 1 : 0;
        if (cleared === 0) {
          throw new ActionableError(`Mock '${args.mockId}' not found`);
        }
      } else {
        cleared = state.clearAllMocks();
      }

      syncMockRulesToDevice(device, state);

      return createJSONToolResponse({
        cleared,
        remaining: state.getMockSummary(),
      });
    }
  );

  // --- getNetworkGraph ---
  ToolRegistry.registerDeviceAware(
    "getNetworkGraph",
    "Get an aggregate URL tree of captured network traffic with stats (success/error counts, p50/p95 latency).",
    getNetworkGraphSchema,
    async (device, args: GetNetworkGraphArgs) => {
      const sinceTimestamp = args.sinceSeconds
        ? defaultTimer.now() - args.sinceSeconds * 1000
        : undefined;

      const events = await getNetworkEvents({
        deviceId: device.deviceId,
        sinceTimestamp,
        method: args.method,
        limit: 10_000,
      });

      const graph = buildNetworkGraph(events, {
        minRequests: args.minRequests,
      });

      return createJSONToolResponse(graph);
    }
  );
}
