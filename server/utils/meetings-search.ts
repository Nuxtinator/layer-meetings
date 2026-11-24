// Case-insensitive substring search over a meeting's shared notes,
// transcript and the caller's own notes.
import type { Expression, RawBuilder, SqlBool } from 'kysely'
import { sql } from 'kysely'
import type { MeetingsTx } from './meetings-helpers'

export type MeetingsMatchField = 'notes' | 'transcript' | 'my_notes'

export interface MeetingsMatch {
  field: MeetingsMatchField
  snippet: string
  // Occurrences of the query across all three fields, and in each.
  count: number
  counts: Record<MeetingsMatchField, number>
}

const SNIPPET_LEAD = 60
const SNIPPET_LENGTH = 180

// strpos rather than ILIKE, so `%` and `_` in the query are plain text.
export function meetingsContains(column: Expression<unknown> | RawBuilder<unknown>, q: string): RawBuilder<SqlBool> {
  return sql<SqlBool>`strpos(lower(${column}), lower(${q})) > 0`
}

// For each meeting, how often `q` occurs in its shared notes, transcript and
// the caller's own notes, with a snippet around the first occurrence in the
// field that has the most (ties go to notes, then transcript).
export async function findMeetingsMatches(tx: MeetingsTx, meetingIds: string[], userId: string, q: string): Promise<Map<string, MeetingsMatch>> {
  const map = new Map<string, MeetingsMatch>()
  if (meetingIds.length === 0) return map

  const { rows } = await sql<{ meeting_id: string, field: MeetingsMatchField, hits: number, snippet: string, cut_start: boolean, cut_end: boolean }>`
    select m.id as meeting_id, h.field, h.hits,
      substr(h.body, h.start, ${SNIPPET_LENGTH}) as snippet,
      h.start > 1 as cut_start,
      h.start + ${SNIPPET_LENGTH} <= length(h.body) as cut_end
    from meetings m
    left join meetings_documents d on d.meeting_id = m.id
    left join meetings_notes n on n.meeting_id = m.id and n.user_id = ${userId}
    cross join lateral (
      select f.field, f.body, f.rank,
        ((char_length(lower(f.body)) - char_length(replace(lower(f.body), lower(${q}), ''))) / char_length(lower(${q})))::int as hits,
        greatest(1, strpos(lower(f.body), lower(${q})) - ${SNIPPET_LEAD}) as start
      from (values ('notes', d.body_md, 1), ('transcript', m.transcript, 2), ('my_notes', n.body_md, 3)) as f(field, body, rank)
      where strpos(lower(f.body), lower(${q})) > 0
    ) h
    where m.id in (${sql.join(meetingIds)})
    order by m.id, h.hits desc, h.rank
  `.execute(tx)

  for (const r of rows) {
    const existing = map.get(r.meeting_id)
    if (existing) {
      existing.counts[r.field] = r.hits
      existing.count += r.hits
      continue
    }
    const text = r.snippet.replace(/[*`#>]/g, '').replace(/\s+/g, ' ').trim()
    map.set(r.meeting_id, {
      field: r.field,
      snippet: `${r.cut_start ? '…' : ''}${text}${r.cut_end ? '…' : ''}`,
      count: r.hits,
      counts: { notes: 0, transcript: 0, my_notes: 0, [r.field]: r.hits }
    })
  }
  return map
}
