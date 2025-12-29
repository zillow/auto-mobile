/**
 * Fake implementation of ToolRegistry for testing
 * Allows registering and retrieving tools in memory
 */
import { ToolRegistry, RegisteredTool } from "../../src/utils/server/ToolRegistry";

export class FakeToolRegistry implements ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  /**
   * Register a new tool
   * @param name - The name of the tool
   * @param description - Description of the tool
   * @param schema - The schema for tool parameters
   * @param handler - The handler function for the tool
   * @param supportsProgress - Whether the tool supports progress callbacks
   */
  registerTool(
    name: string,
    description: string,
    schema: any,
    handler: (args: any) => Promise<any>,
    supportsProgress: boolean = false
  ): void {
    this.tools.set(name, {
      name,
      description,
      schema,
      handler,
      supportsProgress,
      requiresDevice: false
    });
  }

  /**
   * Get a specific tool by name
   * @param name - The name of the tool to retrieve
   * @returns The registered tool or undefined if not found
   */
  getTool(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   * @returns Array of all registered tools
   */
  getTools(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * Check if a tool is registered
   * @param name - The name of the tool
   * @returns true if the tool is registered
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get the count of registered tools
   * @returns Number of registered tools
   */
  getToolCount(): number {
    return this.tools.size;
  }
}
