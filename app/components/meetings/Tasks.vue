<script setup lang="ts">
// The meeting's tasks: task records (records layer) whose `meeting` field
// points at it, listed with quick add, inline edit, a done checkbox, and AI
// suggestions from the transcript.
import type { MeetingDetail, MeetingsUser } from '../../utils/meetings-types'
import { formatDueDate, isOverdue } from '../../utils/meetings-format'
import { useMeetingsApi } from '../../composables/useMeetingsApi'

const props = defineProps<{
  meeting: MeetingDetail
  users: MeetingsUser[]
  aiAvailable: boolean
}>()

const emit = defineEmits<{
  changed: []
}>()

interface TaskRow {
  id: string
  name: string
  status: string | null
  assignedTo: string[]
  data: Record<string, unknown>
}

interface Task {
  id: string
  text: string
  assignee: MeetingsUser | null
  due_date: string | null
  done: boolean
}

const api = useMeetingsApi()
const shareConfirm = useRecordsShareConfirm()
const recordsTypes = useRecordsTypes()
const typePath = useRecordsTypePath()

// Tasks can only go to team members on the meeting.
const assigneeItems = computed(() => props.meeting.participants
  .filter(p => p.user)
  .map(p => ({ id: p.user!.id, label: p.user!.display_name, avatar: { src: p.user!.avatar, alt: p.user!.display_name } })))

const knownUsers = computed(() => {
  const map = new Map(props.users.map(u => [u.id, u]))
  for (const p of props.meeting.participants) if (p.user) map.set(p.user.id, p.user)
  return map
})

// The org's task statuses: ticking a task moves it to the first closed one,
// unticking moves it back to the default (or first open) one.
const closedStatuses = ref<string[]>(['done'])
const doneStatus = ref('done')
const openStatus = ref('open')

async function loadStatuses() {
  const res = await api.call(() => recordsTypes.getFields('task'))
  const status = res?.fields.find(f => f.column === 'status')
  if (!status?.options) return
  const entries = Object.entries(status.options)
  const closed = entries.filter(([, o]) => o.closed).map(([k]) => k)
  const open = entries.filter(([, o]) => !o.closed && !o.deleted).map(([k]) => k)
  if (closed.length) closedStatuses.value = closed
  doneStatus.value = entries.find(([, o]) => o.closed && !o.deleted)?.[0] ?? doneStatus.value
  const def = typeof status.default === 'string' ? status.default : undefined
  openStatus.value = def && open.includes(def) ? def : (open[0] ?? openStatus.value)
}

const tasks = ref<Task[]>([])

async function loadTasks() {
  const res = await api.call(() => $fetch<{ items: TaskRow[] }>('/api/records/entries/task', {
    query: { filters: JSON.stringify({ meeting: props.meeting.id }), sort: 'created_at', dir: 'asc', limit: 100 }
  }))
  if (!res) return
  tasks.value = res.items.map((r) => {
    const assigneeId = r.assignedTo[0]
    const due = r.data.due_date
    return {
      id: r.id,
      text: r.name,
      assignee: assigneeId ? knownUsers.value.get(assigneeId) ?? null : null,
      due_date: typeof due === 'string' && due ? due.slice(0, 10) : null,
      done: !!r.status && closedStatuses.value.includes(r.status)
    }
  })
}

onMounted(async () => {
  await loadStatuses()
  await loadTasks()
})
watch(() => props.meeting.id, loadTasks)

async function afterWrite() {
  await loadTasks()
  emit('changed')
}

const open = computed(() => tasks.value.filter(t => !t.done))
const done = computed(() => tasks.value.filter(t => t.done))
const showDone = ref(false)

// ---- add ----
const draft = reactive({ text: '', assignee: undefined as string | undefined, due: '' })
const adding = ref(false)

async function add() {
  const text = draft.text.trim()
  if (!text) return
  adding.value = true
  const fields: Record<string, unknown> = { name: text, meeting: props.meeting.id }
  if (draft.assignee) fields.assignee = draft.assignee
  if (draft.due) fields.due_date = draft.due
  const res = await api.call(() => shareConfirm(confirmShare => $fetch('/api/records/entries/task', {
    method: 'POST',
    body: { fields, confirmShare }
  })))
  adding.value = false
  if (!res) return
  draft.text = ''
  draft.assignee = undefined
  draft.due = ''
  await afterWrite()
}

// ---- update ----
async function patch(task: Task, fields: Record<string, unknown>) {
  const res = await api.call(() => shareConfirm(confirmShare => $fetch(`/api/records/entries/task/${task.id}`, {
    method: 'PATCH',
    body: { fields, confirmShare }
  })))
  if (res) await afterWrite()
}

function toggleDone(task: Task) {
  return patch(task, { status: task.done ? openStatus.value : doneStatus.value })
}

async function remove(task: Task) {
  const res = await api.call(() => $fetch(`/api/records/entries/task/${task.id}`, { method: 'DELETE' }))
  if (res) await afterWrite()
}

const editingId = ref<string | null>(null)
const edit = reactive({ text: '', assignee: undefined as string | undefined, due: '' })

function startEdit(task: Task) {
  editingId.value = task.id
  edit.text = task.text
  edit.assignee = task.assignee?.id
  edit.due = task.due_date ?? ''
}

async function saveEdit(task: Task) {
  const text = edit.text.trim()
  if (!text) return
  editingId.value = null
  await patch(task, { name: text, assignee: edit.assignee ?? null, due_date: edit.due || null })
}

function menuFor(task: Task) {
  return [[
    { label: 'Open', icon: 'i-lucide-external-link', to: typePath('task', task.id) },
    { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => startEdit(task) },
    { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => remove(task) }
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
          Tasks
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
        v-for="task in [...open, ...(showDone ? done : [])]"
        :key="task.id"
        class="px-4 py-2"
      >
        <form
          v-if="editingId === task.id"
          class="space-y-2"
          @submit.prevent="saveEdit(task)"
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
            :model-value="task.done"
            :disabled="!meeting.can_edit"
            class="mt-0.5"
            :aria-label="task.done ? 'Mark as not done' : 'Mark as done'"
            @update:model-value="toggleDone(task)"
          />
          <div class="flex-1 min-w-0">
            <div
              class="text-sm break-words"
              :class="task.done ? 'line-through text-(--ui-text-muted)' : ''"
            >
              {{ task.text }}
            </div>
            <div
              v-if="task.assignee || task.due_date"
              class="flex items-center gap-2 mt-0.5 text-xs text-(--ui-text-muted)"
            >
              <span
                v-if="task.assignee"
                class="inline-flex items-center gap-1"
              >
                <UAvatar
                  :src="task.assignee.avatar"
                  :alt="task.assignee.display_name"
                  size="3xs"
                />
                {{ task.assignee.display_name }}
              </span>
              <span
                v-if="task.due_date"
                class="inline-flex items-center gap-1"
                :class="!task.done && isOverdue(task.due_date) ? 'text-(--ui-error)' : ''"
              >
                <UIcon
                  name="i-lucide-calendar"
                  class="size-3"
                />
                {{ formatDueDate(task.due_date) }}
              </span>
            </div>
          </div>
          <UDropdownMenu
            v-if="meeting.can_edit"
            :items="menuFor(task)"
          >
            <UButton
              icon="i-lucide-ellipsis"
              variant="ghost"
              color="neutral"
              size="xs"
              class="opacity-0 group-hover:opacity-100 focus:opacity-100"
              aria-label="Task actions"
            />
          </UDropdownMenu>
        </div>
      </li>
      <li
        v-if="tasks.length === 0"
        class="px-4 py-3 text-sm text-(--ui-text-muted)"
      >
        No tasks yet.
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
          placeholder="Add a task"
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

    <MeetingsTaskSuggestModal
      v-if="canSuggest"
      v-model:open="suggestOpen"
      :meeting="meeting"
      @saved="afterWrite"
    />
  </UCard>
</template>
