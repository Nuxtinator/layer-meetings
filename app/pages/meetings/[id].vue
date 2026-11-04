<script setup lang="ts">
// One meeting: details across the top, then notes / transcript / files in
// tabs beside the participants and todos.
import type { MeetingDetail, MeetingsUser } from '../../utils/meetings-types'
import { MEETINGS_VISIBILITY_OPTIONS, formatMeetingDate } from '../../utils/meetings-format'
import { useMeetingsAiAvailable, useMeetingsApi } from '../../composables/useMeetingsApi'

definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const router = useRouter()
const api = useMeetingsApi()

const meetingId = computed(() => route.params.id as string)
const meeting = ref<MeetingDetail | null>(null)
const users = ref<MeetingsUser[]>([])
const loading = ref(true)
const notFound = ref(false)

const summaryAi = useMeetingsAiAvailable('meetings.summary')
const todosAi = useMeetingsAiAvailable('meetings.todos')

async function loadMeeting() {
  try {
    const res = await $fetch<{ meeting: MeetingDetail }>(`/api/meetings/meetings/${meetingId.value}`)
    meeting.value = res.meeting
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode
    if (status === 404) notFound.value = true
    else api.call(() => Promise.reject(e))
  }
}

async function loadAll() {
  loading.value = true
  const [, u] = await Promise.all([
    loadMeeting(),
    api.call(() => $fetch<{ users: MeetingsUser[] }>('/api/meetings/users'))
  ])
  if (u) users.value = u.users
  loading.value = false
}

onMounted(loadAll)

const visibility = computed(() => MEETINGS_VISIBILITY_OPTIONS.find(o => o.value === meeting.value?.visibility))

// The selected tab lives in the query so a link can open a tab directly.
const tabs = computed(() => [
  { label: 'Notes', value: 'notes', icon: 'i-lucide-notebook-pen' },
  { label: 'Transcript', value: 'transcript', icon: 'i-lucide-file-text' },
  { label: 'Files', value: 'files', icon: 'i-lucide-paperclip', badge: meeting.value?.attachments.length || undefined }
])
const tab = computed({
  get: () => (['notes', 'transcript', 'files'].includes(route.query.tab as string) ? route.query.tab as string : 'notes'),
  set: (v: string) => { router.replace({ query: { ...route.query, tab: v === 'notes' ? undefined : v } }) }
})

const editOpen = ref(false)
const deleteOpen = ref(false)
const deleting = ref(false)

function openEdit() {
  editOpen.value = true
}

function openDelete() {
  deleteOpen.value = true
}

const menuItems = computed(() => {
  const m = meeting.value
  if (!m) return []
  const groups: { label: string, icon: string, color?: 'error', onSelect: () => void }[][] = []
  if (m.can_edit) groups.push([{ label: 'Edit details', icon: 'i-lucide-pencil', onSelect: openEdit }])
  if (m.can_delete) groups.push([{ label: 'Delete meeting', icon: 'i-lucide-trash-2', color: 'error', onSelect: openDelete }])
  return groups
})

async function confirmDelete() {
  deleting.value = true
  const res = await api.call(() => $fetch(`/api/meetings/meetings/${meetingId.value}`, { method: 'DELETE' }))
  deleting.value = false
  if (!res) return
  deleteOpen.value = false
  await navigateTo('/meetings')
}
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-4">
    <UButton
      to="/meetings"
      icon="i-lucide-arrow-left"
      variant="link"
      color="neutral"
      size="sm"
      class="px-0"
    >
      Meetings
    </UButton>

    <div
      v-if="loading"
      class="py-12 text-center text-(--ui-text-muted)"
    >
      Loading…
    </div>

    <UEmpty
      v-else-if="notFound || !meeting"
      icon="i-lucide-calendar-x"
      title="Meeting not found"
      description="It may have been deleted, or it is private to its participants."
    />

    <template v-else>
      <div class="flex items-start gap-3">
        <div class="flex-1 min-w-0 space-y-1">
          <h1 class="text-2xl font-semibold break-words">
            {{ meeting.title }}
          </h1>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-(--ui-text-muted)">
            <span class="inline-flex items-center gap-1.5">
              <UIcon
                name="i-lucide-calendar"
                class="size-4"
              />
              {{ formatMeetingDate(meeting.starts_at) }}
            </span>
            <span
              v-if="meeting.location"
              class="inline-flex items-center gap-1.5 min-w-0"
            >
              <UIcon
                name="i-lucide-map-pin"
                class="size-4 shrink-0"
              />
              <span class="truncate">{{ meeting.location }}</span>
            </span>
            <span
              v-if="visibility"
              class="inline-flex items-center gap-1.5"
            >
              <UIcon
                :name="visibility.icon"
                class="size-4"
              />
              {{ visibility.label }}
            </span>
          </div>
        </div>
        <UDropdownMenu
          v-if="menuItems.length"
          :items="menuItems"
        >
          <UButton
            icon="i-lucide-ellipsis"
            variant="ghost"
            color="neutral"
            aria-label="Meeting actions"
          />
        </UDropdownMenu>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-4 items-start">
        <UTabs
          v-model="tab"
          :items="tabs"
          :content="false"
          variant="link"
          class="w-full min-w-0"
        />

        <div class="min-w-0 lg:col-start-1 lg:row-start-2">
          <MeetingsNotes
            v-if="tab === 'notes'"
            :key="meeting.id"
            :meeting="meeting"
            :ai-available="summaryAi"
          />
          <MeetingsTranscript
            v-else-if="tab === 'transcript'"
            :meeting="meeting"
            @changed="loadMeeting"
          />
          <MeetingsFiles
            v-else
            :meeting="meeting"
            @changed="loadMeeting"
          />
        </div>

        <div class="space-y-4 lg:col-start-2 lg:row-start-2">
          <MeetingsTodos
            :meeting="meeting"
            :ai-available="todosAi"
            @changed="loadMeeting"
          />
          <MeetingsParticipants
            :meeting="meeting"
            :users="users"
            @changed="loadMeeting"
          />
        </div>
      </div>

      <MeetingsForm
        v-model:open="editOpen"
        :meeting="meeting"
        @saved="loadMeeting"
      />

      <ConfirmModal
        v-model:open="deleteOpen"
        title="Delete this meeting?"
        description="Its notes, todos, transcript and files are deleted for everyone."
        confirm-label="Delete meeting"
        :loading="deleting"
        @confirm="confirmDelete"
      />
    </template>
  </div>
</template>
