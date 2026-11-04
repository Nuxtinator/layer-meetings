// Live shared notes. Each open meeting document is a room held in memory on
// this server: a Yjs doc plus awareness (who is here, where their cursor is).
// Peers speak the y-websocket sync and awareness messages, plus two of our
// own: an auth message carrying a ticket, and a Markdown snapshot of the doc.
// Rooms persist to meetings_documents shortly after each change and when the
// last peer leaves.
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import type { Peer } from 'crossws'
import { sql } from 'kysely'
import { txScopeFor } from '#core/server/utils/after-commit'
import { signScopedToken, verifyScopedToken } from '#core/server/utils/auth'

export const MEETINGS_DOC_MESSAGE = { sync: 0, awareness: 1, snapshot: 2, auth: 3 } as const

const TICKET_SCOPE = 'meetings.document'
const AUTH_TIMEOUT_MS = 10_000
const PERSIST_DELAY_MS = 1500

export interface MeetingsDocTicket {
  userId: string
  orgId: string | null
  meetingId: string
  canEdit: boolean
}

// A short-lived credential for one meeting's document, issued by an
// authenticated HTTP request after its access checks.
export function signMeetingsDocTicket(t: MeetingsDocTicket): string {
  return signScopedToken({ ...t, email: null, display_name: '' }, TICKET_SCOPE, '2m')
}

function verifyMeetingsDocTicket(token: string): MeetingsDocTicket | null {
  const claims = verifyScopedToken(token, TICKET_SCOPE) as (Partial<MeetingsDocTicket> & { userId: string }) | null
  if (!claims || typeof claims.meetingId !== 'string') return null
  return { userId: claims.userId, orgId: claims.orgId ?? null, meetingId: claims.meetingId, canEdit: claims.canEdit === true }
}

interface Conn {
  peer: Peer
  userId: string
  canEdit: boolean
  // Awareness client ids this connection controls, removed when it leaves.
  clientIds: Set<number>
}

interface Room {
  key: string
  meetingId: string
  orgId: string | null
  doc: Y.Doc
  awareness: awarenessProtocol.Awareness
  conns: Map<string, Conn>
  loaded: Promise<void>
  markdown: string | null
  updatedBy: string | null
  dirty: boolean
  timer: ReturnType<typeof setTimeout> | null
}

const rooms = new Map<string, Room>()
const pending = new Map<string, { timer: ReturnType<typeof setTimeout> }>()
const connRoom = new Map<string, Room>()

function send(conn: Conn, data: Uint8Array) {
  try {
    conn.peer.send(data)
  } catch {
    // The peer's close hook cleans up.
  }
}

function roomFor(ticket: MeetingsDocTicket): Room {
  const key = `${ticket.orgId ?? '-'}:${ticket.meetingId}`
  const existing = rooms.get(key)
  if (existing) return existing

  const doc = new Y.Doc()
  const awareness = new awarenessProtocol.Awareness(doc)
  awareness.setLocalState(null)

  const room: Room = {
    key,
    meetingId: ticket.meetingId,
    orgId: ticket.orgId,
    doc,
    awareness,
    conns: new Map(),
    loaded: Promise.resolve(),
    markdown: null,
    updatedBy: null,
    dirty: false,
    timer: null
  }

  room.loaded = txScopeFor(ticket.orgId)(async (tx) => {
    const row = await tx.selectFrom('meetings_documents').select('ydoc').where('meeting_id', '=', ticket.meetingId).executeTakeFirst()
    if (row) Y.applyUpdate(doc, new Uint8Array(row.ydoc), 'load')
  })

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MEETINGS_DOC_MESSAGE.sync)
    syncProtocol.writeUpdate(encoder, update)
    const message = encoding.toUint8Array(encoder)
    for (const conn of room.conns.values()) {
      if (conn !== origin) send(conn, message)
    }
    if (origin !== 'load') {
      if (origin && typeof origin === 'object' && 'userId' in origin) room.updatedBy = (origin as Conn).userId
      schedulePersist(room)
    }
  })

  awareness.on('update', ({ added, updated, removed }: { added: number[], updated: number[], removed: number[] }, origin: unknown) => {
    const changed = [...added, ...updated, ...removed]
    if (origin && typeof origin === 'object' && 'clientIds' in origin) {
      const conn = origin as Conn
      for (const id of added) conn.clientIds.add(id)
      for (const id of removed) conn.clientIds.delete(id)
    }
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MEETINGS_DOC_MESSAGE.awareness)
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changed))
    const message = encoding.toUint8Array(encoder)
    for (const conn of room.conns.values()) send(conn, message)
  })

  rooms.set(key, room)
  return room
}

function schedulePersist(room: Room) {
  room.dirty = true
  if (room.timer) return
  room.timer = setTimeout(() => {
    room.timer = null
    persist(room).catch(e => console.error('[meetings] failed to save shared notes', room.meetingId, e))
  }, PERSIST_DELAY_MS)
}

async function persist(room: Room): Promise<void> {
  if (!room.dirty) return
  room.dirty = false
  const ydoc = Y.encodeStateAsUpdate(room.doc)
  const markdown = room.markdown
  await txScopeFor(room.orgId)(async (tx) => {
    await tx
      .insertInto('meetings_documents')
      .values({ meeting_id: room.meetingId, ydoc, body_md: markdown ?? '', updated_by: room.updatedBy })
      .onConflict(oc => oc.column('meeting_id').doUpdateSet({
        ydoc,
        body_md: markdown ?? sql<string>`meetings_documents.body_md`,
        updated_by: room.updatedBy,
        updated_at: sql`now()`
      }))
      .execute()
  })
}

async function closeRoomIfEmpty(room: Room) {
  if (room.conns.size > 0) return
  if (room.timer) {
    clearTimeout(room.timer)
    room.timer = null
  }
  try {
    await persist(room)
  } catch (e) {
    console.error('[meetings] failed to save shared notes', room.meetingId, e)
  }
  if (room.conns.size > 0 || rooms.get(room.key) !== room) return
  rooms.delete(room.key)
  room.awareness.destroy()
  room.doc.destroy()
}

export async function flushMeetingsDocuments(): Promise<void> {
  await Promise.all([...rooms.values()].map(async (room) => {
    if (room.timer) clearTimeout(room.timer)
    room.timer = null
    await persist(room).catch(e => console.error('[meetings] failed to save shared notes', room.meetingId, e))
  }))
}

export function openMeetingsDocPeer(peer: Peer) {
  // A peer that never authenticates is dropped.
  const timer = setTimeout(() => peer.close(4401, 'Unauthorized'), AUTH_TIMEOUT_MS)
  pending.set(peer.id, { timer })
}

async function authenticate(peer: Peer, token: string) {
  const waiting = pending.get(peer.id)
  if (!waiting) return
  clearTimeout(waiting.timer)
  pending.delete(peer.id)

  const ticket = verifyMeetingsDocTicket(token)
  if (!ticket) {
    peer.close(4401, 'Unauthorized')
    return
  }

  const room = roomFor(ticket)
  const conn: Conn = { peer, userId: ticket.userId, canEdit: ticket.canEdit, clientIds: new Set() }
  room.conns.set(peer.id, conn)
  connRoom.set(peer.id, room)

  try {
    await room.loaded
  } catch (e) {
    console.error('[meetings] failed to load shared notes', room.meetingId, e)
    peer.close(1011, 'Could not load the document')
    return
  }

  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MEETINGS_DOC_MESSAGE.sync)
  syncProtocol.writeSyncStep1(encoder, room.doc)
  send(conn, encoding.toUint8Array(encoder))

  const states = room.awareness.getStates()
  if (states.size > 0) {
    const aw = encoding.createEncoder()
    encoding.writeVarUint(aw, MEETINGS_DOC_MESSAGE.awareness)
    encoding.writeVarUint8Array(aw, awarenessProtocol.encodeAwarenessUpdate(room.awareness, [...states.keys()]))
    send(conn, encoding.toUint8Array(aw))
  }
}

export async function handleMeetingsDocMessage(peer: Peer, data: Uint8Array) {
  const decoder = decoding.createDecoder(data)
  const type = decoding.readVarUint(decoder)

  if (type === MEETINGS_DOC_MESSAGE.auth) {
    await authenticate(peer, decoding.readVarString(decoder))
    return
  }

  const room = connRoom.get(peer.id)
  const conn = room?.conns.get(peer.id)
  if (!room || !conn) return
  await room.loaded

  if (type === MEETINGS_DOC_MESSAGE.sync) {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MEETINGS_DOC_MESSAGE.sync)
    const syncType = decoding.readVarUint(decoder)
    if (syncType === syncProtocol.messageYjsSyncStep1) {
      syncProtocol.readSyncStep1(decoder, encoder, room.doc)
    } else if (conn.canEdit && syncType === syncProtocol.messageYjsSyncStep2) {
      syncProtocol.readSyncStep2(decoder, room.doc, conn)
    } else if (conn.canEdit && syncType === syncProtocol.messageYjsUpdate) {
      syncProtocol.readUpdate(decoder, room.doc, conn)
    }
    if (encoding.length(encoder) > 1) send(conn, encoding.toUint8Array(encoder))
  } else if (type === MEETINGS_DOC_MESSAGE.awareness) {
    awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), conn)
  } else if (type === MEETINGS_DOC_MESSAGE.snapshot && conn.canEdit) {
    room.markdown = decoding.readVarString(decoder).slice(0, 512 * 1024)
    room.updatedBy = conn.userId
    schedulePersist(room)
  }
}

export async function closeMeetingsDocPeer(peer: Peer) {
  const waiting = pending.get(peer.id)
  if (waiting) {
    clearTimeout(waiting.timer)
    pending.delete(peer.id)
  }
  const room = connRoom.get(peer.id)
  connRoom.delete(peer.id)
  const conn = room?.conns.get(peer.id)
  if (!room || !conn) return
  room.conns.delete(peer.id)
  awarenessProtocol.removeAwarenessStates(room.awareness, [...conn.clientIds], null)
  await closeRoomIfEmpty(room)
}
