import { z } from 'zod'
import { MEETINGS_MAX_SUMMARY_CHARS } from '../../app/utils/meetings-format'

// Kept to one line: whitespace and line breaks collapse to single spaces, and
// a blank summary is stored as null.
export function cleanMeetingsSummary(value: string | null | undefined): string | null {
  const s = (value ?? '').replace(/\s+/g, ' ').trim()
  return s || null
}

export const meetingsSummaryInput = z
  .string()
  .nullable()
  .transform(cleanMeetingsSummary)
  .pipe(z.string().max(MEETINGS_MAX_SUMMARY_CHARS).nullable())
