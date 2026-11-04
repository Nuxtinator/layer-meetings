<script setup lang="ts">
import type { MeetingDetail, MeetingTodo } from '../../utils/meetings-types'
import { formatDueDate, isOverdue } from '../../utils/meetings-format'
import { useMeetingsApi } from '../../composables/useMeetingsApi'

const props = defineProps<{
  meeting: MeetingDetail
  aiAvailable: boolean
}>()

const emit = defineEmits<{
  changed: []
}>()

const api = useMeetingsApi()

// Todos can only go to team members on the meeting.
const assigneeItems = computed(() => props.meeting.participants
  .filter(p => p.user)
  .map(p => ({ id: p.user!.id, label: p.user!.display_name, avatar: { src: p.user!.avatar, alt: p.user!.display_name } })))

const open = computed(() => props.meeting.todos.filter(t => !t.done))
const done = computed(() => props.meeting.todos.filter(t => t.done))
const showDone = ref(false)

// ---- add ----
const draft = reactive({ text: '', assignee: undefined as string | undefined, due: '' })
const adding = ref(false)

async function add() {
  const text = draft.text.trim()
  if (!text) return
  adding.value = true
  const res = await api.call(() => $fetch(`/api/meetings/meetings/${props.meeting.id}/todos`, {
    method: 'POST',
    body: { text, assignee_user_id: draft.assignee ?? null, due_date: draft.due || null }
  }))
  adding.value = false
  if (!res) return
  draft.text = ''
  draft.assignee = undefined
  draft.due = ''
  emit('changed')
}

// ---- update ----
async function patch(todo: MeetingTodo, body: Record<string, unknown>) {
  const res = await api.call(() => $fetch(`/api/meetings/todos/${todo.id}`, { method: 'PATCH', body }))
  if (res) emit('changed')
}

async function remove(todo: MeetingTodo) {
  const res = await api.call(() => $fetch(`/api/meetings/todos/${todo.id}`, { method: 'DELETE' }))
  if (res) emit('changed')
}

const editingId = ref<string | null>(null)
const edit = reactive({ text: '', assignee: undefined as string | undefined, due: '' })

function startEdit(todo: MeetingTodo) {
  editingId.value = todo.id
  edit.text = todo.text
  edit.assignee = todo.assignee?.id
  edit.due = todo.due_date ?? ''
}

async function saveEdit(todo: MeetingTodo) {
  const text = edit.text.trim()
  if (!text) return
  editingId.value = null
  await patch(todo, { text, assignee_user_id: edit.assignee ?? null, due_date: edit.due || null })
}

function menuFor(todo: MeetingTodo) {
  return [[
    { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => startEdit(todo) },
    { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => remove(todo) }
  ]]
}

// ---- AI suggestions ----
const suggestOpen = ref(false)
const canSuggest = computed(() => props.aiAvailable && props.meeting.can_edit && !!props.meeting.transcript)
</script>

<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-center gap-2">
        <h2 class="font-semibold flex-1">
          Todos
        </h2>
        <UButton
          v-if="canSuggest"
          icon="i-lucide-sparkles"
          variant="ghost"
          color="neutral"
          size="xs"
          @click="suggestOpen = true"
        >
          Suggest
        </UButton>
        <span class="text-xs text-(--ui-text-muted)">{{ open.length }} open</span>
      </div>
    </template>

    <ul class="divide-y divide-(--ui-border)">
      <li
        v-for="todo in [...open, ...(showDone ? done : [])]"
        :key="todo.id"
        class="px-4 py-2"
      >
        <form
          v-if="editingId === todo.id"
          class="space-y-2"
          @submit.prevent="saveEdit(todo)"
        >
          <UInput
            v-model="edit.text"
            size="sm"
            class="w-full"
            autofocus
          />
          <div class="flex flex-wrap items-center gap-2">
            <USelectMenu
              v-model="edit.assignee"
              :items="assigneeItems"
              value-key="id"
              label-key="label"
              placeholder="Unassigned"
              size="sm"
              class="min-w-36 flex-1"
            />
            <UButton
              v-if="edit.assignee"
              icon="i-lucide-x"
              variant="ghost"
              color="neutral"
              size="sm"
              aria-label="Unassign"
              @click="edit.assignee = undefined"
            />
            <UInput
              v-model="edit.due"
              type="date"
              size="sm"
            />
          </div>
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              @click="editingId = null"
            >
              Cancel
            </UButton>
            <UButton
              type="submit"
              size="xs"
              :disabled="!edit.text.trim()"
            >
              Save
            </UButton>
          </div>
        </form>
        <div
          v-else
          class="flex items-start gap-2 group"
        >
          <UCheckbox
            :model-value="todo.done"
            :disabled="!meeting.can_edit"
            class="mt-0.5"
            :aria-label="todo.done ? 'Mark as not done' : 'Mark as done'"
            @update:model-value="patch(todo, { done: !todo.done })"
          />
          <div class="flex-1 min-w-0">
            <div
              class="text-sm break-words"
              :class="todo.done ? 'line-through text-(--ui-text-muted)' : ''"
            >
              {{ todo.text }}
            </div>
            <div
              v-if="todo.assignee || todo.due_date"
              class="flex items-center gap-2 mt-0.5 text-xs text-(--ui-text-muted)"
            >
              <span
                v-if="todo.assignee"
                class="inline-flex items-center gap-1"
              >
                <UAvatar
                  :src="todo.assignee.avatar"
                  :alt="todo.assignee.display_name"
                  size="3xs"
                />
                {{ todo.assignee.display_name }}
              </span>
              <span
                v-if="todo.due_date"
                class="inline-flex items-center gap-1"
                :class="!todo.done && isOverdue(todo.due_date) ? 'text-(--ui-error)' : ''"
              >
                <UIcon
                  name="i-lucide-calendar"
                  class="size-3"
                />
                {{ formatDueDate(todo.due_date) }}
              </span>
            </div>
          </div>
          <UDropdownMenu
            v-if="meeting.can_edit"
            :items="menuFor(todo)"
          >
            <UButton
              icon="i-lucide-ellipsis"
              variant="ghost"
              color="neutral"
              size="xs"
              class="opacity-0 group-hover:opacity-100 focus:opacity-100"
              aria-label="Todo actions"
            />
          </UDropdownMenu>
        </div>
      </li>
      <li
        v-if="meeting.todos.length === 0"
        class="px-4 py-3 text-sm text-(--ui-text-muted)"
      >
        No todos yet.
      </li>
      <li
        v-if="done.length"
        class="px-4 py-2"
      >
        <UButton
          variant="link"
          color="neutral"
          size="xs"
          class="px-0"
          :icon="showDone ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          @click="showDone = !showDone"
        >
          {{ showDone ? 'Hide' : 'Show' }} {{ done.length }} done
        </UButton>
      </li>
    </ul>

    <template
      v-if="meeting.can_edit"
      #footer
    >
      <form
        class="space-y-2"
        @submit.prevent="add"
      >
        <UInput
          v-model="draft.text"
          placeholder="Add a todo"
          size="sm"
          class="w-full"
        />
        <div
          v-if="draft.text.trim()"
          class="flex flex-wrap items-center gap-2"
        >
          <USelectMenu
            v-model="draft.assignee"
            :items="assigneeItems"
            value-key="id"
            label-key="label"
            placeholder="Unassigned"
            size="sm"
            class="min-w-36 flex-1"
          />
          <UButton
            v-if="draft.assignee"
            icon="i-lucide-x"
            variant="ghost"
            color="neutral"
            size="sm"
            aria-label="Unassign"
            @click="draft.assignee = undefined"
          />
          <UInput
            v-model="draft.due"
            type="date"
            size="sm"
          />
          <UButton
            type="submit"
            size="sm"
            :loading="adding"
          >
            Add
          </UButton>
        </div>
      </form>
    </template>

    <MeetingsTodoSuggestModal
      v-if="canSuggest"
      v-model:open="suggestOpen"
      :meeting="meeting"
      @saved="emit('changed')"
    />
  </UCard>
</template>
