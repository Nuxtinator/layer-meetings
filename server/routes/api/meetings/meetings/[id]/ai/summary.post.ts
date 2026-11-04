// POST /api/meetings/meetings/:id/ai/summary
// A Markdown summary of the transcript. Nothing is saved; the caller adds it
// to their own notes. The model runs after the transaction commits.
import { withOrgPermission } from '#tenant/server'
import { isAiConfigured, resolveAiRun } from '#ai/server'
import { requireMeetingsId } from '../../../../../../utils/meetings-helpers'
import { MEETINGS_AI_SUMMARY_FEATURE, loadMeetingsAiContext, summarizeMeetingTranscript } from '../../../../../../utils/meetings-ai'

export default defineEventHandler(async (event) => {
  const id = requireMeetingsId(event)
  const { run, context } = await withOrgPermission(event, { appId: 'meetings' }, 'meetings.read', async (tx, ctx) => {
    if (!(await isAiConfigured(tx))) throw createError({ statusCode: 503, statusMessage: 'AI is not configured' })
    const context = await loadMeetingsAiContext(tx, ctx, id)
    return { run: await resolveAiRun(tx, MEETINGS_AI_SUMMARY_FEATURE), context }
  })
  return { summary_md: await summarizeMeetingTranscript(run, context) }
})
