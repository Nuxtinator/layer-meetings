// POST /api/meetings/meetings/:id/document/ticket
// A short-lived ticket for opening the meeting's shared notes over the
// document socket, carrying whether the caller may edit them.
import { withOrgPermission } from '#tenant/server'
import { requireMeeting, requireMeetingsId } from '../../../../../../utils/meetings-helpers'
import { signMeetingsDocTicket } from '../../../../../../utils/meetings-documents'

export default defineEventHandler(async (event) => {
  const id = requireMeetingsId(event)
  return await withOrgPermission(event, { appId: 'meetings' }, 'meetings.read', async (tx, ctx) => {
    const { canEdit } = await requireMeeting(tx, ctx, id)
    const user = await tx.selectFrom('users').select(['id', 'display_name', 'avatar']).where('id', '=', ctx.userId).executeTakeFirstOrThrow()
    return {
      ticket: signMeetingsDocTicket({ userId: ctx.userId, orgId: ctx.orgId ?? null, meetingId: id, canEdit }),
      can_edit: canEdit,
      user
    }
  })
})
