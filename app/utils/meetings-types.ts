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
  open_todos: number
  attachments_count: number
  has_transcript: boolean
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

export interface MeetingTodo {
  id: string
  meeting_id: string
  text: string
  assignee: MeetingsUser | null
  due_date: string | null
  done: boolean
  done_at: string | null
  created_at: string
}

export interface MyMeetingTodo extends MeetingTodo {
  meeting: { id: string, title: string, starts_at: string }
}

export interface MeetingNote {
  body_md: string
  shared: boolean
  updated_at: string
}

export interface MeetingSharedNote {
  id: string
  author: MeetingsUser
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
  todos: MeetingTodo[]
  my_note: MeetingNote | null
  shared_notes: MeetingSharedNote[]
}

export interface SuggestedMeetingTodo {
  text: string
  assignee_user_id: string | null
  due_date: string | null
}
