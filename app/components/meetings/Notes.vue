<script setup lang="ts">
// The caller's own private notes, saved as they type.
import type { EditorToolbarItem } from '@nuxt/ui'
import type { MeetingDetail } from '../../utils/meetings-types'
import { useMeetingsApi } from '../../composables/useMeetingsApi'

const props = defineProps<{
  meeting: MeetingDetail
  aiAvailable: boolean
}>()

const api = useMeetingsApi()

const body = ref(props.meeting.my_note?.body_md ?? '')
const savedBody = ref(body.value)
const saving = ref(false)
const savedAt = ref<string | null>(props.meeting.my_note?.updated_at ?? null)

const dirty = computed(() => body.value !== savedBody.value)

async function save() {
  if (saving.value) return
  const snapshot = body.value
  saving.value = true
  const res = await api.call(() => $fetch<{ note: { updated_at: string } }>(`/api/meetings/meetings/${props.meeting.id}/notes`, {
    method: 'PUT',
    body: { body_md: snapshot }
  }))
  saving.value = false
  if (!res) return
  savedBody.value = snapshot
  savedAt.value = res.note.updated_at
  if (body.value !== snapshot) scheduleSave()
}

let timer: ReturnType<typeof setTimeout> | null = null
function scheduleSave() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    save()
  }, 1200)
}

watch(body, () => {
  if (dirty.value) scheduleSave()
})

// Leaving the page flushes a pending save; closing the browser tab mid-save
// gets the browser's own prompt.
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value || saving.value) e.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  if (timer) clearTimeout(timer)
  if (dirty.value) save()
})

const status = computed(() => {
  if (saving.value) return 'Saving…'
  if (dirty.value) return 'Unsaved'
  return savedAt.value ? 'Saved' : ''
})

const toolbarItems: EditorToolbarItem[][] = [
  [
    { kind: 'heading', level: 2, icon: 'i-lucide-heading-2', tooltip: { text: 'Heading' } },
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: 'Bold' } },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: 'Italic' } }
  ],
  [
    { kind: 'bulletList', icon: 'i-lucide-list', tooltip: { text: 'Bullet list' } },
    { kind: 'orderedList', icon: 'i-lucide-list-ordered', tooltip: { text: 'Numbered list' } }
  ]
]

// ---- AI summary ----
const summarizing = ref(false)
const canSummarize = computed(() => props.aiAvailable && !!props.meeting.transcript)

async function summarize() {
  summarizing.value = true
  const res = await api.call(() => $fetch<{ summary_md: string }>(`/api/meetings/meetings/${props.meeting.id}/ai/summary`, { method: 'POST' }))
  summarizing.value = false
  if (!res?.summary_md) return
  body.value = body.value.trim()
    ? `${body.value.trim()}\n\n## Summary\n\n${res.summary_md}`
    : `## Summary\n\n${res.summary_md}`
}
</script>

<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-center gap-3 flex-wrap">
        <h2 class="font-semibold flex-1">
          My notes
        </h2>
        <span class="text-xs text-(--ui-text-muted)">{{ status }}</span>
        <UButton
          v-if="canSummarize"
          icon="i-lucide-sparkles"
          variant="ghost"
          color="neutral"
          size="xs"
          :loading="summarizing"
          @click="summarize"
        >
          Summarize transcript
        </UButton>
        <InfoTip text="Only you can see these. Notes for everyone go in Meeting notes." />
      </div>
    </template>
    <UEditor
      v-slot="{ editor }"
      v-model="body"
      content-type="markdown"
      :image="false"
      :mention="false"
      placeholder="Take notes…"
      class="min-h-64"
      :ui="{ base: 'px-4 py-3 sm:px-6' }"
    >
      <UEditorToolbar
        :editor="editor"
        :items="toolbarItems"
        class="border-b border-(--ui-border) px-2 py-1 overflow-x-auto"
      />
    </UEditor>
  </UCard>
</template>
