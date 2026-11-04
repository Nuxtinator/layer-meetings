// POST /api/meetings/meetings/:id/attachments/upload-url  { filename, content_type, size_bytes }
// A presigned PUT URL for uploading a file straight to the private bucket.
// The returned id is baked into the object key and becomes the row id when
// the upload is completed.
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { presignedPutUrl } from '#core/server/utils/storage'
import { parseMeetingsBody, requireMeeting, requireMeetingsId } from '../../../../../../utils/meetings-helpers'
import { MEETINGS_MAX_FILE_BYTES, meetingsAttachmentKey } from '../../../../../../utils/meetings-attachments'

const Body = z.object({
  filename: z.string().trim().min(1).max(255),
  content_type: z.string().trim().max(255).optional(),
  size_bytes: z.number().int().positive()
})

export default defineEventHandler(async (event) => {
  const id = requireMeetingsId(event)
  const body = parseMeetingsBody(Body, await readBody(event))
  if (body.size_bytes > MEETINGS_MAX_FILE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: `File too large (max ${MEETINGS_MAX_FILE_BYTES / 1024 ** 3} GB).` })
  }
  return await withOrgPermission(event, { appId: 'meetings' }, 'meetings.read', async (tx, ctx) => {
    await requireMeeting(tx, ctx, id, 'edit')
    const attachmentId = randomUUID()
    const key = meetingsAttachmentKey(attachmentId, body.filename)
    const url = await presignedPutUrl(key, body.content_type || 'application/octet-stream', 3600)
    return { attachment_id: attachmentId, upload_url: url }
  })
})
