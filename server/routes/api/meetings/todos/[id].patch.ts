// PATCH /api/meetings/todos/:id  { text?, assignee_user_id?, due_date?, done? }
// A new assignee must be a user participant and is notified.
import { z } from 'zod'
import { sql } from 'kysely'
import { withOrgPermission } from '#tenant/server'
import { logUpdate } from '#core/server/utils/activity-logger'
import {
  meetingsDate,
  meetingsUuid,
  notifyMeetingTodoAssigned,
  parseMeetingsBody,
  requireMeeting,
  requireMeetingAssignee,
  requireMeetingTodo,
  requireMeetingsId,
  touchMeeting
} from '../../../../utils/meetings-helpers'

const Body = z.object({
  text: z.string().trim().min(1).max(1000).optional(),
  assignee_user_id: meetingsUuid.nullable().optional(),
  due_date: meetingsDate.nullable().optional(),
  done: z.boolean().optional()
})

export default defineEventHandler(async (event) => {
  const id = requireMeetingsId(event)
  const body = parseMeetingsBody(Body, await readBody(event))
  return await withOrgPermission(event, { appId: 'meetings' }, 'meetings.read', async (tx, ctx) => {
    const todo = await requireMeetingTodo(tx, id)
    const { meeting } = await requireMeeting(tx, ctx, todo.meeting_id, 'edit')

    const updates: Record<string, unknown> = {}
    if (body.text !== undefined) updates.text = body.text
    if (body.due_date !== undefined) updates.due_date = body.due_date
    if (body.assignee_user_id !== undefined) {
      await requireMeetingAssignee(tx, todo.meeting_id, body.assignee_user_id)
      updates.assignee_user_id = body.assignee_user_id
    }
    if (body.done !== undefined && body.done !== !!todo.done_at) {
      updates.done_at = body.done ? sql`now()` : null
      updates.done_by = body.done ? ctx.userId : null
    }
    if (Object.keys(updates).length === 0) return { ok: true }
    updates.updated_at = sql`now()`

    await tx.updateTable('meetings_todos').set(updates).where('id', '=', id).execute()

    if (body.assignee_user_id && body.assignee_user_id !== todo.assignee_user_id) {
      await notifyMeetingTodoAssigned(tx, {
        assigneeId: body.assignee_user_id,
        actorId: ctx.userId,
        meetingId: todo.meeting_id,
        meetingTitle: meeting.title,
        todoText: body.text ?? todo.text
      })
    }
    await touchMeeting(tx, todo.meeting_id)
    logUpdate('meetings_todos', id, ctx.userId, { fields: Object.keys(updates) })
    return { ok: true }
  })
})
