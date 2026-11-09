<script setup lang="ts">
import type { MeetingDetail, MeetingsUser } from '../../utils/meetings-types'
import { participantLabel } from '../../utils/meetings-format'
import { useMeetingsApi } from '../../composables/useMeetingsApi'

const props = defineProps<{
  meeting: MeetingDetail
  users: MeetingsUser[]
}>()

const emit = defineEmits<{
  changed: []
}>()

const api = useMeetingsApi()

const memberItems = computed(() => {
  const taken = new Set(props.meeting.participants.map(p => p.user?.id).filter(Boolean))
  return props.users
    .filter(u => !taken.has(u.id))
    .map(u => ({ id: u.id, label: u.display_name, avatar: { src: u.avatar, alt: u.display_name } }))
})

const busy = ref(false)

async function addMember(userId: string | undefined) {
  if (!userId) return
  busy.value = true
  const res = await api.call(() => $fetch(`/api/meetings/meetings/${props.meeting.id}/participants`, { method: 'POST', body: { user_id: userId } }))
  busy.value = false
  if (res) emit('changed')
}

const guestOpen = ref(false)
const guest = reactive({ name: '', email: '' })

async function addGuest() {
  const name = guest.name.trim()
  if (!name) return
  busy.value = true
  const res = await api.call(() => $fetch(`/api/meetings/meetings/${props.meeting.id}/participants`, {
    method: 'POST',
    body: { name, email: guest.email.trim() || null }
  }))
  busy.value = false
  if (!res) return
  guest.name = ''
  guest.email = ''
  guestOpen.value = false
  emit('changed')
}

async function remove(p: MeetingDetail['participants'][number]) {
  const res = await api.call(() => $fetch(`/api/meetings/participants/${p.id}`, { method: 'DELETE' }))
  if (res) emit('changed')
}
</script>

<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-center gap-2">
        <h2 class="font-semibold flex-1">
          Participants
        </h2>
        <span class="text-xs text-(--ui-text-muted)">{{ meeting.participants.length }}</span>
      </div>
    </template>

    <ul class="divide-y divide-(--ui-border)">
      <li
        v-for="p in meeting.participants"
        :key="p.id"
        class="flex items-center gap-2 px-4 py-2 group"
      >
        <UAvatar
          v-if="p.user"
          :src="p.user.avatar"
          :alt="p.user.display_name"
          size="xs"
        />
        <UAvatar
          v-else
          icon="i-lucide-user-round"
          size="xs"
        />
        <div class="flex-1 min-w-0">
          <div class="text-sm truncate">
            {{ participantLabel(p) }}
          </div>
          <div
            v-if="!p.user"
            class="text-xs text-(--ui-text-muted) truncate"
          >
            Guest<template v-if="p.email">
              · {{ p.email }}
            </template>
          </div>
        </div>
        <UButton
          v-if="meeting.can_edit"
          icon="i-lucide-x"
          variant="ghost"
          color="neutral"
          size="xs"
          class="opacity-0 group-hover:opacity-100 focus:opacity-100"
          :aria-label="`Remove ${participantLabel(p)}`"
          @click="remove(p)"
        />
      </li>
      <li
        v-if="meeting.participants.length === 0"
        class="px-4 py-3 text-sm text-(--ui-text-muted)"
      >
        No participants yet.
      </li>
    </ul>

    <template
      v-if="meeting.can_edit"
      #footer
    >
      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <USelectMenu
            :model-value="undefined"
            :items="memberItems"
            value-key="id"
            label-key="label"
            placeholder="Add a team member"
            size="sm"
            :disabled="busy || memberItems.length === 0"
            :search-input="{ placeholder: 'Search…' }"
            class="flex-1 min-w-0"
            @update:model-value="addMember"
          />
          <UButton
            icon="i-lucide-user-plus"
            variant="outline"
            color="neutral"
            size="sm"
            :aria-pressed="guestOpen"
            @click="guestOpen = !guestOpen"
          >
            Guest
          </UButton>
        </div>
        <form
          v-if="guestOpen"
          class="space-y-2"
          @submit.prevent="addGuest"
        >
          <UInput
            v-model="guest.name"
            placeholder="Name"
            size="sm"
            class="w-full"
            autofocus
          />
          <UInput
            v-model="guest.email"
            type="email"
            placeholder="Email (optional)"
            size="sm"
            class="w-full"
          />
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              @click="guestOpen = false"
            >
              Cancel
            </UButton>
            <UButton
              type="submit"
              size="xs"
              :loading="busy"
              :disabled="!guest.name.trim()"
            >
              Add guest
            </UButton>
          </div>
        </form>
      </div>
    </template>
  </UCard>
</template>
