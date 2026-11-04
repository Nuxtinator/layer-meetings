// POST /api/meetings/meetings/:id/participants  { user_id } | { name, email? }
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { logCreate } from '#core/server/utils/activity-logger'
import { isMeetingParticipant, meetingsUuid, parseMeetingsBody, requireMeeting, requireMeetingsId, touchMeeting } from '../../../../../utils/meetings-helpers'

const Body = z.union([
  z.object({ user_id: meetingsUuid }),
  z.object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(320).nullable().optional()
  })
])

export default defineEventHandler(async (event) => {
  const id = requireMeetingsId(event)
  const body = parseMeetingsBody(Body, await readBody(event))
  return await withOrgPermission(event, { appId: 'meetings' }, 'meetings.read', async (tx, ctx) => {
    await requireMeeting(tx, ctx, id, 'edit')

    if ('user_id' in body) {
      if (ctx.orgId) {
        const member = await tx
          .selectFrom('memberships')
          .select('user_id')
          .where('org_id', '=', ctx.orgId)
          .where('user_id', '=', body.user_id)
          .executeTakeFirst()
        if (!member) throw createError({ statusCode: 400, statusMessage: 'That user is not a member of this organization' })
      }
      if (await isMeetingParticipant(tx, id, body.user_id)) {
        throw createError({ statusCode: 409, statusMessage: 'Already a participant' })
      }
    }

    const row = await tx
      .insertInto('meetings_participants')
      .values('user_id' in body
        ? { meeting_id: id, user_id: body.user_id }
        : { meeting_id: id, name: body.name, email: body.email || null })
      .returning('id')
      .executeTakeFirstOrThrow()

    await touchMeeting(tx, id)
    logCreate('meetings_participants', row.id, ctx.userId)
    return { participant: row }
  })
})
