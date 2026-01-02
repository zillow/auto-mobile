import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Resource, ReadResourceRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// Interface for resource content handlers
export interface ResourceHandler {
  (): Promise<ResourceContent>;
}

// Resource content can be text or blob
export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string; // base64 encoded
}

// Interface for a registered resource
export interface RegisteredResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  handler: ResourceHandler;
}

// The registry that holds all resources
class ResourceRegistryClass {
  private resources: Map<string, RegisteredResource> = new Map();
  private server: McpServer | null = null;

  // Register a new resource
  register(
    uri: string,
    name: string,
    description: string,
    mimeType: string,
    handler: ResourceHandler
  ): void {
    this.resources.set(uri, { uri, name, description, mimeType, handler });
  }

  // Get all registered resources
  getAllResources(): RegisteredResource[] {
    return Array.from(this.resources.values());
  }

  // Get a specific resource by URI
  getResource(uri: string): RegisteredResource | undefined {
    return this.resources.get(uri);
  }

  // Get resources in MCP format for ListResources response
  getResourceDefinitions(): Resource[] {
    return Array.from(this.resources.values()).map(resource => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType
    }));
  }

  // Register all resources with an MCP server
  registerWithServer(server: McpServer): void {
    this.server = server;

    // Set handler for listing resources
    server.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: this.getResourceDefinitions()
      };
    });

    // Set handler for reading resource content
    server.server.setRequestHandler(ReadResourceRequestSchema, async request => {
      const { uri } = request.params;
      const resource = this.getResource(uri);

      if (!resource) {
        throw new Error(`Resource not found: ${uri}`);
      }

      const content = await resource.handler();
      return {
        contents: [content]
      };
    });

    // Set handler for listing resource templates (empty for now)
    server.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
      return {
        resourceTemplates: []
      };
    });
  }

  // Send resource update notification
  async notifyResourceUpdated(uri: string): Promise<void> {
    if (!this.server) {
      return;
    }

    const resource = this.getResource(uri);
    if (!resource) {
      return;
    }

    // Send notification to clients that resource has changed
    await this.server.server.notification({
      method: "notifications/resources/updated",
      params: {
        uri: resource.uri
      }
    });
  }

  // Send notifications for multiple resources
  async notifyResourcesUpdated(uris: string[]): Promise<void> {
    for (const uri of uris) {
      await this.notifyResourceUpdated(uri);
    }
  }

  // Clear all registered resources (for testing)
  clearResources(): void {
    this.resources.clear();
  }
}

// Export a singleton instance
export const ResourceRegistry = new ResourceRegistryClass();
