export const MEETINGS_PERMISSIONS = [
  'meetings.access',
  'meetings.read',
  'meetings.create',
  'meetings.admin'
] as const

export type MeetingsPermission = typeof MEETINGS_PERMISSIONS[number]

export const MEETINGS_PERMISSION_META: Record<string, { title: string, description: string }> = {
  'meetings.access': {
    title: 'Access Meetings',
    description: 'Required to open the Meetings app.'
  },
  'meetings.read': {
    title: 'Read meetings',
    description: 'View meetings shared with the whole org, and private meetings you take part in.'
  },
  'meetings.create': {
    title: 'Create meetings',
    description: 'Add new meetings. Creators and participants can edit a meeting.'
  },
  'meetings.admin': {
    title: 'Manage all meetings',
    description: 'See and edit every meeting, including private ones.'
  }
}

export const MEETINGS_DEFAULT_GRANTS: Record<'member' | 'admin', MeetingsPermission[]> = {
  member: ['meetings.access', 'meetings.read', 'meetings.create'],
  admin: [...MEETINGS_PERMISSIONS]
}

declare module '#permissions' {
  interface PermissionRegistry extends Record<MeetingsPermission, true> {}
}
