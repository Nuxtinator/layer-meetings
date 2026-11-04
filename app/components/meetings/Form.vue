<script setup lang="ts">
// Create / edit modal for a meeting's title, time, location and visibility.
import type { MeetingDetail, MeetingVisibility } from '../../utils/meetings-types'
import { MEETINGS_DEFAULT_VISIBILITY, MEETINGS_VISIBILITY_OPTIONS, fromLocalInput, toLocalInput } from '../../utils/meetings-format'
import { meetingsErrorMessage } from '../../composables/useMeetingsApi'

const props = defineProps<{
  meeting: Pick<MeetingDetail, 'id' | 'title' | 'starts_at' | 'location' | 'visibility'> | null
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  saved: [id: string]
}>()

const toast = useToast()

const form = reactive({ title: '', starts_at: '', location: '', visibility: MEETINGS_DEFAULT_VISIBILITY as MeetingVisibility })
const busy = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  const m = props.meeting
  form.title = m?.title ?? ''
  form.starts_at = toLocalInput(m?.starts_at ?? new Date().toISOString())
  form.location = m?.location ?? ''
  form.visibility = m?.visibility ?? MEETINGS_DEFAULT_VISIBILITY
}, { immediate: true })

const canSave = computed(() => !!form.title.trim() && !!form.starts_at)

async function submit() {
  if (!canSave.value || busy.value) return
  busy.value = true
  const body = {
    title: form.title.trim(),
    starts_at: fromLocalInput(form.starts_at),
    location: form.location.trim() || null,
    visibility: form.visibility
  }
  try {
    const id = props.meeting
      ? (await $fetch(`/api/meetings/meetings/${props.meeting.id}`, { method: 'PATCH', body }), props.meeting.id)
      : (await $fetch<{ meeting: { id: string } }>('/api/meetings/meetings', { method: 'POST', body })).meeting.id
    open.value = false
    emit('saved', id)
  } catch (e) {
    toast.add({ title: meetingsErrorMessage(e), color: 'error' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="meeting ? 'Edit meeting' : 'New meeting'"
  >
    <template #body>
      <form
        class="space-y-4"
        @submit.prevent="submit"
      >
        <UFormField
          label="Title"
          required
        >
          <UInput
            v-model="form.title"
            placeholder="Weekly team sync"
            class="w-full"
            autofocus
          />
        </UFormField>

        <UFormField
          label="When"
          required
        >
          <UInput
            v-model="form.starts_at"
            type="datetime-local"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Location or link">
          <UInput
            v-model="form.location"
            placeholder="Room 2, or a call link"
            class="w-full"
          />
        </UFormField>

        <UFormField>
          <template #label>
            Who can see it <InfoTip text="Participants only: the creator, team members added as participants, and meetings admins." />
          </template>
          <div class="grid grid-cols-2 gap-2">
            <UButton
              v-for="o in MEETINGS_VISIBILITY_OPTIONS"
              :key="o.value"
              :icon="o.icon"
              :variant="form.visibility === o.value ? 'soft' : 'outline'"
              :color="form.visibility === o.value ? 'primary' : 'neutral'"
              :aria-pressed="form.visibility === o.value"
              class="justify-center"
              @click="form.visibility = o.value"
            >
              {{ o.label }}
            </UButton>
          </div>
        </UFormField>
      </form>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          variant="ghost"
          color="neutral"
          :disabled="busy"
          @click="open = false"
        >
          Cancel
        </UButton>
        <UButton
          :loading="busy"
          :disabled="!canSave"
          @click="submit"
        >
          {{ meeting ? 'Save' : 'Create meeting' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
