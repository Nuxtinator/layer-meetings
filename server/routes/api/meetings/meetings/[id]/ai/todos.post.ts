// POST /api/meetings/meetings/:id/ai/todos
// Proposed todos from the transcript, for the caller to review. Nothing is
// saved. The model runs after the transaction commits.
import { withOrgPermission } from '#tenant/server'
import { isAiConfigured, resolveAiRun } from '#ai/server'
import { requireMeetingsId } from '../../../../../../utils/meetings-helpers'
import { MEETINGS_AI_TODOS_FEATURE, loadMeetingsAiContext, suggestMeetingTodos } from '../../../../../../utils/meetings-ai'

export default defineEventHandler(async (event) => {
  const id = requireMeetingsId(event)
  const { run, context } = await withOrgPermission(event, { appId: 'meetings' }, 'meetings.read', async (tx, ctx) => {
    if (!(await isAiConfigured(tx))) throw createError({ statusCode: 503, statusMessage: 'AI is not configured' })
    const context = await loadMeetingsAiContext(tx, ctx, id, 'edit')
    return { run: await resolveAiRun(tx, MEETINGS_AI_TODOS_FEATURE), context }
  })
  return { todos: await suggestMeetingTodos(run, context) }
})
