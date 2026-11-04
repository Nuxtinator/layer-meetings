// Thin wrapper over $fetch for the meetings endpoints: every failure becomes
// a toast and resolves to undefined, so call sites can `if (!res) return`.
import type { MeetingAttachment } from '../utils/meetings-types'

export function meetingsErrorMessage(e: unknown): string {
  const err = e as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
  return err?.data?.statusMessage ?? err?.statusMessage ?? err?.message ?? 'Something went wrong'
}

export function useMeetingsApi() {
  const toast = useToast()

  async function call<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn()
    } catch (e) {
      toast.add({ title: meetingsErrorMessage(e), color: 'error' })
      return undefined
    }
  }

  // Uploads straight to the bucket through a presigned URL, then records the
  // file on the meeting.
  async function uploadFile(meetingId: string, file: File, onProgress: (fraction: number) => void) {
    return await call(async () => {
      const contentType = file.type || 'application/octet-stream'
      const { attachment_id, upload_url } = await $fetch<{ attachment_id: string, upload_url: string }>(
        `/api/meetings/meetings/${meetingId}/attachments/upload-url`,
        { method: 'POST', body: { filename: file.name, content_type: contentType, size_bytes: file.size } }
      )
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) onProgress(e.loaded / e.total)
        })
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`Upload failed with status ${xhr.status}`))
        })
        xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
        xhr.open('PUT', upload_url)
        xhr.setRequestHeader('Content-Type', contentType)
        xhr.send(file)
      })
      return await $fetch<{ attachment: MeetingAttachment }>(`/api/meetings/meetings/${meetingId}/attachments`, {
        method: 'POST',
        body: { attachment_id, filename: file.name, content_type: contentType }
      })
    })
  }

  return { call, uploadFile }
}

export interface MeetingsAiStatus {
  configured: boolean
  hasEnabledModel: boolean
  featureAvailable: boolean
}

// Whether an AI feature can run for the active org. Resolves to false when
// the AI layer isn't loaded.
export function useMeetingsAiAvailable(feature: string) {
  const available = ref(false)
  onMounted(async () => {
    try {
      const status = await $fetch<MeetingsAiStatus>(`/api/ai/status?feature=${encodeURIComponent(feature)}`)
      available.value = status.featureAvailable
    } catch {
      available.value = false
    }
  })
  return available
}
