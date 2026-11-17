import type { MeetingVisibility } from './meetings-types'

// `short` is the label for tight spots like the meeting header.
export const MEETINGS_VISIBILITY_OPTIONS: { value: MeetingVisibility, label: string, short: string, icon: string }[] = [
  { value: 'org', label: 'Everyone in the org', short: 'Everyone', icon: 'i-lucide-users' },
  { value: 'private', label: 'Participants only', short: 'Participants only', icon: 'i-lucide-lock' }
]

export const MEETINGS_DEFAULT_VISIBILITY: MeetingVisibility = 'org'

// The year shows only for dates outside the current year.
export function formatMeetingDay(iso: string): string {
  const d = new Date(iso)
  const year = d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
  return d.toLocaleDateString([], { weekday: 'short', year, month: 'short', day: 'numeric' })
}

export function formatDueDate(date: string): string {
  return new Date(`${date}T12:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

export function isOverdue(date: string | null): boolean {
  if (!date) return false
  return new Date(`${date}T23:59:59`).getTime() < Date.now()
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

// `<input type="datetime-local">` works in local time without a zone.
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(value: string): string {
  return new Date(value).toISOString()
}

export function participantLabel(p: { user: { display_name: string } | null, name: string | null }): string {
  return p.user?.display_name ?? p.name ?? 'Guest'
}
