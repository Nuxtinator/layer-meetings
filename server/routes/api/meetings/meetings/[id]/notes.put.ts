// PUT /api/meetings/meetings/:id/notes  { body_md, shared }
// Saves the caller's own notes on a meeting. Anyone who can see the meeting
// keeps their own notes; `shared` lets everyone else who can see it read them.
import { z } from 'zod'
import { sql } from 'kysely'
import { withOrgPermission } from '#tenant/server'
import { parseMeetingsBody, requireMeeting, requireMeetingsId } from '../../../../../utils/meetings-helpers'

const Body = z.object({
  body_md: z.string().max(512 * 1024),
  shared: z.boolean()
})

export default defineEventHandler(async (event) => {
  const id = requireMeetingsId(event)
  const body = parseMeetingsBody(Body, await readBody(event))
  return await withOrgPermission(event, { appId: 'meetings' }, 'meetings.read', async (tx, ctx) => {
    await requireMeeting(tx, ctx, id)

    const note = await tx
      .insertInto('meetings_notes')
      .values({ meeting_id: id, user_id: ctx.userId, body_md: body.body_md, shared: body.shared })
      .onConflict(oc => oc.columns(['meeting_id', 'user_id']).doUpdateSet({
        body_md: body.body_md,
        shared: body.shared,
        updated_at: sql`now()`
      }))
      .returning(['body_md', 'shared', 'updated_at'])
      .executeTakeFirstOrThrow()

    return { note }
  })
})
