// POST /api/meetings/meetings/:id/attachments  { attachment_id, filename, content_type }
// Records a file after the browser has PUT it to the bucket. The key is
// derived from the id and filename the same way upload-url derived it, and
// the object's real size comes from the bucket.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { deleteFromS3, statS3Object } from '#core/server/utils/storage'
import { logCreate } from '#core/server/utils/activity-logger'
import {
  meetingsUserOrUnknown,
  loadMeetingsUsers,
  meetingsUuid,
  parseMeetingsBody,
  requireMeeting,
  requireMeetingsId,
  signMeetingAttachment,
  touchMeeting
} from '../../../../../../utils/meetings-helpers'
import { MEETINGS_MAX_FILE_BYTES, meetingsAttachmentKey } from '../../../../../../utils/meetings-attachments'

const Body = z.object({
  attachment_id: meetingsUuid,
  filename: z.string().trim().min(1).max(255),
  content_type: z.string().trim().max(255).optional()
})

export default defineEventHandler(async (event) => {
  const id = requireMeetingsId(event)
  const body = parseMeetingsBody(Body, await readBody(event))
  return await withOrgPermission(event, { appId: 'meetings' }, 'meetings.read', async (tx, ctx) => {
    await requireMeeting(tx, ctx, id, 'edit')

    const key = meetingsAttachmentKey(body.attachment_id, body.filename)
    const stat = await statS3Object(key)
    if (!stat) throw createError({ statusCode: 400, statusMessage: 'Upload not found. Try again.' })
    if (stat.size > MEETINGS_MAX_FILE_BYTES) {
      await deleteFromS3(key).catch(() => {})
      throw createError({ statusCode: 413, statusMessage: 'File too large.' })
    }

    const existing = await tx.selectFrom('meetings_attachments').select('id').where('id', '=', body.attachment_id).executeTakeFirst()
    if (existing) throw createError({ statusCode: 409, statusMessage: 'This upload was already recorded.' })

    const row = await tx
      .insertInto('meetings_attachments')
      .values({
        id: body.attachment_id,
        meeting_id: id,
        storage_key: key,
        filename: body.filename,
        mime_type: body.content_type || stat.contentType || 'application/octet-stream',
        size_bytes: stat.size,
        created_by: ctx.userId
      })
      .returning(['id', 'storage_key', 'filename', 'mime_type', 'size_bytes', 'created_by', 'created_at'])
      .executeTakeFirstOrThrow()

    await touchMeeting(tx, id)
    logCreate('meetings_attachments', row.id, ctx.userId, { mime: row.mime_type })
    const users = await loadMeetingsUsers(tx, [row.created_by])
    const { created_by, ...signed } = await signMeetingAttachment(row)
    return { attachment: { ...signed, created_by: meetingsUserOrUnknown(users, created_by) } }
  })
})
