import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import yaml from "js-yaml";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../logger";

/**
 * Result of plan validation
 */
export interface PlanValidationResult {
  valid: boolean;
  errors?: ValidationError[];
  warnings?: string[];
}

/**
 * Structured validation error
 */
export interface ValidationError {
  field: string;
  message: string;
  line?: number;
  column?: number;
}

/**
 * Validates AutoMobile test plan YAML files against JSON schema
 */
export class PlanSchemaValidator {
  private ajv: Ajv;
  private schema: any;
  private schemaLoaded = false;

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false
    });
    addFormats(this.ajv);
  }

  /**
   * Check if schema has been loaded
   */
  isSchemaLoaded(): boolean {
    return this.schemaLoaded;
  }

  /**
   * Load the JSON schema for test plans
   */
  async loadSchema(): Promise<void> {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    logger.info(`[PlanSchemaValidator] Loading schema from: ${__dirname}`);
    logger.info(`[PlanSchemaValidator] Current working directory: ${process.cwd()}`);
    logger.info(`[PlanSchemaValidator] GITHUB_WORKSPACE: ${process.env.GITHUB_WORKSPACE || "not set"}`);

    // Try multiple paths to support different execution contexts:
    const possiblePaths = [
      // From Bun bundle: dist/src/index.js -> dist/schemas/ (1 level up)
      path.join(__dirname, "../schemas/test-plan.schema.json"),
      // From Bun bundle: dist/src/index.js -> package root schemas/ (2 levels up)
      path.join(__dirname, "../../schemas/test-plan.schema.json"),
      // From source: src/utils/plan/PlanSchemaValidator.ts -> schemas/
      path.join(__dirname, "../../../schemas/test-plan.schema.json"),
      // From Bun-bundled dist/src/index.js: dist/src/../../ = project root schemas/
      path.join(__dirname, "../../schemas/test-plan.schema.json"),
      // From dist/src/: one level up to dist/, then schemas/
      path.join(__dirname, "../schemas/test-plan.schema.json"),
      // From dist: dist/src/utils/plan/PlanSchemaValidator.js -> dist/schemas/
      path.join(__dirname, "../../../../schemas/test-plan.schema.json"),
      // From cwd (project root)
      path.join(process.cwd(), "schemas/test-plan.schema.json"),
      // From cwd/dist
      path.join(process.cwd(), "dist/schemas/test-plan.schema.json"),
      // From subdirectory - traverse up to find project root
      path.join(process.cwd(), "../../schemas/test-plan.schema.json"),
      path.join(process.cwd(), "../../../schemas/test-plan.schema.json"),
      path.join(process.cwd(), "../../../../schemas/test-plan.schema.json"),
      // From GitHub Actions workspace
      path.join(process.env.GITHUB_WORKSPACE || "", "schemas/test-plan.schema.json"),
      // From package root (when installed as npm package)
      path.join(__dirname, "../../../../../schemas/test-plan.schema.json"),
    ];

    let schemaContent: string | null = null;
    let schemaPath: string | null = null;
    const attemptedPaths: string[] = [];

    for (const tryPath of possiblePaths) {
      try {
        const resolvedPath = path.resolve(tryPath);
        attemptedPaths.push(resolvedPath);
        schemaContent = await fs.readFile(resolvedPath, "utf-8");
        schemaPath = resolvedPath;
        logger.info(`[PlanSchemaValidator] ✓ Schema found at: ${schemaPath}`);
        break;
      } catch (error: any) {
        logger.debug(`[PlanSchemaValidator] ✗ Schema not found at: ${path.resolve(tryPath)} (${error.code})`);
        // Try next path
      }
    }

    if (!schemaContent || !schemaPath) {
      const errorMessage = [
        "Could not find test-plan.schema.json.",
        `Current working directory: ${process.cwd()}`,
        `Module directory: ${__dirname}`,
        `GITHUB_WORKSPACE: ${process.env.GITHUB_WORKSPACE || "not set"}`,
        "Tried paths:",
        ...attemptedPaths.map(p => `  - ${p}`)
      ].join("\n");

      logger.error(`[PlanSchemaValidator] ${errorMessage}`);
      throw new Error(errorMessage);
    }

    this.schema = JSON.parse(schemaContent);

    // Add schema to ajv
    this.ajv.addSchema(this.schema);
    this.schemaLoaded = true;
  }

  /**
   * Validate YAML content against the test plan schema
   * @param yamlContent YAML string to validate
   * @returns Validation result with errors if invalid
   * @throws Error if schema has not been loaded via loadSchema()
   */
  validateYaml(yamlContent: string): PlanValidationResult {
    if (!this.schemaLoaded) {
      throw new Error("Schema not loaded. Call loadSchema() first.");
    }
    // First, try to parse YAML
    let parsed: any;
    try {
      parsed = yaml.load(yamlContent);
    } catch (error: any) {
      const line = error.mark?.line !== undefined ? error.mark.line + 1 : undefined;
      const column = error.mark?.column !== undefined ? error.mark.column + 1 : undefined;

      return {
        valid: false,
        errors: [{
          field: "root",
          message: `YAML parsing failed: ${error.message}`,
          line,
          column
        }]
      };
    }

    // Validate against schema
    const validate = this.ajv.compile(this.schema);
    const valid = validate(parsed);

    if (valid) {
      return { valid: true };
    }

    // Format validation errors with line/column information
    const errors = this.formatErrors(validate.errors || [], yamlContent);

    return {
      valid: false,
      errors
    };
  }

  /**
   * Validate a YAML file
   * @param filePath Path to YAML file
   * @returns Validation result
   */
  async validateFile(filePath: string): Promise<PlanValidationResult> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return this.validateYaml(content);
    } catch (error: any) {
      return {
        valid: false,
        errors: [{
          field: "file",
          message: `Failed to read file: ${error.message}`
        }]
      };
    }
  }

  /**
   * Format AJV errors into structured validation errors
   */
  private formatErrors(ajvErrors: ErrorObject[], yamlContent: string): ValidationError[] {
    return ajvErrors.map(err => {
      let field = err.instancePath || "root";

      // Remove leading slash
      if (field.startsWith("/")) {
        field = field.substring(1);
      }

      // Replace /steps/0 with steps[0]
      field = field.replace(/\/(\d+)/g, "[$1]").replace(/\//g, ".");

      let message = err.message || "Validation error";

      // Enhanced error messages
      if (err.keyword === "additionalProperties") {
        const prop = (err.params as any).additionalProperty;
        message = `Unknown property '${prop}'. This might be a legacy field - check the migration guide.`;
      } else if (err.keyword === "required") {
        const missing = (err.params as any).missingProperty;
        message = `Missing required property '${missing}'`;
      } else if (err.keyword === "enum") {
        const allowed = (err.params as any).allowedValues;
        message = `Must be one of: ${allowed.join(", ")}`;
      } else if (err.keyword === "type") {
        const expectedType = (err.params as any).type;
        message = `Must be of type '${expectedType}', but got ${typeof err.data}`;
      } else if (err.keyword === "minItems") {
        const limit = (err.params as any).limit;
        message = `Must have at least ${limit} item${limit !== 1 ? "s" : ""}`;
      } else if (err.keyword === "minLength") {
        const limit = (err.params as any).limit;
        message = `Must be at least ${limit} character${limit !== 1 ? "s" : ""} long`;
      }

      // Try to find line number for the field in YAML
      const lineInfo = this.findLineNumber(yamlContent, field);

      return {
        field: field || "root",
        message,
        line: lineInfo?.line,
        column: lineInfo?.column
      };
    });
  }

  /**
   * Attempt to find the line number of a field in YAML content
   * This is a best-effort approach using regex matching
   */
  private findLineNumber(yamlContent: string, fieldPath: string): { line: number; column: number } | undefined {
    const lines = yamlContent.split("\n");

    // Handle root-level fields
    if (!fieldPath.includes(".") && !fieldPath.includes("[")) {
      const pattern = new RegExp(`^\\s*${fieldPath}\\s*:`);
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          const match = lines[i].match(pattern);
          return { line: i + 1, column: (match?.index ?? 0) + 1 };
        }
      }
    }

    // Handle nested fields like "steps[0].tool" or "metadata.version"
    const parts = fieldPath.split(/[.\[\]]+/).filter(p => p);

    // Try to find the deepest field we can locate
    for (let depth = parts.length; depth > 0; depth--) {
      const searchField = parts[depth - 1];

      // Skip numeric indices
      if (/^\d+$/.test(searchField)) {
        continue;
      }

      const pattern = new RegExp(`^\\s*${searchField}\\s*:`);
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          const match = lines[i].match(pattern);
          return { line: i + 1, column: (match?.index ?? 0) + 1 };
        }
      }
    }

    return undefined;
  }
}
