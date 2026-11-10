// MCP tools for meetings. Registered by modules/meetings-mcp.ts only when the
// MCP layer is loaded.
//
// Every tool takes an optional `org` slug and runs inside `withOrgPermission`,
// the kernel the HTTP routes use, with the same rules: reads take
// `meetings.read`; creating a meeting takes `meetings.create`; changing one
// takes `meetings.read` plus being its creator, a team member on it, or a
// meetings admin. A meeting's tasks are records `task` records, so adding them
// also needs the records task create permission.
import { z } from 'zod'
import { createError } from 'h3'
import { sql } from 'kysely'
import { defineMcpTool, mcpLog, type McpToolContext } from '#mcp-layer'
import { withOrgPermission, type TenantContext } from '#tenant/server'
import type { Permission } from '#core/app/utils/permissions'
import { applyFieldPatch, hydrateRecords, listRecords, requireTypePermission } from '#records/server'
import { MEETINGS_DEFAULT_VISIBILITY } from '../app/utils/meetings-format'
import {
  isMeetingParticipant,
  loadMeetingsUsers,
  meetingsUserOrNull,
  meetingsUserOrUnknown,
  meetingsVisibleTo,
  requireMeeting,
  touchMeeting,
  type MeetingsTx
} from '../server/utils/meetings-helpers'
import { countMeetingTasks, MEETINGS_TASK_FIELD } from '../server/utils/meetings-tasks'
import { readMeetingsDocument, writeMeetingsDocument } from '../server/utils/meetings-documents'

const MAX_TRANSCRIPT_CHARS = 2_000_000
const MAX_NOTES_CHARS = 512 * 1024
const MAX_TASKS_LISTED = 100

const orgInput = z.string().min(1).max(64).optional()
  .describe('Org slug to operate in. Defaults to the X-Active-Org header sent by the client.')

const meetingIdInput = z.string().uuid().describe('Meeting id, from meetings_list.')

const userIdInput = z.string().uuid().describe('User id, from meetings_list_people.')

const startsAtInput = z.string().min(1).max(64)
  .describe('When the meeting starts, as an ISO 8601 date-time, e.g. "2026-11-10T15:00:00-06:00".')

const titleInput = z.string().trim().min(1).max(300)
const locationInput = z.string().trim().max(500).nullable()
const visibilityInput = z.enum(['org', 'private'])
  .describe('"org": everyone in the org who can read meetings sees it. "private": only its creator, its team members and meetings admins.')
const transcriptInput = z.string().max(MAX_TRANSCRIPT_CHARS).nullable()
  .describe('The meeting transcript as plain text. Replaces any transcript already there; null or an empty string clears it.')

function run<T>(
  ctx: McpToolContext,
  org: string | undefined,
  perm: Permission,
  fn: (tx: MeetingsTx, tenant: TenantContext) => Promise<T>
): Promise<T> {
  return withOrgPermission(ctx.event, { appId: 'meetings', org }, perm, fn)
}

// Dates become ISO strings so the payload is plain JSON.
function plain<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function text(message: string, structured: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: message }], structuredContent: plain(structured) }
}

function parseStartsAt(value: string): Date {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw createError({ statusCode: 400, statusMessage: `starts_at is not a valid date-time: ${value}` })
  }
  return date
}

function cleanTranscript(value: string | null): string | null {
  return value?.trim() ? value : null
}

async function requireOrgMembers(tx: MeetingsTx, tenant: TenantContext, userIds: string[]): Promise<void> {
  if (!tenant.orgId || userIds.length === 0) return
  const rows = await tx
    .selectFrom('memberships')
    .select('user_id')
    .where('org_id', '=', tenant.orgId)
    .where('user_id', 'in', userIds)
    .execute()
  const members = new Set(rows.map(r => r.user_id))
  const missing = userIds.filter(id => !members.has(id))
  if (missing.length > 0) {
    throw createError({ statusCode: 400, statusMessage: `Not members of this organization: ${missing.join(', ')}` })
  }
}

// ─── Read tools ─────────────────────────────────────────────────────────────

export const listMeetingsTool = defineMcpTool({
  name: 'meetings_list',
  title: 'List Meetings',
  description: 'List the meetings you can see, newest first, optionally filtered by title. Each has its id, time, whether it has a transcript, and its participant and open-task counts. Call this to find a meeting before reading or changing it.',
  appId: 'meetings',
  scope: 'meetings.read',
  readOnly: true,
  input: z.object({
    org: orgInput,
    q: z.string().trim().max(200).optional().describe('Text the title contains (case-insensitive).'),
    limit: z.number().int().min(1).max(200).optional().describe('At most this many meetings (default 50).')
  }).strict(),
  handler: async (input, ctx) => {
    return await run(ctx, input.org, 'meetings.read', async (tx, tenant) => {
      let query = tx
        .selectFrom('meetings as m')
        .select([
          'm.id', 'm.title', 'm.starts_at', 'm.location', 'm.visibility',
          sql<number>`(select count(*)::int from meetings_participants p where p.meeting_id = m.id)`.as('participants_count'),
          sql<boolean>`m.transcript is not null`.as('has_transcript')
        ])
        .where(meetingsVisibleTo(tenant))
      if (input.q) query = query.where('m.title', 'ilike', `%${input.q.replace(/[\\%_]/g, c => `\\${c}`)}%`)
      const rows = await query.orderBy('m.starts_at', 'desc').limit(input.limit ?? 50).execute()
      const tasks = await countMeetingTasks(tx, rows.map(r => r.id))
      const meetings = rows.map(r => ({ ...r, open_tasks: tasks.get(r.id)?.open ?? 0 }))
      return text(`${meetings.length} meeting(s).`, { meetings })
    })
  }
})

export const getMeetingTool = defineMcpTool({
  name: 'meetings_get',
  title: 'Get Meeting',
  description: 'Get one meeting: its details, whether you can edit it, its participants (with user ids for assigning tasks), its shared meeting notes as Markdown, and its tasks. The transcript is left out unless include_transcript is true, since it can be long.',
  appId: 'meetings',
  scope: 'meetings.read',
  readOnly: true,
  input: z.object({
    org: orgInput,
    meeting_id: meetingIdInput,
    include_transcript: z.boolean().optional().describe('Include the full transcript text (default false).')
  }).strict(),
  handler: async (input, ctx) => {
    return await run(ctx, input.org, 'meetings.read', async (tx, tenant) => {
      const { meeting, canEdit } = await requireMeeting(tx, tenant, input.meeting_id)
      const participants = await tx
        .selectFrom('meetings_participants')
        .select(['id', 'user_id', 'name', 'email'])
        .where('meeting_id', '=', meeting.id)
        .orderBy('created_at', 'asc')
        .execute()
      const users = await loadMeetingsUsers(tx, [meeting.created_by, ...participants.map(p => p.user_id)])
      const notes = await readMeetingsDocument(tx, { orgId: tenant.orgId ?? null, meetingId: meeting.id })

      // Listing tasks needs records access the token may not carry; the
      // meeting itself is still returned without them.
      let tasks: unknown[] | null = null
      let tasksError: string | undefined
      try {
        const { items } = await listRecords(tx, tenant, 'task', {
          filters: { [MEETINGS_TASK_FIELD]: meeting.id },
          sort: 'created_at',
          dir: 'asc',
          limit: MAX_TASKS_LISTED
        })
        tasks = (await hydrateRecords(tx, tenant, 'task', items)).map(t => ({
          id: t.id,
          name: t.name,
          status: t.status,
          assignee: t.fields.assignee ?? null,
          due_date: t.fields.due_date ?? null
        }))
      } catch (err) {
        tasksError = (err as { statusMessage?: string, message?: string }).statusMessage ?? (err as Error).message
      }

      const transcript = meeting.transcript ?? null
      return text(`${meeting.title} (${meeting.id})`, {
        meeting: {
          id: meeting.id,
          title: meeting.title,
          starts_at: meeting.starts_at,
          location: meeting.location,
          visibility: meeting.visibility,
          created_by: meetingsUserOrUnknown(users, meeting.created_by),
          can_edit: canEdit,
          participants: participants.map((p) => {
            const user = meetingsUserOrNull(users, p.user_id)
            return user
              ? { participant_id: p.id, user_id: user.id, name: user.display_name }
              : { participant_id: p.id, user_id: null, name: p.name, email: p.email }
          }),
          notes_md: notes,
          transcript_chars: transcript?.length ?? 0,
          ...(input.include_transcript ? { transcript } : {}),
          tasks,
          ...(tasksError ? { tasks_error: tasksError } : {})
        }
      })
    })
  }
})

export const listPeopleTool = defineMcpTool({
  name: 'meetings_list_people',
  title: 'List Meeting People',
  description: 'List the people who can be added to a meeting or assigned its tasks (the org\'s members), with their user ids.',
  appId: 'meetings',
  scope: 'meetings.read',
  readOnly: true,
  input: z.object({ org: orgInput }).strict(),
  handler: async (input, ctx) => {
    return await run(ctx, input.org, 'meetings.read', async (tx, tenant) => {
      const query = tenant.orgId
        ? tx
            .selectFrom('memberships')
            .innerJoin('users', 'users.id', 'memberships.user_id')
            .select(['users.id', 'users.display_name'])
            .where('memberships.org_id', '=', tenant.orgId)
        : tx.selectFrom('users').select(['users.id', 'users.display_name'])
      const people = await query.orderBy('users.display_name', 'asc').execute()
      return text(`${people.length} people.`, { people })
    })
  }
})

// ─── Write tools ────────────────────────────────────────────────────────────

export const createMeetingTool = defineMcpTool({
  name: 'meetings_create',
  title: 'Create Meeting',
  description: `Create a meeting, optionally with its team members, outside guests and transcript in the same call. You are added as its first team member. Visibility defaults to "${MEETINGS_DEFAULT_VISIBILITY}". Check meetings_list first so you don't create a duplicate.`,
  appId: 'meetings',
  scope: 'meetings.create',
  input: z.object({
    org: orgInput,
    title: titleInput,
    starts_at: startsAtInput,
    location: locationInput.optional(),
    visibility: visibilityInput.optional(),
    participant_user_ids: z.array(userIdInput).max(100).optional().describe('Team members on the meeting (user ids from meetings_list_people). Team members can edit the meeting.'),
    guests: z.array(z.object({
      name: z.string().trim().min(1).max(200),
      email: z.string().trim().email().max(320).optional()
    }).strict()).max(100).optional().describe('People outside the team.'),
    transcript: transcriptInput.optional()
  }).strict(),
  handler: async (input, ctx) => {
    return await run(ctx, input.org, 'meetings.create', async (tx, tenant) => {
      const memberIds = [...new Set(input.participant_user_ids ?? [])].filter(id => id !== tenant.userId)
      await requireOrgMembers(tx, tenant, memberIds)

      const meeting = await tx
        .insertInto('meetings')
        .values({
          title: input.title,
          starts_at: parseStartsAt(input.starts_at),
          location: input.location || null,
          visibility: input.visibility ?? MEETINGS_DEFAULT_VISIBILITY,
          transcript: cleanTranscript(input.transcript ?? null),
          created_by: tenant.userId
        })
        .returning(['id', 'title', 'starts_at', 'visibility'])
        .executeTakeFirstOrThrow()

      const participants = [
        { meeting_id: meeting.id, user_id: tenant.userId },
        ...memberIds.map(user_id => ({ meeting_id: meeting.id, user_id })),
        ...(input.guests ?? []).map(g => ({ meeting_id: meeting.id, name: g.name, email: g.email || null }))
      ]
      await tx.insertInto('meetings_participants').values(participants).execute()

      await mcpLog('CREATE', 'meetings', meeting.id, ctx, { title: meeting.title }, tx)
      return text(`Created meeting "${meeting.title}" (${meeting.id}) with ${participants.length} participant(s).`, { meeting })
    })
  }
})

export const updateMeetingTool = defineMcpTool({
  name: 'meetings_update',
  title: 'Update Meeting',
  description: 'Change a meeting\'s title, time, location, visibility or transcript. Only the fields you pass change; a transcript you pass replaces the one there. Requires being able to edit the meeting.',
  appId: 'meetings',
  scope: 'meetings.read',
  input: z.object({
    org: orgInput,
    meeting_id: meetingIdInput,
    title: titleInput.optional(),
    starts_at: startsAtInput.optional(),
    location: locationInput.optional(),
    visibility: visibilityInput.optional(),
    transcript: transcriptInput.optional()
  }).strict(),
  handler: async ({ org, meeting_id, ...fields }, ctx) => {
    return await run(ctx, org, 'meetings.read', async (tx, tenant) => {
      await requireMeeting(tx, tenant, meeting_id, 'edit')

      const updates: Record<string, unknown> = {}
      if (fields.title !== undefined) updates.title = fields.title
      if (fields.starts_at !== undefined) updates.starts_at = parseStartsAt(fields.starts_at)
      if (fields.location !== undefined) updates.location = fields.location || null
      if (fields.visibility !== undefined) updates.visibility = fields.visibility
      if (fields.transcript !== undefined) updates.transcript = cleanTranscript(fields.transcript)
      const changed = Object.keys(updates)
      if (changed.length === 0) throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
      updates.updated_at = sql`now()`

      await tx.updateTable('meetings').set(updates).where('id', '=', meeting_id).execute()
      await mcpLog('UPDATE', 'meetings', meeting_id, ctx, { fields: changed }, tx)
      return text(`Updated ${changed.join(', ')}.`, { meeting_id, changed })
    })
  }
})

export const addParticipantsTool = defineMcpTool({
  name: 'meetings_add_participants',
  title: 'Add Meeting Participants',
  description: 'Add team members (user ids from meetings_list_people) and outside guests to a meeting. People already on it are skipped. Requires being able to edit the meeting.',
  appId: 'meetings',
  scope: 'meetings.read',
  input: z.object({
    org: orgInput,
    meeting_id: meetingIdInput,
    user_ids: z.array(userIdInput).max(100).optional(),
    guests: z.array(z.object({
      name: z.string().trim().min(1).max(200),
      email: z.string().trim().email().max(320).optional()
    }).strict()).max(100).optional()
  }).strict(),
  handler: async (input, ctx) => {
    return await run(ctx, input.org, 'meetings.read', async (tx, tenant) => {
      await requireMeeting(tx, tenant, input.meeting_id, 'edit')
      const requested = [...new Set(input.user_ids ?? [])]
      await requireOrgMembers(tx, tenant, requested)

      const userIds: string[] = []
      for (const id of requested) {
        if (!(await isMeetingParticipant(tx, input.meeting_id, id))) userIds.push(id)
      }
      const rows = [
        ...userIds.map(user_id => ({ meeting_id: input.meeting_id, user_id })),
        ...(input.guests ?? []).map(g => ({ meeting_id: input.meeting_id, name: g.name, email: g.email || null }))
      ]
      if (rows.length === 0) return text('Everyone given is already on the meeting.', { added: 0 })

      await tx.insertInto('meetings_participants').values(rows).execute()
      await touchMeeting(tx, input.meeting_id)
      await mcpLog('CREATE', 'meetings_participants', input.meeting_id, ctx, { added: rows.length }, tx)
      return text(`Added ${rows.length} participant(s).`, { added: rows.length })
    })
  }
})

export const writeNotesTool = defineMcpTool({
  name: 'meetings_write_notes',
  title: 'Write Meeting Notes',
  description: 'Write Markdown into a meeting\'s shared meeting notes, the one document everyone on the meeting edits together. mode "append" (the default) adds it after what is there; "replace" overwrites the whole document. Anyone with the notes open sees the change live. Headings, bold, italic, lists, links, quotes and code are kept. Returns the notes as they now read. Requires being able to edit the meeting.',
  appId: 'meetings',
  scope: 'meetings.read',
  input: z.object({
    org: orgInput,
    meeting_id: meetingIdInput,
    markdown: z.string().min(1).max(MAX_NOTES_CHARS),
    mode: z.enum(['append', 'replace']).optional().describe('"append" (default) or "replace".')
  }).strict(),
  handler: async (input, ctx) => {
    const mode = input.mode ?? 'append'
    const target = await run(ctx, input.org, 'meetings.read', async (tx, tenant) => {
      await requireMeeting(tx, tenant, input.meeting_id, 'edit')
      return { orgId: tenant.orgId ?? null, meetingId: input.meeting_id }
    })
    const notes = await writeMeetingsDocument(target, ctx.auth.userId, input.markdown, mode)
    await mcpLog('UPDATE', 'meetings_documents', input.meeting_id, ctx, { mode, chars: input.markdown.length })
    return text(`${mode === 'append' ? 'Appended to' : 'Replaced'} the meeting notes.`, { meeting_id: input.meeting_id, mode, notes_md: notes })
  }
})

const shareInput = z.boolean().optional().describe('Set true to assign someone who can\'t see the task yet; doing so shares it with them. Without it the call is refused and names those people, so confirm with the user first.')

export const addTasksTool = defineMcpTool({
  name: 'meetings_add_tasks',
  title: 'Add Meeting Tasks',
  description: 'Create tasks that came out of a meeting, all in one call. Each task is a records `task` linked to the meeting, so it shows on the meeting and in everyone\'s task views; its assignee is told in the app and by email. Name each task as one short imperative sentence. Assignees are user ids from meetings_get participants or meetings_list_people. Requires being able to edit the meeting and to create tasks.',
  appId: 'meetings',
  scope: 'meetings.read',
  input: z.object({
    org: orgInput,
    meeting_id: meetingIdInput,
    tasks: z.array(z.object({
      name: z.string().trim().min(1).max(1000),
      assignee_user_id: userIdInput.optional(),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD')
    }).strict()).min(1).max(50),
    share: shareInput
  }).strict(),
  handler: async (input, ctx) => {
    return await run(ctx, input.org, 'meetings.read', async (tx, tenant) => {
      await requireMeeting(tx, tenant, input.meeting_id, 'edit')
      await requireTypePermission(tx, tenant, 'task', 'create')

      const created: { id: string, name: string, assignee: string | null, due_date: string | null }[] = []
      for (const task of input.tasks) {
        const fields: Record<string, unknown> = { name: task.name, [MEETINGS_TASK_FIELD]: input.meeting_id }
        if (task.assignee_user_id) fields.assignee = task.assignee_user_id
        if (task.due_date) fields.due_date = task.due_date
        const record = await applyFieldPatch(tx, tenant, 'task', null, fields, {
          sharing: input.share ? 'confirmed' : 'ask'
        })
        created.push({ id: record.id, name: record.name, assignee: task.assignee_user_id ?? null, due_date: task.due_date ?? null })
      }
      await touchMeeting(tx, input.meeting_id)
      await mcpLog('CREATE', 'records_entries', input.meeting_id, ctx, { tasks: created.map(t => t.id) }, tx)
      return text(`Created ${created.length} task(s).`, { meeting_id: input.meeting_id, tasks: created })
    })
  }
})

export const meetingsMcpTools = [
  listMeetingsTool,
  getMeetingTool,
  listPeopleTool,
  createMeetingTool,
  updateMeetingTool,
  addParticipantsTool,
  writeNotesTool,
  addTasksTool
]
