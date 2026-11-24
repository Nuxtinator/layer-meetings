// GET /api/meetings/meetings/:id/task-parents
// For each of the meeting's tasks that sits under another kind of record (a
// deliverable): that record's id, type and name, keyed by task id. Records
// the caller can't open are left out.
import { withOrgPermission } from '#tenant/server'
import { requireMeeting, requireMeetingsId } from '../../../../../utils/meetings-helpers'
import { meetingTaskParents } from '../../../../../utils/meetings-tasks'

export default defineEventHandler(async (event) => {
  const id = requireMeetingsId(event)
  return await withOrgPermission(event, { appId: 'meetings' }, 'meetings.read', async (tx, ctx) => {
    await requireMeeting(tx, ctx, id)
    return { parents: Object.fromEntries(await meetingTaskParents(tx, ctx, id)) }
  })
})
