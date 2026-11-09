// Adds the meetings tables to the host schema by merging into core's global
// `NuxtinatorDatabaseTables` registry.
import type { ColumnType, Generated } from 'kysely'

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>

export type MeetingVisibility = 'org' | 'private'

export interface MeetingsTable {
  id: Generated<string>
  title: string
  starts_at: Timestamp
  location: string | null
  visibility: MeetingVisibility
  transcript: string | null
  created_by: string
  created_at: Timestamp
  updated_at: Timestamp
}

export interface MeetingsParticipantsTable {
  id: Generated<string>
  meeting_id: string
  user_id: string | null
  name: string | null
  email: string | null
  created_at: Timestamp
}

export interface MeetingsAttachmentsTable {
  id: string
  meeting_id: string
  storage_key: string
  filename: string
  mime_type: string
  size_bytes: ColumnType<string, number | string, number | string>
  created_by: string
  created_at: Timestamp
}

export interface MeetingsNotesTable {
  id: Generated<string>
  meeting_id: string
  user_id: string
  body_md: string
  created_at: Timestamp
  updated_at: Timestamp
}

export interface MeetingsDocumentsTable {
  meeting_id: string
  ydoc: Uint8Array
  body_md: string
  updated_by: string | null
  updated_at: Timestamp
}

declare global {
  interface NuxtinatorDatabaseTables {
    meetings_documents: MeetingsDocumentsTable
    meetings: MeetingsTable
    meetings_participants: MeetingsParticipantsTable
    meetings_attachments: MeetingsAttachmentsTable
    meetings_notes: MeetingsNotesTable
  }
}
