// POST /api/meetings/meetings  { title, starts_at, location?, visibility }
// The creator is added as the first participant.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { logCreate } from '#core/server/utils/activity-logger'
import { parseMeetingsBody } from '../../../../utils/meetings-helpers'

const Body = z.object({
  title: z.string().trim().min(1).max(300),
  starts_at: z.coerce.date(),
  location: z.string().trim().max(500).nullable().optional(),
  visibility: z.enum(['org', 'private'])
})

export default defineEventHandler(async (event) => {
  const body = parseMeetingsBody(Body, await readBody(event))
  return await withOrgPermission(event, { appId: 'meetings' }, 'meetings.create', async (tx, ctx) => {
    const meeting = await tx
      .insertInto('meetings')
      .values({
        title: body.title,
        starts_at: body.starts_at,
        location: body.location || null,
        visibility: body.visibility,
        created_by: ctx.userId
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    await tx.insertInto('meetings_participants').values({ meeting_id: meeting.id, user_id: ctx.userId }).execute()

    logCreate('meetings', meeting.id, ctx.userId)
    return { meeting }
  })
})
