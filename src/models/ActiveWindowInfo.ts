/**
 * Information about the currently active window on the device
 */
export interface ActiveWindowInfo {
  appId: string;
  activityName: string;
  layoutSeqSum: number;
  /** Optional classification for system dialogs or non-app surfaces */
  type?: string;
}
