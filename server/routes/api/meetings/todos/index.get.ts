// GET /api/meetings/todos?status=open|done
// Todos assigned to the caller across every meeting, with their meeting.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { MEETINGS_TODO_COLUMNS, loadMeetingsUsers, meetingTodoPayload } from '../../../../utils/meetings-helpers'

const Query = z.object({ status: z.enum(['open', 'done']).default('open') })

export default defineEventHandler(async (event) => {
  const parsed = Query.safeParse(getQuery(event))
  const status = parsed.success ? parsed.data.status : 'open'
  return await withOrgPermission(event, { appId: 'meetings' }, 'meetings.read', async (tx, ctx) => {
    let query = tx
      .selectFrom('meetings_todos as t')
      .innerJoin('meetings as m', 'm.id', 't.meeting_id')
      .select([...MEETINGS_TODO_COLUMNS, 'm.title as meeting_title', 'm.starts_at as meeting_starts_at'])
      .where('t.assignee_user_id', '=', ctx.userId)
    query = status === 'open'
      ? query.where('t.done_at', 'is', null).orderBy('t.due_date', 'asc').orderBy('t.created_at', 'asc')
      : query.where('t.done_at', 'is not', null).orderBy('t.done_at', 'desc').limit(200)

    const rows = await query.execute()
    const users = await loadMeetingsUsers(tx, rows.map(r => r.assignee_user_id))
    return {
      todos: rows.map(r => ({
        ...meetingTodoPayload(r, users),
        meeting: { id: r.meeting_id, title: r.meeting_title, starts_at: r.meeting_starts_at }
      }))
    }
  })
})
