// POST /api/meetings/meetings/:id/ai/summary-line
// A one-sentence summary drafted from the shared notes and transcript, for
// the caller to review. Nothing is saved. The model runs after the
// transaction commits.
import { withOrgPermission } from '#tenant/server'
import { isAiConfigured, resolveAiRun } from '#ai/server'
import { requireMeetingsId } from '../../../../../../utils/meetings-helpers'
import { MEETINGS_AI_SUMMARY_LINE_FEATURE, loadMeetingsSummaryLineContext, writeMeetingSummaryLine } from '../../../../../../utils/meetings-ai'

export default defineEventHandler(async (event) => {
  const id = requireMeetingsId(event)
  const { run, context } = await withOrgPermission(event, { appId: 'meetings' }, 'meetings.read', async (tx, ctx) => {
    if (!(await isAiConfigured(tx))) throw createError({ statusCode: 503, statusMessage: 'AI is not configured' })
    const context = await loadMeetingsSummaryLineContext(tx, ctx, id)
    return { run: await resolveAiRun(tx, MEETINGS_AI_SUMMARY_LINE_FEATURE), context }
  })
  return { summary: await writeMeetingSummaryLine(run, context) }
})
