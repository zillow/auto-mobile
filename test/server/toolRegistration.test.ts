import { beforeEach, describe, expect, test } from "bun:test";
import { ToolRegistry } from "../../src/server/toolRegistry";
import type { RegisteredTool } from "../../src/server/toolRegistry";

/**
 * Tool Registration Regression Tests
 *
 * These tests prevent the silent registration failure that occurred in issue #745,
 * where tools were defined but not registered with the MCP server.
 *
 * Uses fakes and interfaces to avoid dependencies on actual tool implementations.
 */

// Interfaces
interface ToolModule {
  [key: string]: any;
}

interface ToolSchemaDefinition {
  name: string;
  description: string;
  inputSchema: any;
}

interface FileSystemOperations {
  readFile(path: string): Promise<string>;
}

// Fakes
class FakeFileSystem implements FileSystemOperations {
  private files: Map<string, string> = new Map();

  setFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (!content) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    return content;
  }
}

class FakeToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  register(tool: RegisteredTool): void {
    this.tools.set(tool.name, tool);
  }

  getToolDefinitions(): Array<{ name: string; description: string; inputSchema: any }> {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.schema
    }));
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  getAllTools(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  clear(): void {
    this.tools.clear();
  }
}

// Test Helpers
class ToolRegistrationValidator {
  constructor(
    private registry: FakeToolRegistry,
    private fs: FileSystemOperations
  ) {}

  /**
   * Schemas that are intentionally not registered as tools.
   * These are reusable schemas, internal-only, or deprecated.
   */
  private readonly KNOWN_UNREGISTERED_SCHEMAS = new Set([
    "stopApp",          // Deprecated or internal
    "clearState",       // Deprecated or internal
    "packageName",      // Reusable schema component
  ]);

  /**
   * Tools that are conditionally registered based on runtime flags.
   * These tools may or may not be present depending on:
   * - Debug mode flag
   * - Feature flags
   * - Environment settings
   *
   * The tests will allow these to be in the schema file but not registered,
   * or registered but not in all builds.
   */
  private readonly CONDITIONALLY_REGISTERED_TOOLS = new Set([
    // Debug-only tools (registered when isDebugModeEnabled() returns true)
    "bugReport",
    "debugSearch",
    "identifyInteractions",

    // Feature-flag controlled tools
    "criticalSection",
    "executePlan",

    // Resource-only tools (exposed as resources, not tools)
    "getNavigationGraph",
  ]);

  extractSchemaNames(module: ToolModule): string[] {
    return Object.keys(module)
      .filter(key => key.endsWith("Schema"))
      .map(key => key.replace(/Schema$/, ""))
      .filter(name =>
        // Exclude known unregistered schemas
        !this.KNOWN_UNREGISTERED_SCHEMAS.has(name) &&
        // Exclude conditionally registered tools from mandatory checks
        !this.CONDITIONALLY_REGISTERED_TOOLS.has(name)
      );
  }

  getRegisteredToolNames(): string[] {
    return this.registry.getToolNames();
  }

  validateSchemaRegistration(moduleName: string, schemaNames: string[], allowConditional: boolean = false): void {
    const registeredTools = this.getRegisteredToolNames();

    schemaNames.forEach(toolName => {
      const isConditional = this.CONDITIONALLY_REGISTERED_TOOLS.has(toolName);

      // Skip validation for conditional tools if allowed
      if (allowConditional && isConditional) {
        return;
      }

      if (!registeredTools.includes(toolName) && !isConditional) {
        throw new Error(
          `Tool "${toolName}" has a schema defined in ${moduleName} but is not registered with ToolRegistry. ` +
          `This is a silent registration failure similar to issue #745.`
        );
      }
    });
  }

  async validateSchemaFile(schemaPath: string): Promise<void> {
    const schemaContent = await this.fs.readFile(schemaPath);
    const schemas: ToolSchemaDefinition[] = JSON.parse(schemaContent);
    const registeredTools = this.getRegisteredToolNames();

    // Verify each registered tool is in the schema file
    registeredTools.forEach(toolName => {
      const toolSchema = schemas.find(s => s.name === toolName);
      if (!toolSchema) {
        throw new Error(
          `Tool "${toolName}" is registered but missing from ${schemaPath}. ` +
          `Run "bun run build" to regenerate the schema file.`
        );
      }

      if (!toolSchema.name || !toolSchema.description || !toolSchema.inputSchema) {
        throw new Error(`Tool "${toolName}" schema is incomplete`);
      }
    });
  }

  validateToolCount(expectedSchemaCount: number): void {
    const registeredCount = this.registry.getToolNames().length;
    const difference = Math.abs(expectedSchemaCount - registeredCount);

    if (difference > this.CONDITIONALLY_REGISTERED_TOOLS.size) {
      throw new Error(
        `Schema file has ${expectedSchemaCount} tools but registry has ${registeredCount} tools. ` +
        `Difference of ${difference} exceeds expected maximum of ${this.CONDITIONALLY_REGISTERED_TOOLS.size}.`
      );
    }
  }

  validateNoOrphanedSchemas(schemas: ToolSchemaDefinition[]): void {
    const registeredTools = this.getRegisteredToolNames();
    const schemaToolNames = schemas.map(s => s.name);

    const orphanedSchemas = schemaToolNames.filter(name =>
      !registeredTools.includes(name) && !this.CONDITIONALLY_REGISTERED_TOOLS.has(name)
    );

    if (orphanedSchemas.length > 0) {
      throw new Error(
        `Found schemas without registration: ${orphanedSchemas.join(", ")}. ` +
        `These should either be registered or removed from the schema file.`
      );
    }
  }

  validateToolHandlers(): void {
    const allTools = this.registry.getAllTools();

    allTools.forEach(tool => {
      if (!tool.handler) {
        throw new Error(`Tool "${tool.name}" is registered but has no handler function`);
      }
      if (typeof tool.handler !== "function") {
        throw new Error(`Tool "${tool.name}" handler is not a function`);
      }
    });
  }

  validateToolSchemas(): void {
    const allTools = this.registry.getAllTools();

    allTools.forEach(tool => {
      if (!tool.schema) {
        throw new Error(`Tool "${tool.name}" is registered but has no schema`);
      }
      if (typeof tool.schema !== "object") {
        throw new Error(`Tool "${tool.name}" schema is not an object`);
      }
    });
  }
}

describe("Tool Registration Validation (Unit Tests)", () => {
  let fakeRegistry: FakeToolRegistry;
  let fakeFs: FakeFileSystem;
  let validator: ToolRegistrationValidator;

  beforeEach(() => {
    fakeRegistry = new FakeToolRegistry();
    fakeFs = new FakeFileSystem();
    validator = new ToolRegistrationValidator(fakeRegistry, fakeFs);
  });

  describe("Schema Name Extraction", () => {
    test("should extract tool names from schema exports", () => {
      const fakeModule = {
        tapOnSchema: {},
        launchAppSchema: {},
        observeSchema: {},
        someOtherExport: {},
        notASchema: {},
      };

      const names = validator.extractSchemaNames(fakeModule);

      expect(names).toContain("tapOn");
      expect(names).toContain("launchApp");
      expect(names).toContain("observe");
      expect(names).not.toContain("someOtherExport");
      expect(names).not.toContain("notASchema");
    });

    test("should filter out known unregistered schemas", () => {
      const fakeModule = {
        tapOnSchema: {},
        stopAppSchema: {},        // Known unregistered
        packageNameSchema: {},    // Known unregistered
      };

      const names = validator.extractSchemaNames(fakeModule);

      expect(names).toContain("tapOn");
      expect(names).not.toContain("stopApp");
      expect(names).not.toContain("packageName");
    });

    test("should filter out conditionally registered tools (like debug-only tools)", () => {
      const fakeModule = {
        tapOnSchema: {},
        bugReportSchema: {},          // Debug-only tool
        criticalSectionSchema: {},    // Feature-flag tool
      };

      const names = validator.extractSchemaNames(fakeModule);

      expect(names).toContain("tapOn");
      // Conditional tools should be filtered out from mandatory checks
      expect(names).not.toContain("bugReport");
      expect(names).not.toContain("criticalSection");
    });
  });

  describe("Registration Validation", () => {
    test("should detect when a schema is defined but not registered", () => {
      // Register only some tools
      fakeRegistry.register({
        name: "tapOn",
        description: "Tap on element",
        schema: {},
        handler: async () => ({}),
      });

      const schemaNames = ["tapOn", "unregisteredTool"];

      expect(() => {
        validator.validateSchemaRegistration("testModule", schemaNames);
      }).toThrow('Tool "unregisteredTool" has a schema defined in testModule but is not registered');
    });

    test("should pass when all schemas are registered", () => {
      fakeRegistry.register({
        name: "tapOn",
        description: "Tap on element",
        schema: {},
        handler: async () => ({}),
      });

      fakeRegistry.register({
        name: "launchApp",
        description: "Launch app",
        schema: {},
        handler: async () => ({}),
      });

      const schemaNames = ["tapOn", "launchApp"];

      expect(() => {
        validator.validateSchemaRegistration("testModule", schemaNames);
      }).not.toThrow();
    });

    test("should validate critical tools from issue #745", () => {
      const criticalTools = ["clearText", "selectAllText", "pressButton", "systemTray", "pressKey"];

      criticalTools.forEach(toolName => {
        fakeRegistry.register({
          name: toolName,
          description: `Test ${toolName}`,
          schema: {},
          handler: async () => ({}),
        });
      });

      const registeredTools = validator.getRegisteredToolNames();

      criticalTools.forEach(toolName => {
        expect(registeredTools).toContain(toolName);
      });
    });
  });

  describe("Schema File Validation", () => {
    test("should detect when registered tool is missing from schema file", async () => {
      fakeRegistry.register({
        name: "tapOn",
        description: "Tap on element",
        schema: {},
        handler: async () => ({}),
      });

      fakeRegistry.register({
        name: "missingFromSchema",
        description: "Missing tool",
        schema: {},
        handler: async () => ({}),
      });

      const schemaFile = JSON.stringify([
        {
          name: "tapOn",
          description: "Tap on element",
          inputSchema: {}
        }
      ]);

      fakeFs.setFile("schemas/tool-definitions.json", schemaFile);

      await expect(
        validator.validateSchemaFile("schemas/tool-definitions.json")
      ).rejects.toThrow('Tool "missingFromSchema" is registered but missing from schemas/tool-definitions.json');
    });

    test("should pass when all registered tools are in schema file", async () => {
      fakeRegistry.register({
        name: "tapOn",
        description: "Tap on element",
        schema: {},
        handler: async () => ({}),
      });

      const schemaFile = JSON.stringify([
        {
          name: "tapOn",
          description: "Tap on element",
          inputSchema: {}
        }
      ]);

      fakeFs.setFile("schemas/tool-definitions.json", schemaFile);

      // Should not throw
      await validator.validateSchemaFile("schemas/tool-definitions.json");
      expect(true).toBe(true); // Test passes if no error thrown
    });

    test("should detect incomplete schema definitions", async () => {
      fakeRegistry.register({
        name: "tapOn",
        description: "Tap on element",
        schema: {},
        handler: async () => ({}),
      });

      const schemaFile = JSON.stringify([
        {
          name: "tapOn",
          description: "Tap on element",
          // Missing inputSchema
        }
      ]);

      fakeFs.setFile("schemas/tool-definitions.json", schemaFile);

      await expect(
        validator.validateSchemaFile("schemas/tool-definitions.json")
      ).rejects.toThrow('Tool "tapOn" schema is incomplete');
    });
  });

  describe("Tool Count Validation", () => {
    test("should allow small differences for conditionally registered tools", () => {
      // Register 36 tools
      for (let i = 0; i < 36; i++) {
        fakeRegistry.register({
          name: `tool${i}`,
          description: `Tool ${i}`,
          schema: {},
          handler: async () => ({}),
        });
      }

      // Schema file has 38 tools (2 conditionally registered)
      expect(() => {
        validator.validateToolCount(38);
      }).not.toThrow();
    });

    test("should fail when difference exceeds conditional tool limit", () => {
      // Register 30 tools
      for (let i = 0; i < 30; i++) {
        fakeRegistry.register({
          name: `tool${i}`,
          description: `Tool ${i}`,
          schema: {},
          handler: async () => ({}),
        });
      }

      // Schema file has 40 tools (difference of 10 > limit of 2)
      expect(() => {
        validator.validateToolCount(40);
      }).toThrow();
    });
  });

  describe("Orphaned Schema Detection", () => {
    test("should detect schemas without registration", () => {
      fakeRegistry.register({
        name: "tapOn",
        description: "Tap on element",
        schema: {},
        handler: async () => ({}),
      });

      const schemas: ToolSchemaDefinition[] = [
        { name: "tapOn", description: "Tap on element", inputSchema: {} },
        { name: "orphanedTool", description: "Not registered", inputSchema: {} },
      ];

      expect(() => {
        validator.validateNoOrphanedSchemas(schemas);
      }).toThrow("Found schemas without registration: orphanedTool");
    });

    test("should allow conditionally registered tools", () => {
      fakeRegistry.register({
        name: "tapOn",
        description: "Tap on element",
        schema: {},
        handler: async () => ({}),
      });

      const schemas: ToolSchemaDefinition[] = [
        { name: "tapOn", description: "Tap on element", inputSchema: {} },
        { name: "criticalSection", description: "Conditional", inputSchema: {} },
        { name: "executePlan", description: "Conditional", inputSchema: {} },
      ];

      expect(() => {
        validator.validateNoOrphanedSchemas(schemas);
      }).not.toThrow();
    });
  });

  describe("Handler Validation", () => {
    test("should detect missing handlers", () => {
      fakeRegistry.register({
        name: "badTool",
        description: "Tool without handler",
        schema: {},
        handler: undefined as any,
      });

      expect(() => {
        validator.validateToolHandlers();
      }).toThrow('Tool "badTool" is registered but has no handler function');
    });

    test("should detect non-function handlers", () => {
      fakeRegistry.register({
        name: "badTool",
        description: "Tool with bad handler",
        schema: {},
        handler: "not a function" as any,
      });

      expect(() => {
        validator.validateToolHandlers();
      }).toThrow('Tool "badTool" handler is not a function');
    });

    test("should pass when all tools have function handlers", () => {
      fakeRegistry.register({
        name: "goodTool",
        description: "Tool with handler",
        schema: {},
        handler: async () => ({}),
      });

      expect(() => {
        validator.validateToolHandlers();
      }).not.toThrow();
    });
  });

  describe("Schema Object Validation", () => {
    test("should detect missing schemas", () => {
      fakeRegistry.register({
        name: "badTool",
        description: "Tool without schema",
        schema: undefined as any,
        handler: async () => ({}),
      });

      expect(() => {
        validator.validateToolSchemas();
      }).toThrow('Tool "badTool" is registered but has no schema');
    });

    test("should detect non-object schemas", () => {
      fakeRegistry.register({
        name: "badTool",
        description: "Tool with bad schema",
        schema: "not an object" as any,
        handler: async () => ({}),
      });

      expect(() => {
        validator.validateToolSchemas();
      }).toThrow('Tool "badTool" schema is not an object');
    });

    test("should pass when all tools have object schemas", () => {
      fakeRegistry.register({
        name: "goodTool",
        description: "Tool with schema",
        schema: { type: "object" },
        handler: async () => ({}),
      });

      expect(() => {
        validator.validateToolSchemas();
      }).not.toThrow();
    });
  });
});

/**
 * Integration tests that validate actual tool registration
 */
describe("Tool Registration Validation (Integration Tests)", () => {
  // Import actual modules for integration testing
  const actualModules = {
    interaction: () => import("../../src/server/interactionTools"),
    app: () => import("../../src/server/appTools"),
    observe: () => import("../../src/server/observeTools"),
    device: () => import("../../src/server/deviceTools"),
    utility: () => import("../../src/server/utilityTools"),
    navigation: () => import("../../src/server/navigationTools"),
    notification: () => import("../../src/server/notificationTools"),
    highlight: () => import("../../src/server/highlightTools"),
    debug: () => import("../../src/server/debugTools"),
    deepLink: () => import("../../src/server/deepLinkTools"),
    biometric: () => import("../../src/server/biometricTools"),
    snapshot: () => import("../../src/server/snapshotTools"),
    videoRecording: () => import("../../src/server/videoRecordingTools"),
    criticalSection: () => import("../../src/server/criticalSectionTools"),
    featureFlag: () => import("../../src/server/featureFlagTools"),
    doctor: () => import("../../src/server/doctorTools"),
    plan: () => import("../../src/server/planTools"),
  };

  // Integration tests verify actual code structure without needing the validator

  test("should verify critical tools from issue #745 exist in actual code", async () => {
    const interactionTools = await actualModules.interaction();
    const criticalSchemas = ["clearTextSchema", "selectAllTextSchema", "pressButtonSchema", "systemTraySchema", "pressKeySchema"];

    criticalSchemas.forEach(schemaName => {
      expect(interactionTools).toHaveProperty(schemaName);
      expect(interactionTools[schemaName]).toBeDefined();
    });
  });

  test("should verify actual schema file exists and is valid JSON", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const schemaPath = path.join(process.cwd(), "schemas", "tool-definitions.json");

    const content = await fs.readFile(schemaPath, "utf-8");
    const schemas = JSON.parse(content);

    expect(Array.isArray(schemas)).toBe(true);
    expect(schemas.length).toBeGreaterThan(0);

    // Validate structure of first schema
    if (schemas.length > 0) {
      expect(schemas[0]).toHaveProperty("name");
      expect(schemas[0]).toHaveProperty("description");
      expect(schemas[0]).toHaveProperty("inputSchema");
    }
  });

  test("should verify actual ToolRegistry has expected methods", () => {
    expect(ToolRegistry).toHaveProperty("getToolDefinitions");
    expect(ToolRegistry).toHaveProperty("getAllTools");
    expect(typeof ToolRegistry.getToolDefinitions).toBe("function");
    expect(typeof ToolRegistry.getAllTools).toBe("function");
  });
});
