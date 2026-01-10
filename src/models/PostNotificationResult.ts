/**
 * Result of a postNotification action.
 */
export interface PostNotificationResult {
  success: boolean;
  supported: boolean;
  method?: "sdk";
  imageType?: "normal" | "bigPicture";
  appId?: string;
  channelId?: string;
  warning?: string;
  error?: string;
}
