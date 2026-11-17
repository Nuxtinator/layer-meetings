// GET /api/meetings/tags
// Every tag on a meeting the caller may see, alphabetical, for suggesting
// existing tags when tagging a meeting.
import { sql } from 'kysely'
import { withOrgPermission } from '#tenant/server'
import { meetingsVisibleTo } from '../../../utils/meetings-helpers'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'meetings' }, 'meetings.read', async (tx, ctx) => {
    const rows = await tx
      .selectFrom('meetings as m')
      .select(sql<string>`unnest(m.tags)`.as('tag'))
      .where(meetingsVisibleTo(ctx))
      .execute()
    const byKey = new Map<string, string>()
    for (const { tag } of rows) {
      const key = tag.toLowerCase()
      if (!byKey.has(key)) byKey.set(key, tag)
    }
    return { tags: [...byKey.values()].sort((a, b) => a.localeCompare(b)) }
  })
})
