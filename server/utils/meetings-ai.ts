import { complete, generate } from '#ai/server'
import type { AiCompletionRun } from '#ai/server'
import type { TenantContext } from '#tenant/server'
import { MEETINGS_MAX_SUMMARY_CHARS } from '../../app/utils/meetings-format'
import { loadMeetingsUsers, requireMeeting, type MeetingsTx } from './meetings-helpers'
import { readMeetingsDocument } from './meetings-documents'
import { cleanMeetingsSummary } from './meetings-summary'

export const MEETINGS_AI_SUMMARY_FEATURE = 'meetings.summary'
export const MEETINGS_AI_SUMMARY_LINE_FEATURE = 'meetings.summary_line'
export const MEETINGS_AI_TODOS_FEATURE = 'meetings.todos'

interface MeetingsAiParticipant {
  userId: string | null
  name: string
}

export interface MeetingsAiContext {
  title: string
  startsAt: Date
  transcript: string
  participants: MeetingsAiParticipant[]
}

export interface MeetingsSummaryLineContext {
  title: string
  startsAt: Date
  participants: MeetingsAiParticipant[]
  notes: string
  transcript: string | null
}

async function loadMeetingsAiParticipants(tx: MeetingsTx, id: string): Promise<MeetingsAiParticipant[]> {
  const rows = await tx
    .selectFrom('meetings_participants')
    .select(['user_id', 'name'])
    .where('meeting_id', '=', id)
    .orderBy('created_at', 'asc')
    .execute()
  const users = await loadMeetingsUsers(tx, rows.map(r => r.user_id))
  return rows.map(r => ({
    userId: r.user_id,
    name: r.user_id ? (users.get(r.user_id)?.display_name ?? 'Unknown user') : (r.name ?? 'Guest')
  }))
}

export async function loadMeetingsAiContext(tx: MeetingsTx, ctx: TenantContext, id: string, need: 'view' | 'edit' = 'view'): Promise<MeetingsAiContext> {
  const { meeting } = await requireMeeting(tx, ctx, id, need)
  if (!meeting.transcript?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Add a transcript first' })
  }
  return {
    title: meeting.title,
    startsAt: meeting.starts_at,
    transcript: meeting.transcript,
    participants: await loadMeetingsAiParticipants(tx, id)
  }
}

export async function loadMeetingsSummaryLineContext(tx: MeetingsTx, ctx: TenantContext, id: string): Promise<MeetingsSummaryLineContext> {
  const { meeting } = await requireMeeting(tx, ctx, id, 'edit')
  const notes = await readMeetingsDocument(tx, { orgId: ctx.orgId ?? null, meetingId: id })
  if (!notes.trim() && !meeting.transcript?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Add meeting notes or a transcript first' })
  }
  return {
    title: meeting.title,
    startsAt: meeting.starts_at,
    participants: await loadMeetingsAiParticipants(tx, id),
    notes,
    transcript: meeting.transcript
  }
}

function meetingHeader(m: Pick<MeetingsAiContext, 'title' | 'startsAt' | 'participants'>): string {
  const who = m.participants.map(p => p.name).join(', ') || 'unknown'
  return `Meeting: ${m.title}\nDate: ${m.startsAt.toISOString().slice(0, 10)}\nParticipants: ${who}`
}

// A one-sentence draft for the summary shown under the title in the meetings
// list. Nothing is saved; the caller reviews it first.
export async function writeMeetingSummaryLine(run: AiCompletionRun, m: MeetingsSummaryLineContext): Promise<string> {
  const sources = [
    m.notes.trim() ? `Meeting notes:\n${m.notes}` : '',
    m.transcript?.trim() ? `Transcript:\n${m.transcript}` : ''
  ].filter(Boolean).join('\n\n')
  const result = await complete({
    run,
    feature: MEETINGS_AI_SUMMARY_LINE_FEATURE,
    system: 'You write the one-line summary shown under a meeting\'s title in a list of meetings, so people can tell meetings apart at a glance. Write one plain-text sentence of at most 25 words saying what the meeting covered and what came of it. Name the specific topics, decisions or outcomes, never generic phrases like "discussed various topics". Do not repeat the title or the date, do not start with "This meeting" or "The team", and use no Markdown or quotation marks. Do not invent facts that are not in the notes or transcript.',
    messages: [{ role: 'user', content: `${meetingHeader(m)}\n\n${sources}` }],
    maxTokens: 1024
  })
  const line = cleanMeetingsSummary(result.text)?.replace(/^["'“”]+|["'“”]+$/g, '').trim() ?? ''
  return line.slice(0, MEETINGS_MAX_SUMMARY_CHARS)
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
