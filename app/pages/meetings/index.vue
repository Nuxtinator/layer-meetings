<script setup lang="ts">
import type { MeetingSummary } from '../../utils/meetings-types'
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

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return meetings.value
  return meetings.value.filter(m => m.title.toLowerCase().includes(q) || (m.location ?? '').toLowerCase().includes(q))
})

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
        placeholder="Search"
        class="w-48"
      />
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
      description="Add a meeting to keep its recording, transcript, notes, participants and todos together."
      :actions="canCreate ? [{ label: 'Add the first meeting', icon: 'i-lucide-plus', onClick: () => { formOpen = true } }] : []"
    />

    <p
      v-else-if="filtered.length === 0"
      class="py-8 text-center text-sm text-(--ui-text-muted)"
    >
      No meetings match “{{ search }}”.
    </p>

    <div
      v-else
      class="rounded-lg border border-(--ui-border) bg-(--ui-bg-elevated) divide-y divide-(--ui-border)"
    >
      <NuxtLink
        v-for="m in filtered"
        :key="m.id"
        :to="`/meetings/${m.id}`"
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
          v-if="m.open_todos"
          color="warning"
          variant="subtle"
          size="sm"
        >
          {{ m.open_todos }} open todo{{ m.open_todos === 1 ? '' : 's' }}
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
