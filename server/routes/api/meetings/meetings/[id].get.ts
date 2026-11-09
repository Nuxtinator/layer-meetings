// GET /api/meetings/meetings/:id
// The full meeting: details, transcript, participants, files with fresh
// signed URLs, its task counts, and the caller's own notes. The tasks
// themselves come from the built-in `meeting-tasks` view.
import { withOrgPermission } from '#tenant/server'
import {
  loadMeetingsUsers,
  meetingsUserOrNull,
  meetingsUserOrUnknown,
  requireMeeting,
  requireMeetingsId,
  signMeetingAttachment
} from '../../../../utils/meetings-helpers'
import { countMeetingTasks } from '../../../../utils/meetings-tasks'

export default defineEventHandler(async (event) => {
  const id = requireMeetingsId(event)
  return await withOrgPermission(event, { appId: 'meetings' }, 'meetings.read', async (tx, ctx) => {
    const { meeting, canEdit, canDelete } = await requireMeeting(tx, ctx, id)

    const [participants, attachmentRows, tasks, mine] = await Promise.all([
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
      countMeetingTasks(tx, [id]),
      tx.selectFrom('meetings_notes')
        .select(['body_md', 'updated_at'])
        .where('meeting_id', '=', id)
        .where('user_id', '=', ctx.userId)
        .executeTakeFirst()
    ])

    const users = await loadMeetingsUsers(tx, [
      meeting.created_by,
      ...participants.map(p => p.user_id)
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
        tasks: tasks.get(id) ?? { total: 0, open: 0 },
        my_note: mine ?? null
      }
    }
  })
})
