// Case-insensitive substring search over a meeting's shared notes,
// transcript and the caller's own notes.
import type { Expression, RawBuilder, SqlBool } from 'kysely'
import { sql } from 'kysely'
import type { MeetingsTx } from './meetings-helpers'

export type MeetingsMatchField = 'notes' | 'transcript' | 'my_notes'

export interface MeetingsMatch {
  field: MeetingsMatchField
  snippet: string
}

const SNIPPET_LEAD = 60
const SNIPPET_LENGTH = 180

// strpos rather than ILIKE, so `%` and `_` in the query are plain text.
export function meetingsContains(column: Expression<unknown> | RawBuilder<unknown>, q: string): RawBuilder<SqlBool> {
  return sql<SqlBool>`strpos(lower(${column}), lower(${q})) > 0`
}

// For each meeting, the first of shared notes, transcript and the caller's
// own notes that contains `q`, with the text around the match.
export async function findMeetingsMatches(tx: MeetingsTx, meetingIds: string[], userId: string, q: string): Promise<Map<string, MeetingsMatch>> {
  const map = new Map<string, MeetingsMatch>()
  if (meetingIds.length === 0) return map

  const { rows } = await sql<{ meeting_id: string, field: MeetingsMatchField, snippet: string, cut_start: boolean, cut_end: boolean }>`
    select m.id as meeting_id, h.field,
      substr(h.body, h.start, ${SNIPPET_LENGTH}) as snippet,
      h.start > 1 as cut_start,
      h.start + ${SNIPPET_LENGTH} <= length(h.body) as cut_end
    from meetings m
    left join meetings_documents d on d.meeting_id = m.id
    left join meetings_notes n on n.meeting_id = m.id and n.user_id = ${userId}
    cross join lateral (
      select f.field, f.body, greatest(1, strpos(lower(f.body), lower(${q})) - ${SNIPPET_LEAD}) as start
      from (values ('notes', d.body_md, 1), ('transcript', m.transcript, 2), ('my_notes', n.body_md, 3)) as f(field, body, rank)
      where strpos(lower(f.body), lower(${q})) > 0
      order by f.rank
      limit 1
    ) h
    where m.id in (${sql.join(meetingIds)})
  `.execute(tx)

  for (const r of rows) {
    const text = r.snippet.replace(/[*`#>]/g, '').replace(/\s+/g, ' ').trim()
    map.set(r.meeting_id, {
      field: r.field,
      snippet: `${r.cut_start ? '…' : ''}${text}${r.cut_end ? '…' : ''}`
    })
  }
  return map
}
