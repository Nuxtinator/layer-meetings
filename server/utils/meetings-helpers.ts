import type { H3Event } from 'h3'
import type { Expression, ExpressionBuilder, SqlBool, Transaction } from 'kysely'
import { sql } from 'kysely'
import { z } from 'zod'
import type { Database } from '#core/server/database/schema'
import type { TenantContext } from '#tenant/server'
import { generateSignedUrl } from '#core/server/utils/storage'
import { createNotification } from '#core/server/utils/notifications'
import type { MeetingsTable } from '../database/schema.d'

export type MeetingsTx = Transaction<Database>

export interface MeetingsUser {
  id: string
  display_name: string
  avatar: string
}

export const meetingsUuid = z.string().uuid()
export const meetingsDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

// Validates a request body against a zod schema, mapping failure to a 400.
export function parseMeetingsBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body ?? {})
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
  }
  return parsed.data
}

export function requireMeetingsId(event: H3Event): string {
  const id = getRouterParam(event, 'id')
  if (!id || !meetingsUuid.safeParse(id).success) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  return id
}

// One lookup for every user referenced by a payload.
export async function loadMeetingsUsers(tx: MeetingsTx, ids: Iterable<string | null | undefined>): Promise<Map<string, MeetingsUser>> {
  const unique = [...new Set([...ids].filter((v): v is string => !!v))]
  const map = new Map<string, MeetingsUser>()
  if (unique.length === 0) return map
  const rows = await tx
    .selectFrom('users')
    .select(['id', 'display_name', 'avatar'])
    .where('id', 'in', unique)
    .execute()
  for (const r of rows) map.set(r.id, { id: r.id, display_name: r.display_name, avatar: r.avatar })
  return map
}

export function meetingsUserOrNull(map: Map<string, MeetingsUser>, id: string | null | undefined): MeetingsUser | null {
  return id ? (map.get(id) ?? null) : null
}

export function meetingsUserOrUnknown(map: Map<string, MeetingsUser>, id: string): MeetingsUser {
  return map.get(id) ?? { id, display_name: 'Unknown user', avatar: '' }
}

export function isMeetingsAdmin(ctx: TenantContext): boolean {
  return ctx.perms.has('meetings.admin')
}

// The meetings a caller may see: every org-wide one, plus private ones they
// created or take part in. Meetings admins see all.
export function meetingsVisibleTo(ctx: TenantContext) {
  return (eb: ExpressionBuilder<Database & { m: Database['meetings'] }, 'm'>): Expression<SqlBool> => {
    if (isMeetingsAdmin(ctx)) return sql<boolean>`true`
    return eb.or([
      eb('m.visibility', '=', 'org'),
      eb('m.created_by', '=', ctx.userId),
      eb.exists(
        eb.selectFrom('meetings_participants as vp')
          .select('vp.id')
          .whereRef('vp.meeting_id', '=', 'm.id')
          .where('vp.user_id', '=', ctx.userId)
      )
    ])
  }
}

export interface MeetingAccess {
  meeting: Omit<MeetingsTable, 'id' | 'starts_at' | 'created_at' | 'updated_at'> & {
    id: string
    starts_at: Date
    created_at: Date
    updated_at: Date
  }
  canEdit: boolean
  canDelete: boolean
}

// Loads a meeting the caller may see, with what they may do to it. A private
// meeting the caller can't see is reported as missing. The creator, user
// participants and meetings admins may edit; the creator and admins may delete.
export async function requireMeeting(tx: MeetingsTx, ctx: TenantContext, id: string, need: 'view' | 'edit' = 'view'): Promise<MeetingAccess> {
  const meeting = await tx.selectFrom('meetings').selectAll().where('id', '=', id).executeTakeFirst()
  if (!meeting) throw createError({ statusCode: 404, statusMessage: 'Meeting not found' })

  const participant = await tx
    .selectFrom('meetings_participants')
    .select('id')
    .where('meeting_id', '=', id)
    .where('user_id', '=', ctx.userId)
    .executeTakeFirst()

  const admin = isMeetingsAdmin(ctx)
  const isCreator = meeting.created_by === ctx.userId
  const canEdit = isCreator || !!participant || admin
  const canView = meeting.visibility === 'org' || canEdit
  if (!canView) throw createError({ statusCode: 404, statusMessage: 'Meeting not found' })
  if (need === 'edit' && !canEdit) {
    throw createError({ statusCode: 403, statusMessage: 'Only the creator and participants can edit this meeting' })
  }
  return { meeting, canEdit, canDelete: isCreator || admin }
}

export async function touchMeeting(tx: MeetingsTx, meetingId: string): Promise<void> {
  await tx.updateTable('meetings').set({ updated_at: sql`now()` }).where('id', '=', meetingId).execute()
}

export async function isMeetingParticipant(tx: MeetingsTx, meetingId: string, userId: string): Promise<boolean> {
  const row = await tx
    .selectFrom('meetings_participants')
    .select('id')
    .where('meeting_id', '=', meetingId)
    .where('user_id', '=', userId)
    .executeTakeFirst()
  return !!row
}

export async function requireMeetingAssignee(tx: MeetingsTx, meetingId: string, userId: string | null | undefined): Promise<void> {
  if (!userId) return
  if (!(await isMeetingParticipant(tx, meetingId, userId))) {
    throw createError({ statusCode: 400, statusMessage: 'Todos can only be assigned to participants of the meeting' })
  }
}

export async function notifyMeetingTodoAssigned(tx: MeetingsTx, opts: { assigneeId: string, actorId: string, meetingId: string, meetingTitle: string, todoText: string }): Promise<void> {
  const actor = await tx.selectFrom('users').select('display_name').where('id', '=', opts.actorId).executeTakeFirst()
  await createNotification(tx, {
    userId: opts.assigneeId,
    appId: 'meetings',
    title: `${actor?.display_name || 'Someone'} assigned you a todo from ${opts.meetingTitle}`,
    body: opts.todoText,
    icon: 'i-lucide-list-checks',
    link: `/meetings/${opts.meetingId}`,
    actorId: opts.actorId,
    email: 'immediate'
  })
}

export async function signMeetingAttachment<T extends { storage_key: string, size_bytes: string | number }>(row: T) {
  const { storage_key, size_bytes, ...rest } = row
  return {
    ...rest,
    size_bytes: Number(size_bytes),
    url: await generateSignedUrl(storage_key)
  }
}

export const MEETINGS_TODO_COLUMNS = [
  't.id', 't.meeting_id', 't.text', 't.assignee_user_id', 't.done_at', 't.done_by',
  't.created_by', 't.created_at', 't.updated_at',
  sql<string | null>`to_char(t.due_date, 'YYYY-MM-DD')`.as('due_date')
] as const

export interface MeetingTodoRow {
  id: string
  meeting_id: string
  text: string
  assignee_user_id: string | null
  due_date: string | null
  done_at: Date | null
  done_by: string | null
  created_by: string
  created_at: Date
  updated_at: Date
}

export function meetingTodoPayload(t: MeetingTodoRow, users: Map<string, MeetingsUser>) {
  return {
    id: t.id,
    meeting_id: t.meeting_id,
    text: t.text,
    assignee: meetingsUserOrNull(users, t.assignee_user_id),
    due_date: t.due_date,
    done: !!t.done_at,
    done_at: t.done_at,
    created_at: t.created_at
  }
}

export async function requireMeetingTodo(tx: MeetingsTx, id: string): Promise<MeetingTodoRow> {
  const todo = await tx
    .selectFrom('meetings_todos as t')
    .select(MEETINGS_TODO_COLUMNS)
    .where('t.id', '=', id)
    .executeTakeFirst()
  if (!todo) throw createError({ statusCode: 404, statusMessage: 'Todo not found' })
  return todo
}
