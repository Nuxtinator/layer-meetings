import { registerPermissions } from '#core/server/utils/permissions-registry'
import { registerDefaultGrants } from '#core/server/utils/default-grants-registry'
import { registerApp } from '#core/server/utils/app-registry'
import { registerNavItem } from '#core/server/utils/nav-registry'
import { registerAiFeature } from '#ai/server'
import { registerRecordFieldExtension, registerRecordsRefSource, registerRecordsVisibilitySource } from '#records/server'
import { builtInViewId, registerBuiltInView } from '#views/server'
import {
  MEETINGS_PERMISSIONS,
  MEETINGS_PERMISSION_META,
  MEETINGS_DEFAULT_GRANTS
} from '../../app/utils/permissions'
import { MEETINGS_AI_SUMMARY_FEATURE, MEETINGS_AI_TODOS_FEATURE } from '../utils/meetings-ai'
import { MEETINGS_TASK_FIELD, meetingTasksView, meetingsRefSource, meetingsTaskVisibility } from '../utils/meetings-tasks'

export default defineNitroPlugin(() => {
  registerPermissions(MEETINGS_PERMISSIONS, MEETINGS_PERMISSION_META)
  registerDefaultGrants('meetings', MEETINGS_DEFAULT_GRANTS)

  // No-ops when the AI layer isn't loaded (core ships a fallback).
  registerAiFeature({
    key: MEETINGS_AI_SUMMARY_FEATURE,
    label: 'Meetings — summarize transcript',
    description: 'Writes a summary of a meeting transcript into your notes.'
  })
  registerAiFeature({
    key: MEETINGS_AI_TODOS_FEATURE,
    label: 'Meetings — suggest tasks',
    description: 'Proposes tasks from a meeting transcript for review.'
  })

  // Paths are single-tenant-shape; the tenancy layer adds the /@:orgSlug alias.
  registerApp({
    id: 'meetings',
    title: 'Meetings',
    path: '/meetings',
    icon: 'i-lucide-calendar-clock',
    requiredPermission: 'meetings.access',
    order: 40,
    defaultStatus: 'available',
    requires: ['records', 'views']
  })

  // A meeting's tasks are task records pointing at it.
  registerRecordsRefSource(meetingsRefSource)
  registerRecordFieldExtension('task', 'meetings', {
    [MEETINGS_TASK_FIELD]: { kind: 'ref', source: 'meetings', label: 'Meeting', icon: 'i-lucide-calendar-clock', section: 'details', order: 12 }
  })
  registerRecordsVisibilitySource(meetingsTaskVisibility)
  registerBuiltInView(meetingTasksView)

  registerNavItem({
    appId: 'meetings',
    title: 'Meetings',
    path: '/meetings',
    icon: 'i-lucide-list',
    requiredPermission: 'meetings.read',
    order: 10
  })

  registerNavItem({
    appId: 'meetings',
    title: 'My tasks',
    path: `/views/${builtInViewId('my-tasks')}`,
    icon: 'i-lucide-square-check',
    requiredPermission: 'meetings.read',
    order: 20
  })
})
