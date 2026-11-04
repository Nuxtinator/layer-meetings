<script setup lang="ts">
// Todos assigned to the current user across every meeting.
import type { MyMeetingTodo } from '../../utils/meetings-types'
import { formatDueDate, formatMeetingDay, isOverdue } from '../../utils/meetings-format'
import { useMeetingsApi } from '../../composables/useMeetingsApi'

definePageMeta({
  middleware: 'auth'
})

const api = useMeetingsApi()

const status = ref<'open' | 'done'>('open')
const todos = ref<MyMeetingTodo[]>([])
const loading = ref(true)

async function load() {
  loading.value = true
  const res = await api.call(() => $fetch<{ todos: MyMeetingTodo[] }>('/api/meetings/todos', { query: { status: status.value } }))
  if (res) todos.value = res.todos
  loading.value = false
}

onMounted(load)
watch(status, load)

async function toggle(todo: MyMeetingTodo) {
  const res = await api.call(() => $fetch(`/api/meetings/todos/${todo.id}`, { method: 'PATCH', body: { done: !todo.done } }))
  if (res) todos.value = todos.value.filter(t => t.id !== todo.id)
}

const statusItems = [
  { label: 'Open', value: 'open' },
  { label: 'Done', value: 'done' }
]
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-4">
    <div class="flex items-center gap-3 flex-wrap">
      <h1 class="text-2xl font-semibold flex-1">
        My todos
      </h1>
      <UTabs
        v-model="status"
        :items="statusItems"
        :content="false"
        size="sm"
      />
    </div>

    <div
      v-if="loading"
      class="py-12 text-center text-(--ui-text-muted)"
    >
      Loading…
    </div>

    <UEmpty
      v-else-if="todos.length === 0"
      :icon="status === 'open' ? 'i-lucide-coffee' : 'i-lucide-list-checks'"
      :title="status === 'open' ? 'Nothing on your list' : 'Nothing done yet'"
      :description="status === 'open' ? 'Todos assigned to you in a meeting show up here.' : undefined"
    />

    <ul
      v-else
      class="rounded-lg border border-(--ui-border) bg-(--ui-bg-elevated) divide-y divide-(--ui-border)"
    >
      <li
        v-for="todo in todos"
        :key="todo.id"
        class="flex items-start gap-3 px-4 py-3"
      >
        <UCheckbox
          :model-value="todo.done"
          class="mt-0.5"
          :aria-label="todo.done ? 'Mark as not done' : 'Mark as done'"
          @update:model-value="toggle(todo)"
        />
        <div class="flex-1 min-w-0">
          <div
            class="text-sm break-words"
            :class="todo.done ? 'line-through text-(--ui-text-muted)' : ''"
          >
            {{ todo.text }}
          </div>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-(--ui-text-muted)">
            <NuxtLink
              :to="`/meetings/${todo.meeting.id}`"
              class="inline-flex items-center gap-1 hover:underline min-w-0"
            >
              <UIcon
                name="i-lucide-calendar-clock"
                class="size-3 shrink-0"
              />
              <span class="truncate">{{ todo.meeting.title }} · {{ formatMeetingDay(todo.meeting.starts_at) }}</span>
            </NuxtLink>
            <span
              v-if="todo.due_date"
              class="inline-flex items-center gap-1"
              :class="!todo.done && isOverdue(todo.due_date) ? 'text-(--ui-error)' : ''"
            >
              <UIcon
                name="i-lucide-calendar"
                class="size-3"
              />
              Due {{ formatDueDate(todo.due_date) }}
            </span>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>
