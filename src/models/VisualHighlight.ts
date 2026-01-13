export type HighlightShapeType = "box" | "circle" | "path";

export type HighlightSmoothingAlgorithm = "none" | "catmull-rom" | "bezier" | "douglas-peucker";

export type HighlightLineCap = "butt" | "round" | "square";

export type HighlightLineJoin = "miter" | "round" | "bevel";

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
  dashPattern?: number[] | null;
  smoothing?: HighlightSmoothingAlgorithm | null;
  tension?: number | null;
  capStyle?: HighlightLineCap | null;
  joinStyle?: HighlightLineJoin | null;
}

export interface HighlightPoint {
  x: number;
  y: number;
}

export interface HighlightBoxShape {
  type: "box";
  bounds: HighlightBounds;
  style?: HighlightStyle | null;
}

export interface HighlightCircleShape {
  type: "circle";
  bounds: HighlightBounds;
  style?: HighlightStyle | null;
}

export interface HighlightPathShape {
  type: "path";
  points: HighlightPoint[];
  bounds?: HighlightBounds | null;
  style?: HighlightStyle | null;
}

export type HighlightShape = HighlightBoxShape | HighlightCircleShape | HighlightPathShape;

export interface HighlightEntry {
  id: string;
  shape: HighlightShape;
}

export interface HighlightOperationResult {
  success: boolean;
  error?: string | null;
  requestId?: string;
  timestamp?: number;
}
