export interface DragAndDropTarget {
  text?: string;
  elementId?: string;
}

export interface DragAndDropOptions {
  source: DragAndDropTarget;
  target: DragAndDropTarget;
  pressDurationMs?: number;
  dragDurationMs?: number;
  holdDurationMs?: number;
}
