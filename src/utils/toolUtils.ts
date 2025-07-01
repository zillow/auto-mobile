/**
 * Utility functions for tool handlers
 */

/**
 * Tool utilities class that provides utility functions
 */
export class ToolUtils {
  /**
   * Creates a standardized tool response with text content
   * @param content Any data that will be stringified as JSON
   * @returns A properly formatted tool response object
   */
  static createJSONToolResponse(content: any): {
    content: Array<{
      type: "text";
      text: string;
    }>;
  } {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(content, null, 2)
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
  static createImageToolResponse(base64Data: string, mimeType: string): {
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
}

// Export convenience functions for backward compatibility
export const createJSONToolResponse = ToolUtils.createJSONToolResponse;
export const createImageToolResponse = ToolUtils.createImageToolResponse;
