<script setup lang="ts">
// One meeting: details across the top, then notes / transcript / files in
// tabs beside the tasks, participants and my notes.
import type { MeetingDetail, MeetingsUser } from '../../utils/meetings-types'
import { MEETINGS_MAX_SUMMARY_CHARS, MEETINGS_VISIBILITY_OPTIONS, formatMeetingDay, fromLocalInput, toLocalInput } from '../../utils/meetings-format'
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
const summaryLineAi = useMeetingsAiAvailable('meetings.summary_line')
const tasksAi = useMeetingsAiAvailable('meetings.todos')

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

// Title, summary and date edit in place: click to edit, Enter or leaving the
// field saves, Escape cancels.
const editing = ref<'title' | 'summary' | 'date' | null>(null)
const draftTitle = ref('')
const draftSummary = ref('')
const draftDate = ref('')
const savingField = ref(false)

function startEditing(field: 'title' | 'summary' | 'date') {
  const m = meeting.value
  if (!m?.can_edit) return
  draftTitle.value = m.title
  draftSummary.value = m.summary ?? ''
  draftDate.value = toLocalInput(m.starts_at)
  editing.value = field
}

async function saveField() {
  const m = meeting.value
  const field = editing.value
  if (!m || !field || savingField.value) return
  const title = draftTitle.value.trim()
  const summary = draftSummary.value.replace(/\s+/g, ' ').trim()
  if (field === 'title' && (!title || title === m.title)) {
    editing.value = null
    return
  }
  if (field === 'summary' && summary === (m.summary ?? '')) {
    editing.value = null
    return
  }
  if (field === 'date' && (!draftDate.value || draftDate.value === toLocalInput(m.starts_at))) {
    editing.value = null
    return
  }
  const body: Partial<Pick<MeetingDetail, 'title' | 'summary' | 'starts_at'>> = field === 'title'
    ? { title }
    : field === 'summary'
      ? { summary: summary || null }
      : { starts_at: fromLocalInput(draftDate.value) }
  savingField.value = true
  const res = await api.call(() => $fetch(`/api/meetings/meetings/${m.id}`, { method: 'PATCH', body }))
  savingField.value = false
  if (!res) return
  Object.assign(m, body)
  editing.value = null
}

// The AI draft opens the summary for editing so it is reviewed before saving.
const draftingSummary = ref(false)

async function draftSummaryWithAi() {
  const m = meeting.value
  if (!m?.can_edit || draftingSummary.value) return
  draftingSummary.value = true
  const res = await api.call(() => $fetch<{ summary: string }>(`/api/meetings/meetings/${m.id}/ai/summary-line`, { method: 'POST' }))
  draftingSummary.value = false
  if (!res?.summary) return
  if (editing.value !== 'summary') startEditing('summary')
  draftSummary.value = res.summary
}

const editOpen = ref(false)
const deleteOpen = ref(false)
const deleting = ref(false)

function openEdit() {
  editOpen.value = true
}

function openDelete() {
  deleteOpen.value = true
}

const deleteDescription = computed(() => {
  const n = meeting.value?.tasks.total ?? 0
  const tasks = n === 0 ? '' : n === 1 ? ', its task' : `, its ${n} tasks`
  return `Its notes${tasks}, transcript and files are deleted for everyone.`
})

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
      v-if="loading || notFound || !meeting"
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
      <div class="flex items-center gap-3">
        <UButton
          to="/meetings"
          icon="i-lucide-arrow-left"
          variant="link"
          color="neutral"
          size="sm"
          class="px-0 shrink-0"
          aria-label="Back to meetings"
        >
          <span class="hidden sm:inline">Meetings</span>
        </UButton>
        <div class="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <UInput
            v-if="editing === 'title'"
            v-model="draftTitle"
            size="xl"
            autofocus
            :loading="savingField"
            class="w-full"
            :ui="{ base: 'text-2xl font-semibold' }"
            aria-label="Meeting title"
            @keydown.enter.prevent="saveField"
            @keydown.esc="editing = null"
            @blur="saveField"
          />
          <h1
            v-else
            class="text-2xl font-semibold break-words"
          >
            <button
              v-if="meeting.can_edit"
              type="button"
              class="text-left rounded-md -mx-1.5 px-1.5 cursor-text hover:bg-(--ui-bg-elevated)"
              title="Edit title"
              @click="startEditing('title')"
            >
              {{ meeting.title }}
            </button>
            <template v-else>
              {{ meeting.title }}
            </template>
          </h1>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-(--ui-text-muted)">
            <span class="inline-flex items-center gap-1.5">
              <UIcon
                name="i-lucide-calendar"
                class="size-4"
              />
              <UInput
                v-if="editing === 'date'"
                v-model="draftDate"
                type="datetime-local"
                size="sm"
                autofocus
                :loading="savingField"
                aria-label="Meeting date and time"
                @keydown.enter.prevent="saveField"
                @keydown.esc="editing = null"
                @blur="saveField"
              />
              <button
                v-else-if="meeting.can_edit"
                type="button"
                class="rounded -mx-1 px-1 cursor-text hover:bg-(--ui-bg-elevated) hover:text-(--ui-text)"
                title="Edit date and time"
                @click="startEditing('date')"
              >
                {{ formatMeetingDay(meeting.starts_at) }}
              </button>
              <template v-else>
                {{ formatMeetingDay(meeting.starts_at) }}
              </template>
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
              {{ visibility.short }}
            </span>
            <span
              v-if="meeting.tags.length"
              class="inline-flex flex-wrap items-center gap-1"
            >
              <UIcon
                name="i-lucide-tag"
                class="size-4"
              />
              <UBadge
                v-for="t in meeting.tags"
                :key="t"
                color="neutral"
                variant="soft"
                size="sm"
              >
                {{ t }}
              </UBadge>
            </span>
          </div>
          <UInput
            v-if="editing === 'summary'"
            v-model="draftSummary"
            autofocus
            :maxlength="MEETINGS_MAX_SUMMARY_CHARS"
            :loading="savingField"
            placeholder="One line on what this meeting covered"
            class="w-full"
            aria-label="Meeting summary"
            @keydown.enter.prevent="saveField"
            @keydown.esc="editing = null"
            @blur="saveField"
          >
            <template
              v-if="summaryLineAi"
              #trailing
            >
              <UTooltip text="Draft with AI">
                <UButton
                  icon="i-lucide-sparkles"
                  variant="link"
                  color="neutral"
                  size="sm"
                  aria-label="Draft with AI"
                  :loading="draftingSummary"
                  @mousedown.prevent
                  @click="draftSummaryWithAi"
                />
              </UTooltip>
            </template>
          </UInput>
          <div
            v-else-if="meeting.summary || meeting.can_edit"
            class="w-full flex items-center gap-1 min-w-0"
          >
            <button
              v-if="meeting.can_edit"
              type="button"
              class="text-left rounded -mx-1 px-1 cursor-text hover:bg-(--ui-bg-elevated)"
              :class="meeting.summary ? 'text-(--ui-text-toned)' : 'text-(--ui-text-dimmed)'"
              title="Edit summary"
              @click="startEditing('summary')"
            >
              {{ meeting.summary || 'Add a one-line summary' }}
            </button>
            <p
              v-else
              class="text-(--ui-text-toned)"
            >
              {{ meeting.summary }}
            </p>
            <UTooltip
              v-if="meeting.can_edit && summaryLineAi"
              text="Draft from the meeting notes and transcript"
            >
              <UButton
                icon="i-lucide-sparkles"
                :label="meeting.summary ? undefined : 'Write with AI'"
                variant="ghost"
                color="neutral"
                size="xs"
                aria-label="Draft the summary with AI"
                :loading="draftingSummary"
                @click="draftSummaryWithAi"
              />
            </UTooltip>
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

        <!-- Notes and transcript scroll inside themselves, so they stay in view while a taller sidebar scrolls. -->
        <div
          class="min-w-0 lg:col-start-1 lg:row-start-2"
          :class="tab === 'files' ? '' : 'lg:sticky lg:top-[calc(57px+1rem)]'"
        >
          <MeetingsTeamNotes
            v-if="tab === 'notes'"
            :meeting-id="meeting.id"
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
          <MeetingsTasks
            :meeting="meeting"
            :users="users"
            :ai-available="tasksAi"
            @changed="loadMeeting"
          />
          <MeetingsParticipants
            :meeting="meeting"
            :users="users"
            @changed="loadMeeting"
          />
          <MeetingsNotes
            :key="meeting.id"
            :meeting="meeting"
            :ai-available="summaryAi"
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
:description="deleteDescription"
        confirm-label="Delete meeting"
        :loading="deleting"
        @confirm="confirmDelete"
      />
    </template>
  </div>
</template>
