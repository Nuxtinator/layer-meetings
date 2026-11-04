import { flushMeetingsDocuments } from '../utils/meetings-documents'

// Saves open shared-notes documents before the server shuts down.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('close', flushMeetingsDocuments)
})
