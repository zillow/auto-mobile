import type { ScreenshotService } from "./interfaces/ScreenshotService";
import type { ScreenSize } from "./interfaces/ScreenSize";
import type { SystemInsets } from "./interfaces/SystemInsets";
import type { ViewHierarchy } from "./interfaces/ViewHierarchy";
import type { Window } from "./interfaces/Window";
import type { DumpsysWindow } from "./interfaces/DumpsysWindow";
import type { BackStack } from "./interfaces/BackStack";
import type { PredictiveUIState } from "./interfaces/PredictiveUIState";

/**
 * Dependencies for ObserveScreen that can be injected for testing.
 * All properties are optional - defaults will be created if not provided.
 */
export interface ObserveScreenDependencies {
  screenSize?: ScreenSize;
  systemInsets?: SystemInsets;
  viewHierarchy?: ViewHierarchy;
  window?: Window;
  screenshot?: ScreenshotService;
  dumpsysWindow?: DumpsysWindow;
  backStack?: BackStack;
  predictiveUIState?: PredictiveUIState;
}
