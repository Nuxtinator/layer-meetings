// Meeting files go to the private bucket under meetings/. A single presigned
// PUT is capped at 5 GB by S3, so the limit sits below that.
export const MEETINGS_MAX_FILE_BYTES = 4 * 1024 ** 3

// The object key for an upload: its id plus the filename's extension, so the
// key can be re-derived when the upload is completed.
export function meetingsAttachmentKey(id: string, filename: string): string {
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) : ''
  return ext ? `meetings/${id}.${ext}` : `meetings/${id}`
}
