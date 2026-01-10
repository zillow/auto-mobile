/**
 * Fake tool utils implementation for testing
 * Allows configuration and verification of tool response creation
 */
import { ToolUtils } from "../../src/utils/interfaces/ToolUtils";
import { stringifyToolResponse } from "../../src/utils/toolUtils";

export class FakeToolUtils implements ToolUtils {
  private jsonResponses: any[] = [];
  private imageResponses: Array<{ base64Data: string; mimeType: string }> = [];

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
    this.jsonResponses.push(content);
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
    this.imageResponses.push({ base64Data, mimeType });
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

  // Query methods for testing

  /**
   * Gets all JSON responses created
   */
  getJSONResponses(): any[] {
    return [...this.jsonResponses];
  }

  /**
   * Gets all image responses created
   */
  getImageResponses(): Array<{ base64Data: string; mimeType: string }> {
    return [...this.imageResponses];
  }

  /**
   * Gets the count of JSON responses created
   */
  getJSONResponseCount(): number {
    return this.jsonResponses.length;
  }

  /**
   * Gets the count of image responses created
   */
  getImageResponseCount(): number {
    return this.imageResponses.length;
  }

  /**
   * Gets the last JSON response created
   */
  getLastJSONResponse(): any {
    return this.jsonResponses[this.jsonResponses.length - 1];
  }

  /**
   * Gets the last image response created
   */
  getLastImageResponse(): { base64Data: string; mimeType: string } | undefined {
    return this.imageResponses[this.imageResponses.length - 1];
  }

  /**
   * Clears all recorded responses
   */
  clearResponses(): void {
    this.jsonResponses = [];
    this.imageResponses = [];
  }

  /**
   * Resets the fake to initial state
   */
  reset(): void {
    this.clearResponses();
  }
}
