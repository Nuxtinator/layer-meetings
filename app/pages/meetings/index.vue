<script setup lang="ts">
import type { MeetingSearchField, MeetingSearchMatch, MeetingSummary } from '../../utils/meetings-types'
import { formatMeetingDay } from '../../utils/meetings-format'
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

const sort = ref<'mentions' | 'newest'>('mentions')
const sortItems = [
  { label: 'Most mentions', value: 'mentions' },
  { label: 'Newest', value: 'newest' }
]

// Chosen tags show only meetings with any of them; an excluded tag (stored
// lowercased) hides the meetings that have it instead.
const tagFilter = ref<string[]>([])
const excludedTags = ref<string[]>([])

const tagKey = (tag: string) => tag.toLowerCase()

const allTags = computed(() => {
  const byKey = new Map<string, string>()
  for (const m of meetings.value) {
    for (const t of m.tags) {
      if (!byKey.has(tagKey(t))) byKey.set(tagKey(t), t)
    }
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b))
})

watch(tagFilter, (tags) => {
  const keys = new Set(tags.map(tagKey))
  excludedTags.value = excludedTags.value.filter(k => keys.has(k))
})

function isTagIncluded(tag: string): boolean {
  return tagFilter.value.some(t => tagKey(t) === tagKey(tag)) && !isTagExcluded(tag)
}

function isTagExcluded(tag: string): boolean {
  return excludedTags.value.includes(tagKey(tag))
}

function addTagFilter(tag: string) {
  if (tagFilter.value.some(t => tagKey(t) === tagKey(tag))) return
  tagFilter.value = [...tagFilter.value, allTags.value.find(t => tagKey(t) === tagKey(tag)) ?? tag]
}

function removeTagFilter(tag: string) {
  tagFilter.value = tagFilter.value.filter(t => tagKey(t) !== tagKey(tag))
}

function toggleTagExcluded(tag: string) {
  const key = tagKey(tag)
  excludedTags.value = isTagExcluded(tag) ? excludedTags.value.filter(k => k !== key) : [...excludedTags.value, key]
}

// Sorting is stable, so meetings with as many mentions keep the server's newest-first order.
const filtered = computed(() => {
  const include = tagFilter.value.map(tagKey).filter(k => !excludedTags.value.includes(k))
  const exclude = excludedTags.value
  const list = (results.value ?? meetings.value).filter((m) => {
    const keys = m.tags.map(tagKey)
    if (exclude.some(k => keys.includes(k))) return false
    return include.length === 0 || include.some(k => keys.includes(k))
  })
  if (results.value && sort.value === 'mentions') {
    list.sort((a, b) => (b.match?.count ?? 0) - (a.match?.count ?? 0))
  }
  return list
})

const matchLabels: Record<MeetingSearchField, string> = {
  notes: 'Notes',
  transcript: 'Transcript',
  my_notes: 'My notes'
}

function mentionsBreakdown(match: MeetingSearchMatch): string {
  return (Object.keys(matchLabels) as MeetingSearchField[])
    .filter(f => match.counts[f])
    .map(f => `${matchLabels[f]} ${match.counts[f]}`)
    .join(' · ')
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
      <USelectMenu
        v-if="allTags.length"
        v-model="tagFilter"
        :items="allTags"
        multiple
        icon="i-lucide-tag"
        class="w-40"
      >
        <template #default="{ ui }">
          <span :class="tagFilter.length ? ui.value() : ui.placeholder()">
            {{ tagFilter.length ? `${tagFilter.length} tag${tagFilter.length === 1 ? '' : 's'}` : 'Tags' }}
          </span>
        </template>
      </USelectMenu>
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
      v-if="!loading && (tagFilter.length || results)"
      class="flex items-center gap-2 flex-wrap"
    >
      <UFieldGroup
        v-for="t in tagFilter"
        :key="t"
        size="xs"
      >
        <UButton
          :color="isTagExcluded(t) ? 'error' : 'primary'"
          variant="subtle"
          :icon="isTagExcluded(t) ? 'i-lucide-ban' : 'i-lucide-tag'"
          :aria-label="isTagExcluded(t) ? `Show only meetings tagged ${t}` : `Hide meetings tagged ${t}`"
          @click="toggleTagExcluded(t)"
        >
          <span :class="isTagExcluded(t) ? 'line-through' : undefined">{{ t }}</span>
        </UButton>
        <UButton
          :color="isTagExcluded(t) ? 'error' : 'primary'"
          variant="subtle"
          icon="i-lucide-x"
          :aria-label="`Remove the ${t} filter`"
          @click="removeTagFilter(t)"
        />
      </UFieldGroup>
      <template v-if="tagFilter.length">
        <InfoTip text="Click a tag to switch between showing meetings with it and hiding them. With several tags shown, a meeting needs any one of them." />
        <UButton
          variant="link"
          color="neutral"
          size="xs"
          @click="tagFilter = []"
        >
          Clear
        </UButton>
      </template>
      <USelect
        v-if="results"
        v-model="sort"
        :items="sortItems"
        icon="i-lucide-arrow-down-wide-narrow"
        size="sm"
        class="w-44 ms-auto"
      />
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
      <template v-if="results">
        No meetings match “{{ searchedFor }}”<template v-if="tagFilter.length">
          with these tags
        </template>.
      </template>
      <template v-else>
        No meetings match these tags.
      </template>
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
        <UTooltip
          v-if="results"
          :text="m.match?.count ? mentionsBreakdown(m.match) : 'Matched the title, summary, location or tags'"
        >
          <div class="w-16 shrink-0 text-center tabular-nums">
            <div
              class="text-xl leading-tight"
              :class="m.match?.count ? 'font-semibold text-(--ui-primary)' : 'text-(--ui-text-dimmed)'"
            >
              {{ m.match?.count || '–' }}
            </div>
            <div class="text-xs text-(--ui-text-muted)">
              {{ m.match?.count === 1 ? 'mention' : 'mentions' }}
            </div>
          </div>
        </UTooltip>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-medium truncate">{{ m.title }}</span>
            <UIcon
              v-if="m.visibility === 'private'"
              name="i-lucide-lock"
              class="size-3.5 shrink-0 text-(--ui-text-dimmed)"
              title="Participants only"
            />
            <UBadge
              v-for="t in m.tags"
              :key="t"
              :color="isTagIncluded(t) ? 'primary' : 'neutral'"
              variant="subtle"
              size="sm"
              class="shrink-0 cursor-pointer"
              :title="`Show meetings tagged ${t}`"
              @click.prevent.stop="addTagFilter(t)"
            >
              {{ t }}
            </UBadge>
          </div>
          <p
            v-if="m.summary"
            class="text-sm text-(--ui-text-toned) truncate"
            :title="m.summary"
          >
            {{ m.summary }}
          </p>
          <div class="text-xs text-(--ui-text-muted) truncate">
            {{ formatMeetingDay(m.starts_at) }}<template v-if="m.location">
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
          <UTooltip :text="`Created by ${m.created_by.display_name}`">
            <UAvatar
              v-bind="userAvatarProps({ id: m.created_by.id, name: m.created_by.display_name, image: m.created_by.avatar })"
              size="2xs"
            />
          </UTooltip>
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
