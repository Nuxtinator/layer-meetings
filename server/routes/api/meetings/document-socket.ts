// WebSocket for live shared notes. The first message must be an auth message
// carrying a ticket from POST /api/meetings/meetings/:id/document/ticket.
import { closeMeetingsDocPeer, handleMeetingsDocMessage, openMeetingsDocPeer } from '../../../utils/meetings-documents'

export default defineWebSocketHandler({
  open(peer) {
    openMeetingsDocPeer(peer)
  },
  async message(peer, message) {
    try {
      await handleMeetingsDocMessage(peer, message.uint8Array())
    } catch (e) {
      console.error('[meetings] bad document message', e)
      peer.close(1003, 'Bad message')
    }
  },
  async close(peer) {
    await closeMeetingsDocPeer(peer)
  }
})
