export interface DragAndDropTarget {
  text?: string;
  elementId?: string;
}

export interface DragAndDropOptions {
  source: DragAndDropTarget;
  target: DragAndDropTarget;
  duration?: number;
  holdTime?: number;
  dropDelay?: number;
}
