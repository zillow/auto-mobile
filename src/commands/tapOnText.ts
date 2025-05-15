import { TapCommand } from './tap.ts';
import { ObserveCommand } from './observe.ts';

interface TapOnTextOptions {
  text: string;
  fuzzyMatch?: boolean;
  caseSensitive?: boolean;
  waitForIdle?: boolean;
}

interface ElementBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Element {
  bounds: ElementBounds;
  text?: string;
  'content-desc'?: string;
  [key: string]: any;
}

interface TapOnTextResult {
  success: boolean;
  text: string;
  element: Element;
  x: number;
  y: number;
  observation?: any;
}

/**
 * Command to tap on UI element containing specified text
 */
export class TapOnTextCommand {
  private tap: TapCommand;
  private observe: ObserveCommand;

  constructor(deviceId: string | null = null) {
    this.tap = new TapCommand(deviceId);
    this.observe = new ObserveCommand(deviceId);
  }

  /**
   * Execute a tap on text
   * @param options - Command options
   * @returns Result of the command
   */
  async execute(options: TapOnTextOptions): Promise<TapOnTextResult> {
    if (!options.text) {
      throw new Error('Text to tap on is required');
    }

    try {
      // First observe to get current view hierarchy
      const observation = await this.observe.execute({ withScreenshot: false });
      
      // Find the UI element that contains the text
      const element = this.findElementWithText(
        observation.viewHierarchy,
        options.text,
        options.fuzzyMatch !== false,
        options.caseSensitive === true
      );
      
      if (!element) {
        throw new Error(`No element found with text: ${options.text}`);
      }
      
      // Calculate the center point of the element
      const centerX = Math.floor(element.bounds.left + (element.bounds.right - element.bounds.left) / 2);
      const centerY = Math.floor(element.bounds.top + (element.bounds.bottom - element.bounds.top) / 2);
      
      // Tap on the center of the element
      const tapResult = await this.tap.execute({
        x: centerX,
        y: centerY,
        waitForIdle: options.waitForIdle !== false
      });
      
      return {
        success: true,
        text: options.text,
        element,
        x: centerX,
        y: centerY,
        observation: tapResult.observation
      };
    } catch (error) {
      throw new Error(`Tap on text command failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Find an element in the view hierarchy that contains the specified text
   * @param viewHierarchy - The view hierarchy to search
   * @param text - The text to search for
   * @param fuzzyMatch - Whether to use fuzzy matching
   * @param caseSensitive - Whether to use case-sensitive matching
   * @returns The found element or null
   */
  findElementWithText(
    viewHierarchy: any, 
    text: string, 
    fuzzyMatch: boolean, 
    caseSensitive: boolean
  ): Element | null {
    // Create a search function based on the options
    const matchesText = (elementText?: string): boolean => {
      if (!elementText) return false;
      
      let searchText = text;
      let targetText = elementText;
      
      if (!caseSensitive) {
        searchText = searchText.toLowerCase();
        targetText = targetText.toLowerCase();
      }
      
      if (fuzzyMatch) {
        return targetText.includes(searchText);
      } else {
        return targetText === searchText;
      }
    };
    
    // Extract the root node
    const rootNode = viewHierarchy.hierarchy 
      ? viewHierarchy.hierarchy.node 
      : (viewHierarchy.node || viewHierarchy);
    
    // Find all matching elements
    const matches: Element[] = [];
    this.traverseViewHierarchy(rootNode, (node: any) => {
      if (node.text && matchesText(node.text)) {
        // Convert bounds from string "left,top,right,bottom" to object
        const boundsString = node.bounds || '';
        const boundsParts = boundsString.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
        
        if (boundsParts) {
          node.bounds = {
            left: parseInt(boundsParts[1], 10),
            top: parseInt(boundsParts[2], 10),
            right: parseInt(boundsParts[3], 10),
            bottom: parseInt(boundsParts[4], 10)
          };
          matches.push(node);
        }
      }
      
      // Also check content-desc attribute
      if (node['content-desc'] && matchesText(node['content-desc'])) {
        // Convert bounds from string to object if needed
        if (!node.bounds || typeof node.bounds === 'string') {
          const boundsString = node.bounds || '';
          const boundsParts = boundsString.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
          
          if (boundsParts) {
            node.bounds = {
              left: parseInt(boundsParts[1], 10),
              top: parseInt(boundsParts[2], 10),
              right: parseInt(boundsParts[3], 10),
              bottom: parseInt(boundsParts[4], 10)
            };
            matches.push(node);
          }
        } else {
          matches.push(node);
        }
      }
    });
    
    // Return the first matching element or null
    return matches.length > 0 ? matches[0] : null;
  }

  /**
   * Traverse the view hierarchy and call the callback for each node
   * @param node - The node to start traversal from
   * @param callback - Function to call for each node
   */
  traverseViewHierarchy(node: any, callback: (node: any) => void): void {
    if (!node) return;
    
    // Call the callback for this node
    callback(node);
    
    // Traverse child nodes
    const children = node.node || [];
    if (Array.isArray(children)) {
      children.forEach(child => this.traverseViewHierarchy(child, callback));
    } else if (children && typeof children === 'object') {
      this.traverseViewHierarchy(children, callback);
    }
  }
}