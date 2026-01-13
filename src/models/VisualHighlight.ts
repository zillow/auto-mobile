export type HighlightShapeType = "box" | "circle";

export interface HighlightBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
}

export interface HighlightStyle {
  strokeColor?: string | null;
  strokeWidth?: number | null;
  fillColor?: string | null;
  dashPattern?: number[] | null;
}

export interface HighlightShape {
  type: HighlightShapeType;
  bounds: HighlightBounds;
  style?: HighlightStyle | null;
}

export interface HighlightEntry {
  id: string;
  shape: HighlightShape;
}

export interface HighlightOperationResult {
  success: boolean;
  error?: string | null;
  highlights: HighlightEntry[];
  requestId?: string;
  timestamp?: number;
}
