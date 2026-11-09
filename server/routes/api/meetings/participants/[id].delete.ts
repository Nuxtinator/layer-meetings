// DELETE /api/meetings/participants/:id
// Tasks assigned to a removed participant stay theirs.
import { withOrgPermission } from '#tenant/server'
import { logDelete } from '#core/server/utils/activity-logger'
import { requireMeeting, requireMeetingsId, touchMeeting } from '../../../../utils/meetings-helpers'

export default defineEventHandler(async (event) => {
  const id = requireMeetingsId(event)
  return await withOrgPermission(event, { appId: 'meetings' }, 'meetings.read', async (tx, ctx) => {
    const participant = await tx
      .selectFrom('meetings_participants')
      .select(['id', 'meeting_id', 'user_id'])
      .where('id', '=', id)
      .executeTakeFirst()
    if (!participant) throw createError({ statusCode: 404, statusMessage: 'Participant not found' })
    await requireMeeting(tx, ctx, participant.meeting_id, 'edit')

    await tx.deleteFrom('meetings_participants').where('id', '=', id).execute()
    await touchMeeting(tx, participant.meeting_id)
    logDelete('meetings_participants', id, ctx.userId)
    return { ok: true }
  })
})
