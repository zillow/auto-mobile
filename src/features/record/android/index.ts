export type {
  TouchSlot,
  RawTouchFrame,
  GestureEventType,
  GestureEvent,
  GestureEmitter,
  A11ySource,
} from "./types";
export { GESTURE_THRESHOLDS } from "./types";

export type { TouchInputNode } from "./TouchNodeDiscovery";
export { discoverTouchNode, parseTouchNodes } from "./TouchNodeDiscovery";

export type { AxisRanges, CoordScaler } from "./AxisRanges";
export { buildScaler, buildAxisRanges, queryDisplaySize, queryDensity } from "./AxisRanges";

export { TouchFrameReconstructor } from "./TouchFrameReconstructor";
export { GestureClassifier } from "./GestureClassifier";

export type { GetEventReaderOptions } from "./GetEventReader";
export { GetEventReader } from "./GetEventReader";

export { DualTrackRecorder, MERGE_WINDOW_MS } from "./DualTrackRecorder";
