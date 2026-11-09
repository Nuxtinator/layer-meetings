<script setup lang="ts">
// The meeting's tasks: task records linked to it, shown through the
// built-in `meeting-tasks` view (a list with quick-add, and a board by
// status), plus AI suggestions from the transcript.
import type { MeetingDetail } from '../../utils/meetings-types'

const props = defineProps<{
  meeting: MeetingDetail
  aiAvailable: boolean
}>()

const emit = defineEmits<{
  changed: []
}>()

const viewId = computed(() => `builtin.meeting-tasks.${props.meeting.id}`)

const suggestOpen = ref(false)
const canSuggest = computed(() => props.aiAvailable && props.meeting.can_edit && !!props.meeting.transcript)

// Remounting the view reloads it with the tasks just added.
const viewKey = ref(0)
function onSuggested() {
  viewKey.value++
  emit('changed')
}
</script>

<template>
  <div class="space-y-2">
    <div
      v-if="canSuggest"
      class="flex justify-end"
    >
      <UButton
        icon="i-lucide-sparkles"
        variant="outline"
        color="neutral"
        size="sm"
        @click="suggestOpen = true"
      >
        Suggest from transcript
      </UButton>
    </div>

    <ViewsViewPanel
      :key="viewKey"
      :view-id="viewId"
      embedded
      class="h-[36rem]"
    />

    <MeetingsTaskSuggestModal
      v-model:open="suggestOpen"
      :meeting="meeting"
      @saved="onSuggested"
    />
  </div>
</template>
