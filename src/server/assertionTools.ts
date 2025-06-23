/**
 * Maestro-Aligned Tools
 *
 * This file implements Maestro-compatible command names and unified gesture support
 * while maintaining backward compatibility.
 */

import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ActionableError } from "../models";
import { createJSONToolResponse, verifyDeviceIsReady } from "../utils/toolUtils";

// Import existing implementations
import { ElementUtils } from "../features/utility/ElementUtils";
import { ObserveScreen } from "../features/observe/ObserveScreen";

export const assertVisibleSchema = z.object({
  text: z.string().optional().describe("Text that should be visible"),
  id: z.string().optional().describe("Element ID that should be visible")
});

export const assertNotVisibleSchema = z.object({
  text: z.string().optional().describe("Text that should not be visible"),
  id: z.string().optional().describe("Element ID that should not be visible")
});

export interface AssertVisibleArgs {
  text?: string;
  id?: string;
}

export interface AssertNotVisibleArgs {
  text?: string;
  id?: string;
}

// Helper functions

function parseElement(args: { text?: string; id?: string }): { type: string; value: any } {
  if (args.text) {
    return { type: "text", value: { text: args.text } };
  }
  if (args.id) {
    return { type: "id", value: { id: args.id } };
  }
  throw new Error("Must specify either text or id");
}

// Command implementations

export function registerAssertionTools(getCurrentDeviceId: () => string | undefined) {
  const elementUtils = new ElementUtils();

  const assertVisibleHandler = async (args: AssertVisibleArgs) => {
    const deviceId = getCurrentDeviceId();
    await verifyDeviceIsReady(deviceId);

    const observeScreen = new ObserveScreen(deviceId);
    const observeResult = await observeScreen.execute();

    if (!observeResult.viewHierarchy) {
      throw new Error("Could not get view hierarchy for assertion.");
    }

    const selector = parseElement(args);
    let found = false;

    if (selector.type === "text") {
      const element = elementUtils.findElementByText(
        observeResult.viewHierarchy,
        selector.value.text,
        true, // fuzzy match
        false // case sensitive
      );
      found = element !== null;
    } else if (selector.type === "id") {
      const elements = elementUtils.findElementsByResourceId(
        observeResult.viewHierarchy,
        selector.value.id,
        true // partial match
      );
      found = elements.length > 0;
    }

    if (!found) {
      throw new ActionableError(`Element not visible: ${JSON.stringify(selector.value)}`);
    }

    return createJSONToolResponse({
      message: `Asserted element is visible: ${JSON.stringify(selector.value)}`,
      observation: observeResult
    });
  };

  const assertNotVisibleHandler = async (args: AssertNotVisibleArgs) => {
    const deviceId = getCurrentDeviceId();
    await verifyDeviceIsReady(deviceId);

    const observeScreen = new ObserveScreen(deviceId);
    const observeResult = await observeScreen.execute();

    if (!observeResult.viewHierarchy) {
      throw new Error("Could not get view hierarchy for assertion.");
    }

    const selector = parseElement(args);
    let found = false;

    if (selector.type === "text") {
      const element = elementUtils.findElementByText(
        observeResult.viewHierarchy,
        selector.value.text,
        true, // fuzzy match
        false // case sensitive
      );
      found = element !== null;
    } else if (selector.type === "id") {
      const elements = elementUtils.findElementsByResourceId(
        observeResult.viewHierarchy,
        selector.value.id,
        true // partial match
      );
      found = elements.length > 0;
    }

    if (found) {
      throw new ActionableError(`Element is visible when it should not be: ${JSON.stringify(selector.value)}`);
    }

    return createJSONToolResponse({
      message: `Asserted element is not visible: ${JSON.stringify(selector.value)}`,
      observation: observeResult
    });
  };

  // Phase 3: New Maestro Commands
  ToolRegistry.register(
    "assertVisible",
    "Assert that an element is visible on the screen",
    assertVisibleSchema,
    assertVisibleHandler
  );

  ToolRegistry.register(
    "assertNotVisible",
    "Assert that an element is not visible on the screen",
    assertNotVisibleSchema,
    assertNotVisibleHandler
  );
}
