import { ToolRegistry as ToolRegistryImpl } from "../../server/toolRegistry";

/**
 * Registered tool interface
 */
export interface RegisteredTool {
  name: string;
  description: string;
  schema: any;
  handler: (args: any, progress?: (progress: number, total?: number, message?: string) => Promise<void>, signal?: AbortSignal) => Promise<any>;
  supportsProgress?: boolean;
  requiresDevice?: boolean;
}

/**
 * Interface for tool registry
 */
export interface ToolRegistry {
  /**
   * Get a specific tool by name
   * @param name - The name of the tool to retrieve
   * @returns The registered tool or undefined if not found
   */
  getTool(name: string): RegisteredTool | undefined;

  /**
   * Get all registered tools
   * @returns Array of all registered tools
   */
  getTools(): RegisteredTool[];

  /**
   * Register a new tool
   * @param name - The name of the tool
   * @param description - Description of the tool
   * @param schema - The schema for tool parameters
   * @param handler - The handler function for the tool
   * @param supportsProgress - Whether the tool supports progress callbacks
   * @returns void
   */
  registerTool(
    name: string,
    description: string,
    schema: any,
    handler: (args: any) => Promise<any>,
    supportsProgress?: boolean
  ): void;
}

/**
 * Default tool registry adapter
 */
export class DefaultToolRegistry implements ToolRegistry {
  getTool(name: string) {
    const tool = ToolRegistryImpl.getTool(name);
    if (!tool) {return undefined;}
    return {
      name: tool.name,
      description: tool.description,
      schema: tool.schema,
      handler: tool.handler,
      supportsProgress: tool.supportsProgress,
      requiresDevice: tool.requiresDevice
    };
  }

  getTools() {
    return ToolRegistryImpl.getAllTools().map(tool => ({
      name: tool.name,
      description: tool.description,
      schema: tool.schema,
      handler: tool.handler,
      supportsProgress: tool.supportsProgress,
      requiresDevice: tool.requiresDevice
    }));
  }

  registerTool(
    name: string,
    description: string,
    schema: any,
    handler: (args: any) => Promise<any>,
    supportsProgress?: boolean
  ): void {
    ToolRegistryImpl.register(name, description, schema, handler, supportsProgress);
  }
}
