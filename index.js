/**
 * dsh-plugin-lol-mayhem — Cordis plugin entry.
 *
 * LOL 海克斯大乱斗（ARAM: Mayhem）QQ 助手：13 个工具，覆盖英雄攻略（Top6 海克斯 +
 * 机制说明 + 当前版本最强出装）、强化榜/强化档案、出装流派、三强化组合、英雄对比、
 * 梯队、整活黑马、模糊搜索、数据版本、在线刷新与 1080 宽图文卡片。
 * @module dsh-plugin-lol-mayhem
 */

import { loadDefineTool } from './lib/core.js'
import { createTools, TOOL_NAMES } from './lib/tools.js'
import { getStore } from './lib/store.js'

/** Cordis plugin name. */
export const name = 'dsh-plugin-lol-mayhem'

/** This plugin only requires the tool registry. */
export const inject = ['tools']

/** Every tool name registered by this plugin, in registration order. */
export { TOOL_NAMES }

/**
 * 模型可见的短提示：仅在用户问 LOL 海克斯大乱斗时引导模型调工具，
 * 避免模型凭记忆编造强化名/出装。
 */
const SYSTEM_HINT = [
  'LOL 海克斯大乱斗（ARAM: Mayhem，即「海克斯大乱斗 / ARAM Mayhem」）查询：',
  '用户问某英雄带什么海克斯强化、海克斯符文怎么选、出什么装、英雄强度、整活玩法、冷门黑马、三强化怎么搭配、两个英雄谁强时，',
  '必须调用 lol_champion（英雄攻略：Top6 强化+机制说明+最强出装）/ lol_augments / lol_augment / lol_build / lol_trio / lol_compare / lol_tier / lol_fun，',
  '拿不准名字先用 lol_search；数据版本不确定用 lol_meta；不要凭记忆编造强化名称、数值或出装；',
  '用户要「图 / 图文 / 卡片」时用 lol_card 生成 PNG，成功后调用 qqbot_send_file 发到当前 QQ 会话。',
].join('')

/** Register the optional system-prompt hint without failing plugin startup. */
function registerHint(ctx) {
  try {
    const service = typeof ctx.get === 'function' ? ctx.get('systemPrompt') : ctx.systemPrompt
    if (!service || typeof service.section !== 'function') return
    service.section({
      name: 'dsh-plugin-lol-mayhem',
      order: 900,
      text: SYSTEM_HINT,
    })
  } catch (error) {
    ctx.logger?.warn?.(`[dsh-plugin-lol-mayhem] 注册系统提示失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Cordis entry point: register every ARAM: Mayhem tool on the tool registry. */
export async function apply(ctx) {
  const store = getStore()
  for (const diagnostic of store.diagnostics) {
    ctx.logger?.warn?.(`[dsh-plugin-lol-mayhem] ${diagnostic}`)
  }

  const define = await loadDefineTool()
  const tools = createTools(define)
  for (const tool of tools) {
    ctx.tools.register(tool)
  }

  registerHint(ctx)
}
