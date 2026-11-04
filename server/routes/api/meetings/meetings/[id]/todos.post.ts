// POST /api/meetings/meetings/:id/todos  { text, assignee_user_id?, due_date? }
// The assignee must be a user participant and is notified.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { logCreate } from '#core/server/utils/activity-logger'
import {
  MEETINGS_TODO_COLUMNS,
  loadMeetingsUsers,
  meetingTodoPayload,
  meetingsDate,
  meetingsUuid,
  notifyMeetingTodoAssigned,
  parseMeetingsBody,
  requireMeeting,
  requireMeetingAssignee,
  requireMeetingsId,
  touchMeeting
} from '../../../../../utils/meetings-helpers'

const Body = z.object({
  text: z.string().trim().min(1).max(1000),
  assignee_user_id: meetingsUuid.nullable().optional(),
  due_date: meetingsDate.nullable().optional()
})

export default defineEventHandler(async (event) => {
  const id = requireMeetingsId(event)
  const body = parseMeetingsBody(Body, await readBody(event))
  return await withOrgPermission(event, { appId: 'meetings' }, 'meetings.read', async (tx, ctx) => {
    const { meeting } = await requireMeeting(tx, ctx, id, 'edit')
    await requireMeetingAssignee(tx, id, body.assignee_user_id)

    const inserted = await tx
      .insertInto('meetings_todos')
      .values({
        meeting_id: id,
        text: body.text,
        assignee_user_id: body.assignee_user_id ?? null,
        due_date: body.due_date ?? null,
        created_by: ctx.userId
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    if (body.assignee_user_id) {
      await notifyMeetingTodoAssigned(tx, {
        assigneeId: body.assignee_user_id,
        actorId: ctx.userId,
        meetingId: id,
        meetingTitle: meeting.title,
        todoText: body.text
      })
    }
    await touchMeeting(tx, id)
    logCreate('meetings_todos', inserted.id, ctx.userId)

    const todo = await tx.selectFrom('meetings_todos as t').select(MEETINGS_TODO_COLUMNS).where('t.id', '=', inserted.id).executeTakeFirstOrThrow()
    const users = await loadMeetingsUsers(tx, [todo.assignee_user_id])
    return { todo: meetingTodoPayload(todo, users) }
  })
})
