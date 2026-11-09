// A meeting's action items are `task` records (records layer) whose
// `meeting` ref field holds the meeting's id. This file wires that up: the
// ref source that names meetings, the visibility source that lets everyone
// who can see a meeting see its tasks, the built-in view a meeting page
// embeds, and the task reads and deletes the meetings routes need.

import { sql, type SqlBool } from 'kysely'
import type { TenantContext } from '#tenant/server'
import { getRecordTypeFields, type RecordsRefSource, type RecordsShareVia, type RecordsVisibilitySource } from '#records/server'
import type { ViewsBuiltInView } from '#views/server'
import { meetingsUuid, meetingsVisibleTo, type MeetingsTx } from './meetings-helpers'

export const MEETINGS_TASK_FIELD = 'meeting'
export const MEETINGS_TASKS_VIEW = 'meeting-tasks'

// The task's meeting id as text (null when unset). The key is a literal so
// the same expression in a select and its GROUP BY compare equal.
const taskMeetingId = sql<string | null>`records_entries.data->>${sql.lit(MEETINGS_TASK_FIELD)}`

function validIds(ids: string[]): string[] {
  return ids.filter(id => meetingsUuid.safeParse(id).success)
}

async function visibleMeetings(tx: MeetingsTx, ctx: TenantContext, ids: string[]) {
  if (ids.length === 0) return []
  return await tx
    .selectFrom('meetings as m')
    .select(['m.id', 'm.title', 'm.visibility', 'm.created_by'])
    .where('m.id', 'in', ids)
    .where(meetingsVisibleTo(ctx))
    .execute()
}

export const meetingsRefSource: RecordsRefSource = {
  source: 'meetings',
  label: 'Meeting',
  resolve: async (tx, ctx, ids) => {
    const valid = validIds(ids)
    if (valid.length === 0) return new Map()
    const existing = await tx.selectFrom('meetings').select('id').where('id', 'in', valid).execute()
    const visible = new Map((await visibleMeetings(tx, ctx, valid)).map(m => [m.id, m.title]))
    return new Map(existing.map(({ id }) => {
      const title = visible.get(id)
      return [id, title === undefined ? 'hidden' as const : { label: title, url: `/meetings/${id}` }]
    }))
  },
  search: async (tx, ctx, q, limit) => {
    let query = tx
      .selectFrom('meetings as m')
      .select(['m.id', 'm.title'])
      .where(meetingsVisibleTo(ctx))
    if (q) query = query.where('m.title', 'ilike', `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`)
    const rows = await query.orderBy('m.starts_at', 'desc').limit(limit).execute()
    return rows.map(r => ({ id: r.id, label: r.title }))
  }
}

// Tasks are visible to whoever can see their meeting: everyone in the org
// for an org-wide meeting, else its creator and its team members.
export const meetingsTaskVisibility: RecordsVisibilitySource = {
  id: 'meetings',
  predicate: (_eb, { userId, typeKey }) => {
    if (typeKey !== 'task') return sql<SqlBool>`false`
    return sql<SqlBool>`exists (
      select 1 from meetings vm
      where vm.id = (${taskMeetingId})::uuid
        and (vm.visibility = 'org'
          or vm.created_by = ${userId}::uuid
          or exists (select 1 from meetings_participants vp where vp.meeting_id = vm.id and vp.user_id = ${userId}::uuid))
    )`
  },
  describe: async (tx, ctx, recordId) => {
    const row = await tx
      .selectFrom('records_entries')
      .select(taskMeetingId.as('meeting_id'))
      .where('id', '=', recordId)
      .where('record_type', '=', 'task')
      .executeTakeFirst()
    if (!row?.meeting_id || !meetingsUuid.safeParse(row.meeting_id).success) return []
    const [meeting] = await visibleMeetings(tx, ctx, [row.meeting_id])
    if (!meeting) return []
    let audience: RecordsShareVia['audience']
    if (meeting.visibility === 'org') {
      audience = [{ kind: 'everyone', name: 'Everyone', level: 'view' }]
    } else {
      const participants = await tx
        .selectFrom('meetings_participants')
        .select('user_id')
        .where('meeting_id', '=', meeting.id)
        .execute()
      const ids = [...new Set([meeting.created_by, ...participants.map(p => p.user_id).filter((id): id is string => !!id)])]
      const people = await tx.selectFrom('users').select('display_name').where('id', 'in', ids).orderBy('display_name').execute()
      audience = people.map(p => ({ kind: 'user' as const, name: p.display_name, level: 'view' as const }))
    }
    return [{ sourceId: 'meetings', label: meeting.title, path: `/meetings/${meeting.id}`, audience }]
  }
}

export const meetingTasksView: ViewsBuiltInView = {
  key: MEETINGS_TASKS_VIEW,
  name: 'Meeting tasks',
  icon: 'i-lucide-list-checks',
  recordTypeKey: 'task',
  filter: param => ({ match: 'all', rules: [{ field: MEETINGS_TASK_FIELD, op: 'is', value: param ?? '' }] }),
  param: {
    resolve: async (tx, ctx, param) => {
      if (!meetingsUuid.safeParse(param).success) return null
      const [meeting] = await visibleMeetings(tx, ctx, [param])
      return meeting ? { name: `Tasks · ${meeting.title}` } : null
    }
  },
  tabs: [
    { key: 'list', name: 'List', layout: 'list', definition: { sort: { field: 'created_at', dir: 'asc' } } },
    { key: 'board', name: 'Board', layout: 'kanban', definition: { groupField: 'status' } }
  ]
}

// The task statuses that close a task, as this org has them.
async function closedTaskStatuses(tx: MeetingsTx): Promise<string[]> {
  const status = (await getRecordTypeFields(tx, 'task')).find(f => f.column === 'status')
  return Object.entries(status?.options ?? {}).filter(([, o]) => o.closed).map(([key]) => key)
}

/** Per meeting: how many tasks it has, and how many are still open. */
export async function countMeetingTasks(tx: MeetingsTx, meetingIds: string[]): Promise<Map<string, { total: number, open: number }>> {
  const out = new Map<string, { total: number, open: number }>()
  if (meetingIds.length === 0) return out
  const closed = await closedTaskStatuses(tx)
  const isOpen = closed.length > 0
    ? sql<boolean>`coalesce(records_entries.status, '') not in (${sql.join(closed)})`
    : sql<boolean>`true`
  const rows = await tx
    .selectFrom('records_entries')
    .select([
      taskMeetingId.as('meeting_id'),
      sql<number>`count(*)::int`.as('total'),
      sql<number>`(count(*) filter (where ${isOpen}))::int`.as('open')
    ])
    .where('record_type', '=', 'task')
    .where(taskMeetingId, 'in', meetingIds)
    .groupBy(taskMeetingId)
    .execute()
  for (const r of rows) if (r.meeting_id) out.set(r.meeting_id, { total: r.total, open: r.open })
  return out
}

/** Deletes every task of the meeting (their comments, activity and files go with them). */
export async function deleteMeetingTasks(tx: MeetingsTx, meetingId: string): Promise<void> {
  await tx
    .deleteFrom('records_entries')
    .where('record_type', '=', 'task')
    .where(taskMeetingId, '=', meetingId)
    .execute()
}
