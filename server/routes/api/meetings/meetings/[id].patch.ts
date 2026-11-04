// PATCH /api/meetings/meetings/:id  { title?, starts_at?, location?, visibility?, transcript? }
import { z } from 'zod'
import { sql } from 'kysely'
import { withOrgPermission } from '#tenant/server'
import { logUpdate } from '#core/server/utils/activity-logger'
import { parseMeetingsBody, requireMeeting, requireMeetingsId } from '../../../../utils/meetings-helpers'

const MAX_TRANSCRIPT_CHARS = 2_000_000

const Body = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  starts_at: z.coerce.date().optional(),
  location: z.string().trim().max(500).nullable().optional(),
  visibility: z.enum(['org', 'private']).optional(),
  transcript: z.string().max(MAX_TRANSCRIPT_CHARS).nullable().optional()
})

export default defineEventHandler(async (event) => {
  const id = requireMeetingsId(event)
  const body = parseMeetingsBody(Body, await readBody(event))
  return await withOrgPermission(event, { appId: 'meetings' }, 'meetings.read', async (tx, ctx) => {
    await requireMeeting(tx, ctx, id, 'edit')

    const updates: Record<string, unknown> = {}
    if (body.title !== undefined) updates.title = body.title
    if (body.starts_at !== undefined) updates.starts_at = body.starts_at
    if (body.location !== undefined) updates.location = body.location || null
    if (body.visibility !== undefined) updates.visibility = body.visibility
    if (body.transcript !== undefined) updates.transcript = body.transcript?.trim() ? body.transcript : null
    if (Object.keys(updates).length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
    }
    updates.updated_at = sql`now()`

    await tx.updateTable('meetings').set(updates).where('id', '=', id).execute()
    logUpdate('meetings', id, ctx.userId, { fields: Object.keys(updates) })
    return { ok: true }
  })
})
