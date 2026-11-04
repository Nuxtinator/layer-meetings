// DELETE /api/meetings/todos/:id
import { withOrgPermission } from '#tenant/server'
import { logDelete } from '#core/server/utils/activity-logger'
import { requireMeeting, requireMeetingTodo, requireMeetingsId, touchMeeting } from '../../../../utils/meetings-helpers'

export default defineEventHandler(async (event) => {
  const id = requireMeetingsId(event)
  return await withOrgPermission(event, { appId: 'meetings' }, 'meetings.read', async (tx, ctx) => {
    const todo = await requireMeetingTodo(tx, id)
    await requireMeeting(tx, ctx, todo.meeting_id, 'edit')
    await tx.deleteFrom('meetings_todos').where('id', '=', id).execute()
    await touchMeeting(tx, todo.meeting_id)
    logDelete('meetings_todos', id, ctx.userId)
    return { ok: true }
  })
})
