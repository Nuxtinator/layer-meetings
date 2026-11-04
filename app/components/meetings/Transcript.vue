<script setup lang="ts">
import type { MeetingDetail } from '../../utils/meetings-types'
import { useMeetingsApi } from '../../composables/useMeetingsApi'

const props = defineProps<{
  meeting: MeetingDetail
}>()

const emit = defineEmits<{
  changed: []
}>()

const api = useMeetingsApi()
const confirmAction = useConfirm()

const editing = ref(false)
const draft = ref('')
const saving = ref(false)

function startEdit() {
  draft.value = props.meeting.transcript ?? ''
  editing.value = true
}

async function save(value: string | null) {
  saving.value = true
  const res = await api.call(() => $fetch(`/api/meetings/meetings/${props.meeting.id}`, { method: 'PATCH', body: { transcript: value } }))
  saving.value = false
  if (!res) return
  editing.value = false
  emit('changed')
}

async function clear() {
  if (!await confirmAction({ title: 'Remove the transcript?', confirmLabel: 'Remove', color: 'error' })) return
  await save(null)
}

const words = computed(() => props.meeting.transcript?.trim().split(/\s+/).length ?? 0)
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <h2 class="font-semibold flex-1">
          Transcript
        </h2>
        <span
          v-if="meeting.transcript && !editing"
          class="text-xs text-(--ui-text-muted)"
        >{{ words.toLocaleString() }} words</span>
        <template v-if="meeting.can_edit && !editing && meeting.transcript">
          <UButton
            icon="i-lucide-pencil"
            variant="ghost"
            color="neutral"
            size="xs"
            @click="startEdit"
          >
            Edit
          </UButton>
          <UButton
            icon="i-lucide-trash-2"
            variant="ghost"
            color="error"
            size="xs"
            aria-label="Remove transcript"
            @click="clear"
          />
        </template>
      </div>
    </template>

    <form
      v-if="editing"
      class="space-y-2"
      @submit.prevent="save(draft)"
    >
      <UTextarea
        v-model="draft"
        placeholder="Paste the transcript here"
        :rows="16"
        autoresize
        :maxrows="40"
        class="w-full"
        :ui="{ base: 'font-mono text-xs' }"
        autofocus
      />
      <div class="flex justify-end gap-2">
        <UButton
          variant="ghost"
          color="neutral"
          :disabled="saving"
          @click="editing = false"
        >
          Cancel
        </UButton>
        <UButton
          type="submit"
          :loading="saving"
          :disabled="draft === (meeting.transcript ?? '')"
        >
          Save transcript
        </UButton>
      </div>
    </form>

    <div
      v-else-if="meeting.transcript"
      class="whitespace-pre-wrap break-words text-sm leading-relaxed max-h-[70vh] overflow-y-auto"
    >
      {{ meeting.transcript }}
    </div>

    <UEmpty
      v-else
      icon="i-lucide-file-text"
      title="No transcript"
      :description="meeting.can_edit ? 'Paste a transcript from Zoom, Meet, Otter or anywhere else.' : undefined"
      :actions="meeting.can_edit ? [{ label: 'Paste transcript', icon: 'i-lucide-clipboard-paste', onClick: startEdit }] : []"
    />
  </UCard>
</template>
