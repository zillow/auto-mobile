export interface PinchOnOptions {
  direction: "in" | "out";
  distanceStart?: number;
  distanceEnd?: number;
  scale?: number;
  duration?: number;
  rotationDegrees?: number;
  includeSystemInsets?: boolean;
  container?: {
    elementId?: string;
    text?: string;
  };
  autoTarget?: boolean;
}
