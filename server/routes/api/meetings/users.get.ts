// GET /api/meetings/users
// Users who can be added as participants: the active org's members in
// multi-tenant mode, every user in single-tenant mode.
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'meetings' }, 'meetings.read', async (tx, ctx) => {
    const query = ctx.orgId
      ? tx
          .selectFrom('memberships')
          .innerJoin('users', 'users.id', 'memberships.user_id')
          .select(['users.id', 'users.display_name', 'users.avatar'])
          .where('memberships.org_id', '=', ctx.orgId)
      : tx.selectFrom('users').select(['users.id', 'users.display_name', 'users.avatar'])

    const rows = await query.orderBy('users.display_name', 'asc').execute()
    return { users: rows }
  })
})
