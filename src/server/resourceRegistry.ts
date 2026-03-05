import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Resource, ResourceTemplate, ReadResourceRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../utils/logger";

// Interface for resource content handlers
interface ResourceHandler {
  (): Promise<ResourceContent>;
}

// Interface for resource template handlers (with parameters)
interface ResourceTemplateHandler {
  (params: Record<string, string>): Promise<ResourceContent>;
}

// Resource content can be text or blob
export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string; // base64 encoded
}

// Interface for a registered resource
interface RegisteredResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  handler: ResourceHandler;
}

// Interface for a registered resource template
interface RegisteredResourceTemplate {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
  handler: ResourceTemplateHandler;
}

// The registry that holds all resources
class ResourceRegistryClass {
  private resources: Map<string, RegisteredResource> = new Map();
  private templates: Map<string, RegisteredResourceTemplate> = new Map();
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

  // Register a new resource template (RFC 6570 URI template)
  registerTemplate(
    uriTemplate: string,
    name: string,
    description: string,
    mimeType: string,
    handler: ResourceTemplateHandler
  ): void {
    this.templates.set(uriTemplate, { uriTemplate, name, description, mimeType, handler });
  }

  // Get all registered templates
  getAllTemplates(): RegisteredResourceTemplate[] {
    return Array.from(this.templates.values());
  }

  // Get a specific template by URI template
  getTemplate(uriTemplate: string): RegisteredResourceTemplate | undefined {
    return this.templates.get(uriTemplate);
  }

  // Match a URI against registered templates and return the template and extracted parameters
  matchTemplate(uri: string): { template: RegisteredResourceTemplate; params: Record<string, string> } | undefined {
    for (const [uriTemplate, registeredTemplate] of this.templates) {
      const params = this.extractTemplateParams(uriTemplate, uri);
      if (params) {
        return { template: registeredTemplate, params };
      }
    }
    return undefined;
  }

  // Extract parameters from a URI using a URI template pattern
  private extractTemplateParams(template: string, uri: string): Record<string, string> | null {
    // Convert URI template to regex pattern
    // E.g., "automobile:emulators/([^/]+)"
    // For query params, we need to stop at '&' as well as '/'
    const paramNames: string[] = [];
    const tokenizedTemplate = template.replace(/\{(\w+)\}/g, (_, paramName) => {
      paramNames.push(paramName);
      return `__PARAM_${paramNames.length - 1}__`;
    });
    const escapedTemplate = tokenizedTemplate.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    // Use [^/&]+ to properly handle query string parameters (stop at & delimiter)
    const regexPattern = escapedTemplate.replace(/__PARAM_(\d+)__/g, () => "([^/&]+)");

    const regex = new RegExp(`^${regexPattern}$`);
    const match = uri.match(regex);

    if (!match) {
      return null;
    }

    // Extract parameters from match groups
    const params: Record<string, string> = {};
    paramNames.forEach((name, index) => {
      params[name] = match[index + 1];
    });

    return params;
  }

  // Get all registered resources
  getAllResources(): RegisteredResource[] {
    return Array.from(this.resources.values());
  }

  // Get a specific resource by URI
  getResource(uri: string): RegisteredResource | undefined {
    return this.resources.get(uri);
  }

  // Unregister a resource by URI
  unregister(uri: string): void {
    this.resources.delete(uri);
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

  // Get resource templates in MCP format for ListResourceTemplates response
  getTemplateDefinitions(): ResourceTemplate[] {
    return Array.from(this.templates.values()).map(template => ({
      uriTemplate: template.uriTemplate,
      name: template.name,
      description: template.description,
      mimeType: template.mimeType
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
      logger.info(`[ResourceRegistry] ReadResource request for URI: ${uri}`);

      // Check for common incorrect URI schemes and provide helpful error messages
      const schemeMatch = uri.match(/^([a-z][a-z0-9+.-]*):\/?\/?/i);
      if (schemeMatch) {
        const scheme = schemeMatch[1].toLowerCase();
        if (scheme !== "automobile") {
          const suggestedUri = uri.replace(/^[a-z][a-z0-9+.-]*:\/?\/?/i, "automobile:");
          throw new Error(
            `Unknown URI scheme '${scheme}://'. AutoMobile resources use the 'automobile:' prefix. ` +
            `Try: ${suggestedUri}`
          );
        }
      }

      // First, try to find an exact match resource
      const resource = this.getResource(uri);
      if (resource) {
        const content = await resource.handler();
        return {
          contents: [content]
        };
      }

      // If not found, try to match a template
      const templateMatch = this.matchTemplate(uri);
      if (templateMatch) {
        const content = await templateMatch.template.handler(templateMatch.params);
        return {
          contents: [content]
        };
      }

      // Provide helpful error message with available resource patterns
      throw new Error(
        `Resource not found: ${uri}\n\n` +
        `Available resource patterns:\n` +
        `  - automobile:devices/booted - List all booted devices\n` +
        `  - automobile:devices/booted/{platform} - List devices by platform (android|ios)\n` +
        `  - automobile:devices/{deviceId}/apps - List apps for a device\n` +
        `  - automobile:apps?deviceId={deviceId} - Query apps with filters\n` +
        `  - automobile:observation/latest - Latest screen observation\n\n` +
        `Use the listApps tool for detailed guidance on listing apps.`
      );
    });

    // Set handler for listing resource templates
    server.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
      return {
        resourceTemplates: this.getTemplateDefinitions()
      };
    });
  }

  // Send resource update notification
  async notifyResourceUpdated(uri: string): Promise<void> {
    if (!this.server) {
      return;
    }

    const resource = this.getResource(uri);
    const templateMatch = resource ? undefined : this.matchTemplate(uri);
    if (!resource && !templateMatch) {
      return;
    }

    try {
      // Send notification to clients that resource has changed
      await this.server.server.notification({
        method: "notifications/resources/updated",
        params: {
          uri: resource ? resource.uri : uri
        }
      });
    } catch (error) {
      // Silently ignore notification errors (e.g., when transport is not connected during tests)
      logger.debug(`[ResourceRegistry] Failed to notify resource update for ${uri}: ${error}`);
    }
  }

  // Send notifications for multiple resources
  async notifyResourcesUpdated(uris: string[]): Promise<void> {
    for (const uri of uris) {
      await this.notifyResourceUpdated(uri);
    }
  }

  // Send notification that the resource list has changed
  async notifyResourceListChanged(): Promise<void> {
    if (!this.server) {
      return;
    }

    try {
      await this.server.server.notification({
        method: "notifications/resources/list_changed",
        params: {}
      });
    } catch (error) {
      logger.warn(`[ResourceRegistry] Failed to notify resource list change: ${error}`);
    }
  }

  // Clear all registered resources and templates (for testing)
  clearResources(): void {
    this.resources.clear();
    this.templates.clear();
  }
}

// Export a singleton instance
export const ResourceRegistry = new ResourceRegistryClass();
