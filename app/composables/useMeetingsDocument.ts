// Client side of a meeting's live shared notes: a Yjs doc kept in sync with
// the document socket, plus awareness for presence and cursors. Reconnects
// with a fresh ticket after a drop.
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

const MESSAGE = { sync: 0, awareness: 1, snapshot: 2, auth: 3 } as const

const CURSOR_COLORS = ['#e5484d', '#f76b15', '#ffc53d', '#46a758', '#12a594', '#0090ff', '#8e4ec6', '#d6409f']

export interface MeetingsDocPeer {
  clientId: number
  name: string
  avatar: string
  color: string
}

function colorFor(id: string): string {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return CURSOR_COLORS[h % CURSOR_COLORS.length]!
}

export function useMeetingsDocument(meetingId: string) {
  const doc = new Y.Doc()
  const awareness = new awarenessProtocol.Awareness(doc)
  const status = ref<'connecting' | 'connected' | 'offline'>('connecting')
  const synced = ref(false)
  const canEdit = ref(false)
  const ready = ref(false)
  const peers = ref<MeetingsDocPeer[]>([])

  let ws: WebSocket | null = null
  let stopped = false
  let attempt = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let changedLocally = false

  // Marks remote changes so they aren't echoed back to the server.
  const provider = {}

  function sendMessage(build: (encoder: encoding.Encoder) => void) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const encoder = encoding.createEncoder()
    build(encoder)
    ws.send(encoding.toUint8Array(encoder))
  }

  function refreshPeers() {
    const list: MeetingsDocPeer[] = []
    awareness.getStates().forEach((state, clientId) => {
      if (clientId === doc.clientID || !state.user) return
      list.push({ clientId, name: state.user.name, avatar: state.user.avatar ?? '', color: state.user.color })
    })
    peers.value = list
  }

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === provider) return
    changedLocally = true
    sendMessage((e) => {
      encoding.writeVarUint(e, MESSAGE.sync)
      syncProtocol.writeUpdate(e, update)
    })
  })

  awareness.on('update', ({ added, updated, removed }: { added: number[], updated: number[], removed: number[] }, origin: unknown) => {
    refreshPeers()
    if (origin !== 'local') return
    const changed = [...added, ...updated, ...removed]
    sendMessage((e) => {
      encoding.writeVarUint(e, MESSAGE.awareness)
      encoding.writeVarUint8Array(e, awarenessProtocol.encodeAwarenessUpdate(awareness, changed))
    })
  })

  function onMessage(data: Uint8Array) {
    const decoder = decoding.createDecoder(data)
    const type = decoding.readVarUint(decoder)
    if (type === MESSAGE.sync) {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE.sync)
      const syncType = syncProtocol.readSyncMessage(decoder, encoder, doc, provider)
      if (syncType === syncProtocol.messageYjsSyncStep2) synced.value = true
      if (encoding.length(encoder) > 1) ws?.send(encoding.toUint8Array(encoder))
    } else if (type === MESSAGE.awareness) {
      awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), provider)
    }
  }

  function scheduleReconnect() {
    if (stopped || retryTimer) return
    const delay = Math.min(30_000, 1000 * 2 ** attempt++)
    retryTimer = setTimeout(() => {
      retryTimer = null
      connect()
    }, delay)
  }

  async function connect() {
    if (stopped) return
    status.value = 'connecting'
    let res: { ticket: string, can_edit: boolean, user: { id: string, display_name: string, avatar: string } }
    try {
      res = await $fetch(`/api/meetings/meetings/${meetingId}/document/ticket`, { method: 'POST' })
    } catch {
      status.value = 'offline'
      scheduleReconnect()
      return
    }
    if (stopped) return
    canEdit.value = res.can_edit
    awareness.setLocalStateField('user', { name: res.user.display_name, avatar: res.user.avatar, color: colorFor(res.user.id) })
    ready.value = true

    const url = new URL('/api/meetings/document-socket', window.location.href)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(url)
    socket.binaryType = 'arraybuffer'
    ws = socket

    socket.onopen = () => {
      attempt = 0
      status.value = 'connected'
      sendMessage((e) => {
        encoding.writeVarUint(e, MESSAGE.auth)
        encoding.writeVarString(e, res.ticket)
      })
      sendMessage((e) => {
        encoding.writeVarUint(e, MESSAGE.sync)
        syncProtocol.writeSyncStep1(e, doc)
      })
      sendMessage((e) => {
        encoding.writeVarUint(e, MESSAGE.awareness)
        encoding.writeVarUint8Array(e, awarenessProtocol.encodeAwarenessUpdate(awareness, [doc.clientID]))
      })
    }
    socket.onmessage = e => onMessage(new Uint8Array(e.data as ArrayBuffer))
    socket.onclose = () => {
      if (ws === socket) ws = null
      synced.value = false
      status.value = 'offline'
      const others = [...awareness.getStates().keys()].filter(id => id !== doc.clientID)
      awarenessProtocol.removeAwarenessStates(awareness, others, provider)
      scheduleReconnect()
    }
  }

  // Sends a Markdown copy of the doc for storage, only when this client
  // changed it, so every open editor doesn't upload the same snapshot.
  let snapshotTimer: ReturnType<typeof setTimeout> | null = null
  let latestMarkdown = ''
  function sendSnapshot() {
    if (!changedLocally) return
    changedLocally = false
    sendMessage((e) => {
      encoding.writeVarUint(e, MESSAGE.snapshot)
      encoding.writeVarString(e, latestMarkdown)
    })
  }
  function queueSnapshot(markdown: string) {
    if (!canEdit.value) return
    latestMarkdown = markdown
    if (snapshotTimer) clearTimeout(snapshotTimer)
    snapshotTimer = setTimeout(() => {
      snapshotTimer = null
      sendSnapshot()
    }, 2000)
  }

  function onPageHide() {
    awarenessProtocol.removeAwarenessStates(awareness, [doc.clientID], 'local')
  }

  onMounted(() => {
    window.addEventListener('pagehide', onPageHide)
    connect()
  })

  onBeforeUnmount(() => {
    stopped = true
    window.removeEventListener('pagehide', onPageHide)
    if (retryTimer) clearTimeout(retryTimer)
    if (snapshotTimer) {
      clearTimeout(snapshotTimer)
      sendSnapshot()
    }
    awarenessProtocol.removeAwarenessStates(awareness, [doc.clientID], 'local')
    ws?.close()
    awareness.destroy()
    doc.destroy()
  })

  return { doc, awareness, status, synced, canEdit, ready, peers, queueSnapshot }
}
