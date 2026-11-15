// Optional write/search tools. Not part of the default bundle layer: enable with
//   dsh --profile <name> --patch <this dir>/cordis.tools.patch.yml
import { defineTool } from '@deepseek-ai/dsh-tools'
import { makeTools } from './tools-def.js'

export const name = 'dsh-amh-memory-tools'
export const inject = ['tools']

/** @param {import('@deepseek-ai/cordis').Context} ctx */
export function apply(ctx) {
  for (const tool of makeTools(defineTool)) ctx.tools.register(tool)
}
