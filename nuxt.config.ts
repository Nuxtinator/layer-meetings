// Meetings layer — a meeting's recordings and files, pasted transcript,
// each participant's own notes, and the todos that came out of it.
//
// The MCP tools in mcp/ are registered only when the MCP layer is loaded
// (modules/meetings-mcp.ts).
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  modules: [
    fileURLToPath(new URL('./modules/meetings-mcp.ts', import.meta.url))
  ],

  // Live shared notes run over a WebSocket.
  nitro: {
    experimental: {
      websocket: true
    },
    // Bundled rather than traced: lib0's package exports send bun to files the
    // node tracer doesn't copy. All four go together so there is one Yjs copy.
    externals: {
      inline: ['yjs', 'lib0', 'y-protocols', '@tiptap/y-tiptap']
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
