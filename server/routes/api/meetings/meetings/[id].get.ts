// GET /api/meetings/meetings/:id
// The full meeting: details, transcript, participants, files with fresh
// signed URLs, todos, and the caller's own notes.
import { withOrgPermission } from '#tenant/server'
import {
  MEETINGS_TODO_COLUMNS,
  loadMeetingsUsers,
  meetingTodoPayload,
  meetingsUserOrNull,
  meetingsUserOrUnknown,
  requireMeeting,
  requireMeetingsId,
  signMeetingAttachment
} from '../../../../utils/meetings-helpers'

export default defineEventHandler(async (event) => {
  const id = requireMeetingsId(event)
  return await withOrgPermission(event, { appId: 'meetings' }, 'meetings.read', async (tx, ctx) => {
    const { meeting, canEdit, canDelete } = await requireMeeting(tx, ctx, id)

    const [participants, attachmentRows, todos, mine] = await Promise.all([
      tx.selectFrom('meetings_participants')
        .select(['id', 'user_id', 'name', 'email', 'created_at'])
        .where('meeting_id', '=', id)
        .orderBy('created_at', 'asc')
        .execute(),
      tx.selectFrom('meetings_attachments')
        .select(['id', 'storage_key', 'filename', 'mime_type', 'size_bytes', 'created_by', 'created_at'])
        .where('meeting_id', '=', id)
        .orderBy('created_at', 'asc')
        .execute(),
      tx.selectFrom('meetings_todos as t')
        .select(MEETINGS_TODO_COLUMNS)
        .where('t.meeting_id', '=', id)
        .orderBy('t.created_at', 'asc')
        .execute(),
      tx.selectFrom('meetings_notes')
        .select(['body_md', 'updated_at'])
        .where('meeting_id', '=', id)
        .where('user_id', '=', ctx.userId)
        .executeTakeFirst()
    ])

    const users = await loadMeetingsUsers(tx, [
      meeting.created_by,
      ...participants.map(p => p.user_id),
      ...todos.map(t => t.assignee_user_id)
    ])
    const attachments = await Promise.all(attachmentRows.map(signMeetingAttachment))

    return {
      meeting: {
        id: meeting.id,
        title: meeting.title,
        starts_at: meeting.starts_at,
        location: meeting.location,
        visibility: meeting.visibility,
        transcript: meeting.transcript,
        created_by: meetingsUserOrUnknown(users, meeting.created_by),
        created_at: meeting.created_at,
        updated_at: meeting.updated_at,
        can_edit: canEdit,
        can_delete: canDelete,
        participants: participants.map(p => ({
          id: p.id,
          user: meetingsUserOrNull(users, p.user_id),
          name: p.name,
          email: p.email
        })),
        attachments: attachments.map(({ created_by, ...a }) => ({ ...a, created_by: meetingsUserOrUnknown(users, created_by) })),
        todos: todos.map(t => meetingTodoPayload(t, users)),
        my_note: mine ?? null
      }
    }
  })
})
