<script setup lang="ts">
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = defineProps<{ body: string | null }>()

const html = computed(() => {
  const md = props.body ?? ''
  if (!md.trim()) return ''
  let raw: string
  try {
    raw = marked.parse(md, { async: false, breaks: true, gfm: true }) as string
  } catch {
    raw = md
  }
  return DOMPurify.sanitize(raw)
})
</script>

<template>
  <div
    class="meetings-md"
    v-html="html"
  />
</template>

<style>
.meetings-md { font-size: 0.9375rem; line-height: 1.6; overflow-wrap: anywhere; }
.meetings-md p { margin: 0 0 0.5rem; }
.meetings-md p:last-child { margin-bottom: 0; }
.meetings-md ul, .meetings-md ol { padding-left: 1.25rem; margin: 0.25rem 0 0.5rem; }
.meetings-md ul { list-style: disc; }
.meetings-md ol { list-style: decimal; }
.meetings-md a { color: var(--ui-primary); text-decoration: underline; }
.meetings-md code { font-family: ui-monospace, monospace; font-size: 0.85em; background: var(--ui-bg-elevated); padding: 0.1em 0.3em; border-radius: 4px; }
.meetings-md pre { background: var(--ui-bg-elevated); padding: 0.75rem; border-radius: 6px; overflow-x: auto; margin: 0.5rem 0; }
.meetings-md pre code { background: none; padding: 0; }
.meetings-md blockquote { border-left: 3px solid var(--ui-border-accented); padding-left: 0.75rem; color: var(--ui-text-muted); margin: 0.5rem 0; }
.meetings-md h1, .meetings-md h2, .meetings-md h3 { font-weight: 600; margin: 0.75rem 0 0.25rem; }
.meetings-md img { max-width: 100%; border-radius: 6px; }
</style>
