// GET /api/meetings/meetings[?q=]
// The meetings the caller may see, newest first, with participant and
// open-task counts. With `q`, only meetings whose title, location, shared
// notes, transcript or the caller's own notes contain it, each with a
// snippet of where it matched.
import { sql } from 'kysely'
import { withOrgPermission } from '#tenant/server'
import { loadMeetingsUsers, meetingsUserOrUnknown, meetingsVisibleTo } from '../../../../utils/meetings-helpers'
import { findMeetingsMatches, meetingsContains } from '../../../../utils/meetings-search'
import { countMeetingTasks } from '../../../../utils/meetings-tasks'

export default defineEventHandler(async (event) => {
  const raw = getQuery(event).q
  const q = typeof raw === 'string' ? raw.trim().slice(0, 200) : ''

  return await withOrgPermission(event, { appId: 'meetings' }, 'meetings.read', async (tx, ctx) => {
    const rows = await tx
      .selectFrom('meetings as m')
      .select([
        'm.id', 'm.title', 'm.starts_at', 'm.location', 'm.visibility', 'm.created_by', 'm.updated_at',
        sql<number>`(select count(*)::int from meetings_participants p where p.meeting_id = m.id)`.as('participants_count'),
        sql<number>`(select count(*)::int from meetings_attachments a where a.meeting_id = m.id)`.as('attachments_count'),
        sql<boolean>`m.transcript is not null`.as('has_transcript')
      ])
      .where(meetingsVisibleTo(ctx))
      .$if(!!q, qb => qb.where(eb => eb.or([
        meetingsContains(sql.ref('m.title'), q),
        meetingsContains(sql.ref('m.location'), q),
        meetingsContains(sql.ref('m.transcript'), q),
        eb.exists(
          eb.selectFrom('meetings_documents as sd')
            .select('sd.meeting_id')
            .whereRef('sd.meeting_id', '=', 'm.id')
            .where(meetingsContains(sql.ref('sd.body_md'), q))
        ),
        eb.exists(
          eb.selectFrom('meetings_notes as sn')
            .select('sn.id')
            .whereRef('sn.meeting_id', '=', 'm.id')
            .where('sn.user_id', '=', ctx.userId)
            .where(meetingsContains(sql.ref('sn.body_md'), q))
        )
      ])))
      .orderBy('m.starts_at', 'desc')
      .execute()

    const users = await loadMeetingsUsers(tx, rows.map(r => r.created_by))
    const tasks = await countMeetingTasks(tx, rows.map(r => r.id))
    const matches = q ? await findMeetingsMatches(tx, rows.map(r => r.id), ctx.userId, q) : null
    return {
      meetings: rows.map(({ created_by, ...r }) => ({
        ...r,
        open_tasks: tasks.get(r.id)?.open ?? 0,
        created_by: meetingsUserOrUnknown(users, created_by),
        ...(matches ? { match: matches.get(r.id) ?? null } : {})
      }))
    }
  })
})
