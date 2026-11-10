export type MeetingVisibility = 'org' | 'private'

export interface MeetingsUser {
  id: string
  display_name: string
  avatar: string
}

export interface MeetingSummary {
  id: string
  title: string
  starts_at: string
  location: string | null
  visibility: MeetingVisibility
  created_by: MeetingsUser
  updated_at: string
  participants_count: number
  open_tasks: number
  attachments_count: number
  has_transcript: boolean
  // On search results: where the query matched beyond the title or location.
  match?: MeetingSearchMatch | null
}

export type MeetingSearchField = 'notes' | 'transcript' | 'my_notes'

export interface MeetingSearchMatch {
  field: MeetingSearchField
  snippet: string
}

export interface MeetingParticipant {
  id: string
  user: MeetingsUser | null
  name: string | null
  email: string | null
}

export interface MeetingAttachment {
  id: string
  filename: string
  mime_type: string
  size_bytes: number
  url: string
  created_by: MeetingsUser
  created_at: string
}

export interface MeetingNote {
  body_md: string
  updated_at: string
}

export interface MeetingDetail {
  id: string
  title: string
  starts_at: string
  location: string | null
  visibility: MeetingVisibility
  transcript: string | null
  created_by: MeetingsUser
  created_at: string
  updated_at: string
  can_edit: boolean
  can_delete: boolean
  participants: MeetingParticipant[]
  attachments: MeetingAttachment[]
  /** The meeting's tasks: all of them, and the ones still open. */
  tasks: { total: number, open: number }
  my_note: MeetingNote | null
}

export interface SuggestedMeetingTask {
  text: string
  assignee_user_id: string | null
  due_date: string | null
}
