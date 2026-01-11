export const VIDEO_RESOURCE_URIS = {
  LATEST: "automobile:video/latest",
  ARCHIVE: "automobile:video/archive",
  ARCHIVE_ITEM: "automobile:video/archive/{recordingId}",
} as const;

export function buildVideoArchiveItemUri(recordingId: string): string {
  return `automobile:video/archive/${recordingId}`;
}
