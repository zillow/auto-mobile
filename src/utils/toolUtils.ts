/**
 * Utility functions for tool handlers
 */
import { OPERATION_CANCELLED_MESSAGE } from "./constants";

const stripAccessibilityExtras = (key: string, value: unknown): unknown => {
  if (key === "extras") {
    return undefined;
  }
  return value;
};

export const stringifyToolResponse = (content: unknown): string => {
  return JSON.stringify(content, stripAccessibilityExtras, 2);
};

/**
 * Interface for tool response formatter
 */
export interface ToolResponseFormatter {
  createJSONToolResponse(content: any): {
    content: Array<{
      type: "text";
      text: string;
    }>;
  };
  createImageToolResponse(base64Data: string, mimeType: string): {
    content: Array<{
      type: "image";
      data: string;
      mimeType: string;
    }>;
  };
}

/**
 * Default tool response formatting implementation
 */
export class DefaultToolResponseFormatter implements ToolResponseFormatter {
  /**
   * Creates a standardized tool response with text content
   * @param content Any data that will be stringified as JSON
   * @returns A properly formatted tool response object
   */
  createJSONToolResponse(content: any): {
    content: Array<{
      type: "text";
      text: string;
    }>;
  } {
    return {
      content: [
        {
          type: "text",
          text: stringifyToolResponse(content)
        }
      ]
    };
  }

  /**
   * Creates a standardized tool response with image content
   * @param base64Data Base64 encoded image data
   * @param mimeType The MIME type of the image (e.g., "image/png", "image/webp")
   * @returns A properly formatted tool response object
   */
  createImageToolResponse(base64Data: string, mimeType: string): {
    content: Array<{
      type: "image";
      data: string;
      mimeType: string;
    }>;
  } {
    return {
      content: [
        {
          type: "image",
          data: base64Data,
          mimeType: mimeType
        }
      ]
    };
  }

  // Static convenience methods for backward compatibility
  static createJSONToolResponse = (content: any) => new DefaultToolResponseFormatter().createJSONToolResponse(content);
  static createImageToolResponse = (base64Data: string, mimeType: string) => new DefaultToolResponseFormatter().createImageToolResponse(base64Data, mimeType);
}

// Export convenience functions for backward compatibility
export const createJSONToolResponse = DefaultToolResponseFormatter.createJSONToolResponse;
/**
 * Creates a structured tool response for tools with outputSchema.
 * MCP tools with outputSchema must return structuredContent.
 * @param content The structured data that matches the tool's outputSchema
 * @returns A properly formatted tool response with both content and structuredContent
 */
export const createStructuredToolResponse = (content: any): {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: any;
  success?: boolean;
  error?: string;
} => {
  const response: ReturnType<typeof createStructuredToolResponse> = {
    content: [
      {
        type: "text",
        text: stringifyToolResponse(content)
      }
    ],
    structuredContent: content
  };
  if (content && typeof content === "object") {
    if ("success" in content) {
      response.success = content.success;
    }
    if ("error" in content) {
      response.error = content.error;
    }
  }
  return response;
};

export const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw new Error(OPERATION_CANCELLED_MESSAGE);
  }
};
