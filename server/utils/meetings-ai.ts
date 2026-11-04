import { complete, generate } from '#ai/server'
import type { AiCompletionRun } from '#ai/server'
import type { TenantContext } from '#tenant/server'
import { loadMeetingsUsers, requireMeeting, type MeetingsTx } from './meetings-helpers'

export const MEETINGS_AI_SUMMARY_FEATURE = 'meetings.summary'
export const MEETINGS_AI_TODOS_FEATURE = 'meetings.todos'

export interface MeetingsAiContext {
  title: string
  startsAt: Date
  transcript: string
  participants: { userId: string | null, name: string }[]
}

export async function loadMeetingsAiContext(tx: MeetingsTx, ctx: TenantContext, id: string, need: 'view' | 'edit' = 'view'): Promise<MeetingsAiContext> {
  const { meeting } = await requireMeeting(tx, ctx, id, need)
  if (!meeting.transcript?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Add a transcript first' })
  }
  const rows = await tx
    .selectFrom('meetings_participants')
    .select(['user_id', 'name'])
    .where('meeting_id', '=', id)
    .orderBy('created_at', 'asc')
    .execute()
  const users = await loadMeetingsUsers(tx, rows.map(r => r.user_id))
  return {
    title: meeting.title,
    startsAt: meeting.starts_at,
    transcript: meeting.transcript,
    participants: rows.map(r => ({
      userId: r.user_id,
      name: r.user_id ? (users.get(r.user_id)?.display_name ?? 'Unknown user') : (r.name ?? 'Guest')
    }))
  }
}

function meetingHeader(m: MeetingsAiContext): string {
  const who = m.participants.map(p => p.name).join(', ') || 'unknown'
  return `Meeting: ${m.title}\nDate: ${m.startsAt.toISOString().slice(0, 10)}\nParticipants: ${who}`
}

export async function summarizeMeetingTranscript(run: AiCompletionRun, m: MeetingsAiContext): Promise<string> {
  const result = await complete({
    run,
    feature: MEETINGS_AI_SUMMARY_FEATURE,
    system: 'You summarize meeting transcripts for the people who attended. Write concise Markdown: a short overview paragraph, then "Key points" and "Decisions" as bullet lists. Omit a section that would be empty. Do not invent facts that are not in the transcript. Do not list action items.',
    messages: [{ role: 'user', content: `${meetingHeader(m)}\n\nTranscript:\n${m.transcript}` }],
    maxTokens: 2048
  })
  return result.text
}

export interface SuggestedTodo {
  text: string
  assignee_user_id: string | null
  due_date: string | null
}

// Proposes action items. Assignees come back as participant numbers and are
// mapped to user ids here; a guest or an unknown number leaves the todo
// unassigned rather than guessing.
export async function suggestMeetingTodos(run: AiCompletionRun, m: MeetingsAiContext): Promise<SuggestedTodo[]> {
  const roster = m.participants.map((p, i) => `${i + 1}. ${p.name}`).join('\n') || '(none)'
  const result = await generate<{ todos?: { text?: unknown, assignee?: unknown, due_date?: unknown }[] }>({
    run,
    feature: MEETINGS_AI_TODOS_FEATURE,
    system: 'You extract action items from meeting transcripts. Only include concrete tasks someone agreed or was asked to do. Each item is one short imperative sentence. Set assignee to the participant number only when the transcript clearly says who will do it; otherwise use 0. Set due_date (YYYY-MM-DD) only when an explicit date is stated or clearly implied relative to the meeting date; otherwise an empty string.',
    messages: [{ role: 'user', content: `${meetingHeader(m)}\n\nNumbered participants:\n${roster}\n\nTranscript:\n${m.transcript}` }],
    tool: {
      name: 'record_todos',
      description: 'Record the action items found in the transcript.',
      parameters: {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                assignee: { type: 'integer', description: 'Participant number, or 0 for nobody' },
                due_date: { type: 'string', description: 'YYYY-MM-DD or empty' }
              },
              required: ['text', 'assignee', 'due_date']
            }
          }
        },
        required: ['todos']
      }
    },
    maxTokens: 4096
  })

  const todos = Array.isArray(result.input.todos) ? result.input.todos : []
  return todos
    .map((t) => {
      const text = typeof t.text === 'string' ? t.text.trim().slice(0, 1000) : ''
      const n = typeof t.assignee === 'number' ? t.assignee : Number.NaN
      const assignee = Number.isInteger(n) && n >= 1 ? m.participants[n - 1] : undefined
      const due = typeof t.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date) ? t.due_date : null
      return { text, assignee_user_id: assignee?.userId ?? null, due_date: due }
    })
    .filter(t => t.text)
}
