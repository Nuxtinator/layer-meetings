<script setup lang="ts">
// Proposes todos from the transcript; nothing is saved until the reviewer
// picks which to keep.
import type { MeetingDetail, SuggestedMeetingTodo } from '../../utils/meetings-types'
import { useMeetingsApi } from '../../composables/useMeetingsApi'

const props = defineProps<{
  meeting: MeetingDetail
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  saved: []
}>()

const api = useMeetingsApi()
const toast = useToast()

interface Row {
  keep: boolean
  text: string
  assignee: string | undefined
  due: string
}

const rows = ref<Row[]>([])
const loading = ref(false)
const saving = ref(false)

const assigneeItems = computed(() => props.meeting.participants
  .filter(p => p.user)
  .map(p => ({ id: p.user!.id, label: p.user!.display_name })))

async function load() {
  loading.value = true
  rows.value = []
  const res = await api.call(() => $fetch<{ todos: SuggestedMeetingTodo[] }>(`/api/meetings/meetings/${props.meeting.id}/ai/todos`, { method: 'POST' }))
  loading.value = false
  if (!res) {
    open.value = false
    return
  }
  rows.value = res.todos.map(t => ({ keep: true, text: t.text, assignee: t.assignee_user_id ?? undefined, due: t.due_date ?? '' }))
}

watch(open, (isOpen) => {
  if (isOpen) load()
})

const kept = computed(() => rows.value.filter(r => r.keep && r.text.trim()))

async function save() {
  saving.value = true
  let added = 0
  for (const r of kept.value) {
    const res = await api.call(() => $fetch(`/api/meetings/meetings/${props.meeting.id}/todos`, {
      method: 'POST',
      body: { text: r.text.trim(), assignee_user_id: r.assignee ?? null, due_date: r.due || null }
    }))
    if (res) added++
  }
  saving.value = false
  if (added) toast.add({ title: `Added ${added} todo${added === 1 ? '' : 's'}`, color: 'success' })
  open.value = false
  emit('saved')
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Suggested todos"
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <div
        v-if="loading"
        class="py-10 flex flex-col items-center gap-2 text-sm text-(--ui-text-muted)"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-5 animate-spin"
        />
        Reading the transcript…
      </div>
      <p
        v-else-if="rows.length === 0"
        class="py-6 text-center text-sm text-(--ui-text-muted)"
      >
        No action items found in the transcript.
      </p>
      <ul
        v-else
        class="space-y-3"
      >
        <li
          v-for="(r, i) in rows"
          :key="i"
          class="flex items-start gap-2"
        >
          <UCheckbox
            v-model="r.keep"
            class="mt-2"
            aria-label="Keep this todo"
          />
          <div
            class="flex-1 min-w-0 space-y-2"
            :class="r.keep ? '' : 'opacity-50'"
          >
            <UInput
              v-model="r.text"
              size="sm"
              class="w-full"
              :disabled="!r.keep"
            />
            <div class="flex flex-wrap items-center gap-2">
              <USelectMenu
                v-model="r.assignee"
                :items="assigneeItems"
                value-key="id"
                label-key="label"
                placeholder="Unassigned"
                size="sm"
                class="min-w-36 flex-1"
                :disabled="!r.keep"
              />
              <UButton
                v-if="r.assignee && r.keep"
                icon="i-lucide-x"
                variant="ghost"
                color="neutral"
                size="sm"
                aria-label="Unassign"
                @click="r.assignee = undefined"
              />
              <UInput
                v-model="r.due"
                type="date"
                size="sm"
                :disabled="!r.keep"
              />
            </div>
          </div>
        </li>
      </ul>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          variant="ghost"
          color="neutral"
          :disabled="saving"
          @click="open = false"
        >
          Cancel
        </UButton>
        <UButton
          :loading="saving"
          :disabled="loading || kept.length === 0"
          @click="save"
        >
          Add {{ kept.length || '' }} todo{{ kept.length === 1 ? '' : 's' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
