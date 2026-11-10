import { fileURLToPath } from 'node:url'
import type { Nuxt } from 'nuxt/schema'

// Registers the meetings MCP tools when the MCP layer is loaded too. They live
// outside `server/` so deploys without MCP never compile or typecheck their
// `#mcp-layer` import; with MCP they join the server tsconfig. Written without
// @nuxt/kit so it loads from a checkout that has no node_modules of its own.
export default function meetingsMcp(_options: unknown, nuxt: Nuxt) {
  if (!nuxt.options.alias['#mcp-layer']) return
  const mcpDir = fileURLToPath(new URL('../mcp', import.meta.url))
  nuxt.options.nitro.plugins = [...(nuxt.options.nitro.plugins ?? []), `${mcpDir}/register-meetings-mcp.ts`]
  nuxt.hook('nitro:config', (config) => {
    config.typescript ??= {}
    config.typescript.tsConfig ??= {}
    config.typescript.tsConfig.include = [...(config.typescript.tsConfig.include ?? []), `${mcpDir}/**/*`]
  })
}
