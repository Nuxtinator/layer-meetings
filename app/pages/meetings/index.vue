<script setup lang="ts">
import type { MeetingSearchField, MeetingSummary } from '../../utils/meetings-types'
import { formatMeetingDate } from '../../utils/meetings-format'
import { useMeetingsApi } from '../../composables/useMeetingsApi'

definePageMeta({
  middleware: 'auth'
})

const api = useMeetingsApi()
const { hasPermission } = usePermissions()
const canCreate = computed(() => hasPermission('meetings.create'))

const meetings = ref<MeetingSummary[]>([])
const loading = ref(true)
const search = ref('')

async function load() {
  const res = await api.call(() => $fetch<{ meetings: MeetingSummary[] }>('/api/meetings/meetings'))
  if (res) meetings.value = res.meetings
  loading.value = false
}

onMounted(load)

// Search runs on the server so it reaches notes and transcripts.
const results = ref<MeetingSummary[] | null>(null)
const searchedFor = ref('')
const searching = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | undefined
let searchSeq = 0

watch(search, (value) => {
  clearTimeout(searchTimer)
  const q = value.trim()
  searchSeq++
  if (!q) {
    results.value = null
    searching.value = false
    return
  }
  searching.value = true
  searchTimer = setTimeout(() => runSearch(q), 250)
})

onBeforeUnmount(() => clearTimeout(searchTimer))

async function runSearch(q: string) {
  const seq = ++searchSeq
  const res = await api.call(() => $fetch<{ meetings: MeetingSummary[] }>('/api/meetings/meetings', { query: { q } }))
  if (seq !== searchSeq) return
  searching.value = false
  if (!res) return
  results.value = res.meetings
  searchedFor.value = q
}

const filtered = computed(() => results.value ?? meetings.value)

const matchLabels: Record<MeetingSearchField, string> = {
  notes: 'Notes',
  transcript: 'Transcript',
  my_notes: 'My notes'
}

function meetingLink(m: MeetingSummary): string {
  return m.match?.field === 'transcript' ? `/meetings/${m.id}?tab=transcript` : `/meetings/${m.id}`
}

// The snippet split around each occurrence of the query, for highlighting.
function highlightParts(text: string, q: string): { text: string, hit: boolean }[] {
  const needle = q.toLowerCase()
  const lower = text.toLowerCase()
  const parts: { text: string, hit: boolean }[] = []
  let from = 0
  let at = needle ? lower.indexOf(needle) : -1
  while (at !== -1) {
    if (at > from) parts.push({ text: text.slice(from, at), hit: false })
    parts.push({ text: text.slice(at, at + needle.length), hit: true })
    from = at + needle.length
    at = lower.indexOf(needle, from)
  }
  if (from < text.length) parts.push({ text: text.slice(from), hit: false })
  return parts
}

const formOpen = ref(false)

async function onCreated(id: string) {
  await navigateTo(`/meetings/${id}`)
}
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-4">
    <div class="flex items-center gap-3 flex-wrap">
      <h1 class="text-2xl font-semibold flex-1">
        Meetings
      </h1>
      <UInput
        v-if="meetings.length"
        v-model="search"
        icon="i-lucide-search"
        :loading="searching"
        placeholder="Search"
        class="w-48"
      />
      <UButton
        to="/views/builtin.my-tasks"
        icon="i-lucide-square-check"
        variant="outline"
        color="neutral"
      >
        My tasks
      </UButton>
      <UButton
        v-if="canCreate"
        icon="i-lucide-plus"
        @click="formOpen = true"
      >
        New meeting
      </UButton>
    </div>

    <div
      v-if="loading"
      class="py-12 text-center text-(--ui-text-muted)"
    >
      Loading…
    </div>

    <UEmpty
      v-else-if="meetings.length === 0"
      icon="i-lucide-calendar-clock"
      title="No meetings yet"
      description="Add a meeting to keep its recording, transcript, notes, participants and tasks together."
      :actions="canCreate ? [{ label: 'Add the first meeting', icon: 'i-lucide-plus', onClick: () => { formOpen = true } }] : []"
    />

    <p
      v-else-if="filtered.length === 0"
      class="py-8 text-center text-sm text-(--ui-text-muted)"
    >
      No meetings match “{{ searchedFor }}”.
    </p>

    <div
      v-else
      class="rounded-lg border border-(--ui-border) bg-(--ui-bg-elevated) divide-y divide-(--ui-border)"
    >
      <NuxtLink
        v-for="m in filtered"
        :key="m.id"
        :to="meetingLink(m)"
        class="flex items-center gap-4 px-4 py-3 hover:bg-(--ui-bg-accented)/40 transition-colors"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-medium truncate">{{ m.title }}</span>
            <UIcon
              v-if="m.visibility === 'private'"
              name="i-lucide-lock"
              class="size-3.5 shrink-0 text-(--ui-text-dimmed)"
              title="Participants only"
            />
          </div>
          <div class="text-xs text-(--ui-text-muted) truncate">
            {{ formatMeetingDate(m.starts_at) }}<template v-if="m.location">
              · {{ m.location }}
            </template>
          </div>
          <div
            v-if="m.match"
            class="mt-1 text-xs text-(--ui-text-muted) line-clamp-2"
          >
            <span class="font-medium text-(--ui-text-toned) me-1">{{ matchLabels[m.match.field] }}:</span>
            <span
              v-for="(part, i) in highlightParts(m.match.snippet, searchedFor)"
              :key="i"
              :class="part.hit ? 'bg-(--ui-warning)/20 text-(--ui-text-highlighted) rounded-sm' : undefined"
              v-text="part.text"
            />
          </div>
        </div>
        <div class="hidden sm:flex items-center gap-3 text-xs text-(--ui-text-muted) tabular-nums whitespace-nowrap">
          <span
            v-if="m.has_transcript"
            class="inline-flex items-center gap-1"
            title="Has a transcript"
          >
            <UIcon
              name="i-lucide-file-text"
              class="size-3.5"
            />
          </span>
          <span
            v-if="m.attachments_count"
            class="inline-flex items-center gap-1"
            :title="`${m.attachments_count} file${m.attachments_count === 1 ? '' : 's'}`"
          >
            <UIcon
              name="i-lucide-paperclip"
              class="size-3.5"
            />{{ m.attachments_count }}
          </span>
          <span
            class="inline-flex items-center gap-1"
            :title="`${m.participants_count} participant${m.participants_count === 1 ? '' : 's'}`"
          >
            <UIcon
              name="i-lucide-users"
              class="size-3.5"
            />{{ m.participants_count }}
          </span>
        </div>
        <UBadge
          v-if="m.open_tasks"
          color="warning"
          variant="subtle"
          size="sm"
        >
          {{ m.open_tasks }} open task{{ m.open_tasks === 1 ? '' : 's' }}
        </UBadge>
        <UIcon
          name="i-lucide-chevron-right"
          class="size-4 text-(--ui-text-dimmed)"
        />
      </NuxtLink>
    </div>

    <MeetingsForm
      v-model:open="formOpen"
      :meeting="null"
      @saved="onCreated"
    />
  </div>
</template>
