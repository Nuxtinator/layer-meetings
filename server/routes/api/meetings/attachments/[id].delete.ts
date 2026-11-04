// DELETE /api/meetings/attachments/:id — removes the row, then the object.
import { withOrgPermission } from '#tenant/server'
import { deleteFromS3 } from '#core/server/utils/storage'
import { logDelete } from '#core/server/utils/activity-logger'
import { requireMeeting, requireMeetingsId, touchMeeting } from '../../../../utils/meetings-helpers'

export default defineEventHandler(async (event) => {
  const id = requireMeetingsId(event)
  return await withOrgPermission(event, { appId: 'meetings' }, 'meetings.read', async (tx, ctx) => {
    const row = await tx
      .selectFrom('meetings_attachments')
      .select(['meeting_id', 'storage_key'])
      .where('id', '=', id)
      .executeTakeFirst()
    if (!row) throw createError({ statusCode: 404, statusMessage: 'File not found' })
    await requireMeeting(tx, ctx, row.meeting_id, 'edit')

    await tx.deleteFrom('meetings_attachments').where('id', '=', id).execute()
    try {
      await deleteFromS3(row.storage_key)
    } catch (e) {
      console.error('[meetings] failed to delete object', row.storage_key, e)
    }
    await touchMeeting(tx, row.meeting_id)
    logDelete('meetings_attachments', id, ctx.userId)
    return { ok: true }
  })
})
