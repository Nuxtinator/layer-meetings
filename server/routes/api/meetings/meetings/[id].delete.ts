// DELETE /api/meetings/meetings/:id — cascades to participants, notes, todos
// and file rows, then removes the stored files.
import { withOrgPermission } from '#tenant/server'
import { deleteFromS3 } from '#core/server/utils/storage'
import { logDelete } from '#core/server/utils/activity-logger'
import { requireMeeting, requireMeetingsId } from '../../../../utils/meetings-helpers'

export default defineEventHandler(async (event) => {
  const id = requireMeetingsId(event)
  return await withOrgPermission(event, { appId: 'meetings' }, 'meetings.read', async (tx, ctx) => {
    const { canDelete } = await requireMeeting(tx, ctx, id)
    if (!canDelete) throw createError({ statusCode: 403, statusMessage: 'Only the creator can delete this meeting' })

    const files = await tx.selectFrom('meetings_attachments').select('storage_key').where('meeting_id', '=', id).execute()
    await tx.deleteFrom('meetings').where('id', '=', id).execute()
    for (const f of files) {
      try {
        await deleteFromS3(f.storage_key)
      } catch (e) {
        console.error('[meetings] failed to delete object', f.storage_key, e)
      }
    }
    logDelete('meetings', id, ctx.userId)
    return { ok: true }
  })
})
