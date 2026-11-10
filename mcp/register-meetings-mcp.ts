// Registers the meetings MCP tools with the MCP-layer registry. Added by
// modules/meetings-mcp.ts only when the MCP layer is loaded.
//
// Re-registers the meetings permissions first: the registry only accepts
// scopes already in the permission registry, and Nitro plugin order doesn't
// guarantee register-meetings.ts ran before this. registerPermissions is
// idempotent.
import { getRegistry, type McpToolDef } from '#mcp-layer'
import { registerPermissions } from '#core/server/utils/permissions-registry'
import { MEETINGS_PERMISSIONS, MEETINGS_PERMISSION_META } from '../app/utils/permissions'
import { meetingsMcpTools } from './meetings-tools'

export default defineNitroPlugin(() => {
  registerPermissions(MEETINGS_PERMISSIONS, MEETINGS_PERMISSION_META)

  const registry = getRegistry()
  for (const tool of meetingsMcpTools) {
    registry.register(tool as McpToolDef<unknown, unknown>)
  }
})
