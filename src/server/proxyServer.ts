import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../utils/logger";
import { DaemonMcpProxy, type DaemonMcpProxyConfig } from "../daemon/daemonMcpProxy";
import { ActionableError } from "../models";
import { getMcpServerVersion } from "../utils/mcpVersion";

/**
 * Options for creating a proxy MCP server
 */
export interface ProxyMcpServerOptions {
  /** Configuration for the daemon proxy */
  proxyConfig?: DaemonMcpProxyConfig;
  /** Session context for tracking */
  sessionContext?: { sessionId?: string };
}

/**
 * Create an MCP server that proxies all requests through the daemon
 *
 * This server acts as a thin proxy layer that:
 * - Forwards tool calls to the daemon
 * - Forwards resource requests to the daemon
 * - Maintains the same MCP interface expected by clients
 *
 * Benefits:
 * - IDE plugins get a stable stdio/SSE connection
 * - All actual work happens in the daemon
 * - Device state is managed centrally by daemon
 * - Less process churn (daemon stays running)
 */
export function createProxyMcpServer(options: ProxyMcpServerOptions = {}): {
  server: McpServer;
  proxy: DaemonMcpProxy;
} {
  const proxy = new DaemonMcpProxy(options.proxyConfig);

  // Create the MCP server
  const server = new McpServer({
    name: "AutoMobile",
    version: getMcpServerVersion(),
  }, {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  });

  // Register ping handler as per MCP specification
  const PingRequestSchema = require("@modelcontextprotocol/sdk/types.js").PingRequestSchema;
  server.server.setRequestHandler(PingRequestSchema, async () => {
    return {};
  });

  // Register prompts list handler (returns empty list)
  const ListPromptsRequestSchema = require("@modelcontextprotocol/sdk/types.js").ListPromptsRequestSchema;
  server.server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [],
    };
  });

  // Register tools/list handler - forward to daemon
  server.server.setRequestHandler(ListToolsRequestSchema, async () => {
    try {
      const tools = await proxy.listTools();
      return { tools };
    } catch (error) {
      logger.error(`[ProxyServer] Failed to list tools: ${error}`);
      throw new ActionableError(
        `Failed to list tools from daemon: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Register tools/call handler - forward to daemon
  server.server.setRequestHandler(CallToolRequestSchema, async request => {
    const name = request.params.name;
    const args = (request.params.arguments || {}) as Record<string, unknown>;

    if (!name) {
      throw new ActionableError("Tool name is missing in the request");
    }

    logger.info(`[ProxyServer] Forwarding tool call: ${name}`);

    try {
      const result = await proxy.callTool(name, args);
      return result;
    } catch (error) {
      logger.error(`[ProxyServer] Tool call failed: ${name} - ${error}`);
      // Return error as tool result (not throwing) to match expected MCP behavior
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Register resources/list handler - forward to daemon
  server.server.setRequestHandler(ListResourcesRequestSchema, async () => {
    try {
      const resources = await proxy.listResources();
      return { resources };
    } catch (error) {
      logger.error(`[ProxyServer] Failed to list resources: ${error}`);
      throw new ActionableError(
        `Failed to list resources from daemon: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Register resources/templates/list handler - forward to daemon
  server.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    try {
      const resourceTemplates = await proxy.listResourceTemplates();
      return { resourceTemplates };
    } catch (error) {
      logger.error(`[ProxyServer] Failed to list resource templates: ${error}`);
      throw new ActionableError(
        `Failed to list resource templates from daemon: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Register resources/read handler - forward to daemon
  server.server.setRequestHandler(ReadResourceRequestSchema, async request => {
    const uri = request.params.uri;

    if (!uri) {
      throw new ActionableError("Resource URI is missing in the request");
    }

    logger.info(`[ProxyServer] Forwarding resource read: ${uri}`);

    try {
      const result = await proxy.readResource(uri);
      return result;
    } catch (error) {
      logger.error(`[ProxyServer] Resource read failed: ${uri} - ${error}`);
      throw new ActionableError(
        `Failed to read resource from daemon: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  return { server, proxy };
}
