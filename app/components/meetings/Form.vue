<script setup lang="ts">
// Create / edit modal for a meeting's title, summary, time, location, tags and visibility.
import type { MeetingDetail, MeetingVisibility } from '../../utils/meetings-types'
import { MEETINGS_DEFAULT_VISIBILITY, MEETINGS_MAX_SUMMARY_CHARS, MEETINGS_VISIBILITY_OPTIONS, fromLocalInput, toLocalInput } from '../../utils/meetings-format'
import { meetingsErrorMessage } from '../../composables/useMeetingsApi'

const props = defineProps<{
  meeting: Pick<MeetingDetail, 'id' | 'title' | 'summary' | 'starts_at' | 'location' | 'visibility' | 'tags'> | null
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  saved: [id: string]
}>()

const toast = useToast()

const form = reactive({ title: '', summary: '', starts_at: '', location: '', tags: [] as string[], visibility: MEETINGS_DEFAULT_VISIBILITY as MeetingVisibility })
const busy = ref(false)

// Tags already used on other meetings, offered first so the team reuses them.
const knownTags = ref<string[]>([])
const tagSearch = ref('')
const tagItems = computed(() => [...new Set([...knownTags.value, ...form.tags])])

async function loadKnownTags() {
  try {
    knownTags.value = (await $fetch<{ tags: string[] }>('/api/meetings/tags')).tags
  } catch {
    knownTags.value = []
  }
}

function addTag(tag: string) {
  const t = tag.replace(/\s+/g, ' ').trim()
  if (!t) return
  const existing = tagItems.value.find(k => k.toLowerCase() === t.toLowerCase())
  const value = existing ?? t
  if (!form.tags.includes(value)) form.tags.push(value)
  tagSearch.value = ''
}

watch(open, (isOpen) => {
  if (!isOpen) return
  const m = props.meeting
  form.title = m?.title ?? ''
  form.summary = m?.summary ?? ''
  form.starts_at = toLocalInput(m?.starts_at ?? new Date().toISOString())
  form.location = m?.location ?? ''
  form.tags = [...(m?.tags ?? [])]
  form.visibility = m?.visibility ?? MEETINGS_DEFAULT_VISIBILITY
  loadKnownTags()
}, { immediate: true })

const canSave = computed(() => !!form.title.trim() && !!form.starts_at)

async function submit() {
  if (!canSave.value || busy.value) return
  busy.value = true
  const body = {
    title: form.title.trim(),
    summary: form.summary.trim() || null,
    starts_at: fromLocalInput(form.starts_at),
    location: form.location.trim() || null,
    tags: form.tags,
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

        <UFormField>
          <template #label>
            Summary <InfoTip text="One line shown under the title in the meetings list, so people can tell this meeting apart from others." />
          </template>
          <UInput
            v-model="form.summary"
            :maxlength="MEETINGS_MAX_SUMMARY_CHARS"
            placeholder="What this meeting covered"
            class="w-full"
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

        <UFormField label="Tags">
          <UInputMenu
            v-model="form.tags"
            v-model:search-term="tagSearch"
            :items="tagItems"
            multiple
            create-item="always"
            placeholder="Add a tag"
            icon="i-lucide-tag"
            class="w-full"
            @create="addTag"
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
