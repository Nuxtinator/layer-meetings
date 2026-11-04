<script setup lang="ts">
// The meeting's shared notes, edited live by everyone who can edit the
// meeting, with each other's cursors. Others who can see the meeting watch
// it update read-only.
import type { EditorToolbarItem } from '@nuxt/ui'
import { Extension } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import { yCursorPlugin } from '@tiptap/y-tiptap'
import { useMeetingsDocument } from '../../composables/useMeetingsDocument'

const props = defineProps<{
  meetingId: string
}>()

const { doc, awareness, status, synced, canEdit, ready, peers, queueSnapshot } = useMeetingsDocument(props.meetingId)

const extensions = [
  Collaboration.configure({ document: doc }),
  Extension.create({
    name: 'meetingsCursors',
    addProseMirrorPlugins: () => [yCursorPlugin(awareness)]
  })
]

const toolbarItems: EditorToolbarItem[][] = [
  [
    { kind: 'heading', level: 2, icon: 'i-lucide-heading-2', tooltip: { text: 'Heading' } },
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: 'Bold' } },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: 'Italic' } }
  ],
  [
    { kind: 'bulletList', icon: 'i-lucide-list', tooltip: { text: 'Bullet list' } },
    { kind: 'orderedList', icon: 'i-lucide-list-ordered', tooltip: { text: 'Numbered list' } }
  ]
]

const statusLabel = computed(() => {
  if (status.value === 'connected') return synced.value ? 'Live' : 'Syncing…'
  if (status.value === 'connecting') return 'Connecting…'
  return 'Offline — reconnecting'
})

const statusColor = computed(() => status.value === 'connected' && synced.value ? 'bg-(--ui-success)' : status.value === 'offline' ? 'bg-(--ui-error)' : 'bg-(--ui-warning)')

function onMarkdown(value: unknown) {
  if (typeof value === 'string') queueSnapshot(value)
}
</script>

<template>
  <UCard
    class="flex flex-col h-[calc(100dvh-18rem)] min-h-96"
    :ui="{ body: 'p-0 sm:p-0 flex-1 min-h-0 flex flex-col' }"
  >
    <template #header>
      <div class="flex items-center gap-3 flex-wrap">
        <h2 class="font-semibold flex-1">
          Meeting notes
        </h2>
        <div
          v-if="peers.length"
          class="flex -space-x-1.5"
        >
          <UTooltip
            v-for="p in peers"
            :key="p.clientId"
            :text="`${p.name} is here`"
          >
            <UAvatar
              :src="p.avatar || undefined"
              :alt="p.name"
              size="2xs"
              class="ring-2"
              :style="{ '--tw-ring-color': p.color }"
            />
          </UTooltip>
        </div>
        <span class="inline-flex items-center gap-1.5 text-xs text-(--ui-text-muted)">
          <span
            class="size-1.5 rounded-full"
            :class="statusColor"
            aria-hidden="true"
          />
          {{ statusLabel }}
        </span>
        <UBadge
          v-if="ready && !canEdit"
          color="neutral"
          variant="subtle"
          size="sm"
        >
          View only
        </UBadge>
        <InfoTip text="Everyone who can edit this meeting writes here together and sees each other's changes as they type." />
      </div>
    </template>

    <div
      v-if="!ready"
      class="px-6 py-10 text-center text-sm text-(--ui-text-muted)"
    >
      Connecting…
    </div>
    <UEditor
      v-else
      v-slot="{ editor }"
      content-type="markdown"
      :starter-kit="{ undoRedo: false }"
      :extensions="extensions"
      :editable="canEdit"
      :image="false"
      :mention="false"
      placeholder="Shared notes for everyone in the meeting…"
      class="flex-1 min-h-0 flex flex-col meetings-team-notes"
      :ui="{ content: 'min-h-0 overflow-y-auto', base: 'px-4 py-3 sm:px-6 min-h-full' }"
      @update:model-value="onMarkdown"
    >
      <UEditorToolbar
        v-if="canEdit"
        :editor="editor"
        :items="toolbarItems"
        class="shrink-0 border-b border-(--ui-border) px-2 py-1 overflow-x-auto"
      />
    </UEditor>
  </UCard>
</template>

<style>
.meetings-team-notes .ProseMirror-yjs-cursor {
  position: relative;
  margin-left: -1px;
  margin-right: -1px;
  border-left: 1px solid;
  border-right: 1px solid;
  word-break: normal;
  pointer-events: none;
}
.meetings-team-notes .ProseMirror-yjs-cursor > div {
  position: absolute;
  top: -1.4em;
  left: -1px;
  font-size: 0.7rem;
  font-weight: 600;
  line-height: normal;
  white-space: nowrap;
  color: #fff;
  padding: 0.05rem 0.3rem;
  border-radius: 3px 3px 3px 0;
  user-select: none;
}
</style>
