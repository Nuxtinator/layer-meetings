// Meetings layer — a meeting's recordings and files, pasted transcript,
// each participant's own notes, and the todos that came out of it.
export default defineNuxtConfig({
  // Live shared notes run over a WebSocket.
  nitro: {
    experimental: {
      websocket: true
    }
  },
  // Nuxt UI's editor loads tiptap unbundled; pre-bundling these would give the
  // shared-notes editor a second copy of ProseMirror.
  vite: {
    optimizeDeps: {
      exclude: ['@tiptap/core', '@tiptap/extension-collaboration', '@tiptap/y-tiptap']
    }
  }
})
