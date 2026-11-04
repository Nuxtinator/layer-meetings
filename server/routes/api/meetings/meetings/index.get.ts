// GET /api/meetings/meetings
// The meetings the caller may see, newest first, with participant and
// open-todo counts.
import { sql } from 'kysely'
import { withOrgPermission } from '#tenant/server'
import { loadMeetingsUsers, meetingsUserOrUnknown, meetingsVisibleTo } from '../../../../utils/meetings-helpers'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'meetings' }, 'meetings.read', async (tx, ctx) => {
    const rows = await tx
      .selectFrom('meetings as m')
      .select([
        'm.id', 'm.title', 'm.starts_at', 'm.location', 'm.visibility', 'm.created_by', 'm.updated_at',
        sql<number>`(select count(*)::int from meetings_participants p where p.meeting_id = m.id)`.as('participants_count'),
        sql<number>`(select count(*)::int from meetings_todos t where t.meeting_id = m.id and t.done_at is null)`.as('open_todos'),
        sql<number>`(select count(*)::int from meetings_attachments a where a.meeting_id = m.id)`.as('attachments_count'),
        sql<boolean>`m.transcript is not null`.as('has_transcript')
      ])
      .where(meetingsVisibleTo(ctx))
      .orderBy('m.starts_at', 'desc')
      .execute()

    const users = await loadMeetingsUsers(tx, rows.map(r => r.created_by))
    return {
      meetings: rows.map(({ created_by, ...r }) => ({ ...r, created_by: meetingsUserOrUnknown(users, created_by) }))
    }
  })
})
