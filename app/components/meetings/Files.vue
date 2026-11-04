<script setup lang="ts">
import type { MeetingAttachment, MeetingDetail } from '../../utils/meetings-types'
import { formatBytes } from '../../utils/meetings-format'
import { useMeetingsApi } from '../../composables/useMeetingsApi'

const props = defineProps<{
  meeting: MeetingDetail
}>()

const emit = defineEmits<{
  changed: []
}>()

const api = useMeetingsApi()
const confirmAction = useConfirm()

const input = ref<HTMLInputElement | null>(null)
const uploads = ref<{ key: number, name: string, progress: number }[]>([])
let nextKey = 0

async function uploadAll(files: FileList | File[]) {
  const list = [...files]
  if (list.length === 0) return
  await Promise.all(list.map(async (file) => {
    const entry = reactive({ key: nextKey++, name: file.name, progress: 0 })
    uploads.value.push(entry)
    await api.uploadFile(props.meeting.id, file, (f) => {
      entry.progress = f
    })
    uploads.value = uploads.value.filter(u => u.key !== entry.key)
  }))
  emit('changed')
}

function onPick(e: Event) {
  const el = e.target as HTMLInputElement
  if (el.files) uploadAll(el.files)
  el.value = ''
}

const dragging = ref(false)
function onDrop(e: DragEvent) {
  dragging.value = false
  if (!props.meeting.can_edit) return
  if (e.dataTransfer?.files) uploadAll(e.dataTransfer.files)
}

function iconFor(a: MeetingAttachment): string {
  if (a.mime_type.startsWith('audio/')) return 'i-lucide-file-audio'
  if (a.mime_type.startsWith('video/')) return 'i-lucide-file-video'
  if (a.mime_type.startsWith('image/')) return 'i-lucide-file-image'
  if (a.mime_type === 'application/pdf') return 'i-lucide-file-text'
  return 'i-lucide-file'
}

async function remove(a: MeetingAttachment) {
  if (!await confirmAction({ title: `Delete ${a.filename}?`, confirmLabel: 'Delete', color: 'error' })) return
  const res = await api.call(() => $fetch(`/api/meetings/attachments/${a.id}`, { method: 'DELETE' }))
  if (res) emit('changed')
}
</script>

<template>
  <UCard
    :ui="{ body: 'p-0 sm:p-0' }"
    :class="dragging ? 'ring-2 ring-(--ui-primary)' : ''"
    @dragover.prevent="dragging = meeting.can_edit"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <h2 class="font-semibold flex-1">
          Recordings &amp; files
        </h2>
        <UButton
          v-if="meeting.can_edit"
          icon="i-lucide-upload"
          variant="ghost"
          color="neutral"
          size="xs"
          @click="input?.click()"
        >
          Upload
        </UButton>
        <input
          ref="input"
          type="file"
          multiple
          class="hidden"
          @change="onPick"
        >
      </div>
    </template>

    <ul class="divide-y divide-(--ui-border)">
      <li
        v-for="u in uploads"
        :key="u.key"
        class="px-4 py-3 space-y-1.5"
      >
        <div class="flex items-center gap-2 text-sm">
          <UIcon
            name="i-lucide-loader-circle"
            class="size-4 animate-spin shrink-0 text-(--ui-text-muted)"
          />
          <span class="flex-1 truncate">{{ u.name }}</span>
          <span class="text-xs text-(--ui-text-muted) tabular-nums">{{ Math.round(u.progress * 100) }}%</span>
        </div>
        <UProgress
          :model-value="Math.round(u.progress * 100)"
          size="xs"
        />
      </li>
      <li
        v-for="a in meeting.attachments"
        :key="a.id"
        class="px-4 py-3 space-y-2 group"
      >
        <div class="flex items-center gap-2">
          <UIcon
            :name="iconFor(a)"
            class="size-5 shrink-0 text-(--ui-text-muted)"
          />
          <div class="flex-1 min-w-0">
            <a
              :href="a.url"
              target="_blank"
              rel="noopener"
              class="text-sm font-medium truncate block hover:underline"
            >{{ a.filename }}</a>
            <div class="text-xs text-(--ui-text-muted)">
              {{ formatBytes(a.size_bytes) }} · {{ a.created_by.display_name }}
            </div>
          </div>
          <UButton
            v-if="meeting.can_edit"
            icon="i-lucide-trash-2"
            variant="ghost"
            color="neutral"
            size="xs"
            class="opacity-0 group-hover:opacity-100 focus:opacity-100"
            :aria-label="`Delete ${a.filename}`"
            @click="remove(a)"
          />
        </div>
        <audio
          v-if="a.mime_type.startsWith('audio/')"
          :src="a.url"
          controls
          preload="metadata"
          class="w-full"
        />
        <video
          v-else-if="a.mime_type.startsWith('video/')"
          :src="a.url"
          controls
          preload="metadata"
          class="w-full rounded-md"
        />
      </li>
      <li
        v-if="meeting.attachments.length === 0 && uploads.length === 0"
        class="px-4 py-6 text-center text-sm text-(--ui-text-muted)"
      >
        <template v-if="meeting.can_edit">
          Drop a recording or file here, or
          <UButton
            variant="link"
            size="sm"
            class="px-0"
            @click="input?.click()"
          >
            choose one
          </UButton>.
        </template>
        <template v-else>
          No files.
        </template>
      </li>
    </ul>
  </UCard>
</template>
