/**
 * dsh-plugin-lol-mayhem / tools
 *
 * 11 个面向 QQ 对话的查询工具：英雄攻略（Top6 强化+机制+出装）、强化榜、
 * 单个强化、出装流派、梯队、整活黑马、模糊搜索、数据版本、在线刷新、图文卡。
 * 全部只读本地快照（在线刷新除外），不编造数据。
 * @module dsh-plugin-lol-mayhem/tools
 */

import path from 'node:path'
import { text, guardTool, requireString, optionalString, optionalInt } from './core.js'
import { getStore, pct1 } from './store.js'
import {
  renderHelp,
  renderChampion,
  renderAugmentRanking,
  renderAugmentDetail,
  renderBuild,
  renderTierList,
  renderOffMeta,
  renderSearch,
  renderMeta,
  renderMiss,
  renderTrios,
  renderCompare,
} from './render.js'
import { renderCard } from './cards.js'
import { championCard, augmentCard, augmentRankingCard, tierCard, funCard, metaCard, trioCard } from './cardview.js'
import { refreshChampion, refreshLibrary } from './live.js'

/** 单条 QQ 消息长度提示。 */
const QQ_NOTE = '返回纯文本，已控制在 QQ 单条消息长度内；需要图片版时再调用 lol_card。'
const CARD_NOTE = '已生成 PNG 卡片。输出里含图片绝对路径，随后必须调用 qqbot_send_file 把该文件发送到当前 QQ 会话。'

/** 统一输出结构：{ text }。 */
function output() {
  return {
    schema: {
      type: 'object',
      properties: { text: { type: 'string', description: '给用户看的最终中文文本' } },
      required: ['text'],
      additionalProperties: false,
    },
    render: (_args, value) => [text(String(value?.text ?? ''))],
  }
}

const out = (value) => ({ text: String(value ?? '') })

function store() {
  return getStore()
}

/** 缺数据时的统一提示。 */
function missingData() {
  return '插件还没加载到海克斯大乱斗数据快照。请在插件目录运行 `npm run crawl`（或说「刷新数据」在线更新）后重试。'
}

/** 解析英雄参数；找不到时返回 undefined。 */
function lookupChampion(args) {
  const name = optionalString(args, 'name')
  if (!name) return { query: '', champion: undefined }
  return { query: name, champion: store().findChampion(name) }
}

function championsIn(query, limit = 5) {
  const s = store()
  const rows = []
  // 先走完整解析器（含社区绰号、英文名、称号），命中就放第一。
  const direct = s.findChampion(query)
  if (direct) rows.push(direct)
  for (const champion of s.champions) {
    if (rows.length >= limit) break
    if (rows.some((row) => row.id === champion.id)) continue
    const hay = [champion.name, champion.displayName, champion.cnName, champion.en, champion.cnTitle].filter(Boolean).join(' ')
    if (hay.includes(query)) rows.push(champion)
  }
  return rows
}

function augmentsIn(query, limit = 5) {
  const s = store()
  const rows = []
  for (const augment of s.augmentById.values()) {
    if (String(augment.name ?? '').includes(query)) rows.push(augment)
    if (rows.length >= limit) break
  }
  return rows
}

/** 构建工具定义列表。 */
export function createTools(defineTool) {
  const define = defineTool

  const help = define({
    name: 'lol_help',
    description: `LOL 海克斯大乱斗（ARAM: Mayhem）助手菜单：说明能查什么、怎么问、有哪些工具。用户发「帮助/菜单/你能干什么/怎么用」或第一次提问时调用。${QQ_NOTE}`,
    parameters: {},
    output: output(),
    execute: guardTool('lol_help', async () => out(renderHelp())),
  })

  const champion = define({
    name: 'lol_champion',
    description:
      '查询某个英雄在海克斯大乱斗（ARAM: Mayhem）当前版本的最强攻略：海克斯强化 Top6（每条含机制/功能简介与胜率选取率）、当前版本最强出装（核心三件套/起始装/技能加点/召唤师技能）。' +
      `用户问「XX 带什么海克斯/XX 怎么出装/XX 怎么玩/XX 攻略」时调用。name 支持中文名、称号、英文名、社区绰号（瞎子/狐狸/电耗子）。${QQ_NOTE}`,
    parameters: {
      name: { type: 'string', required: true, description: '英雄名称，如「提莫」「亚索」「阿狸」「盲僧」' },
      limit: { type: 'number', description: '强化条数，默认 6（按需求取前 6）', default: 6 },
    },
    output: output(),
    execute: guardTool('lol_champion', async (args) => {
      const s = store()
      if (!s.snapshot) return out(missingData())
      const { query, champion: hit } = lookupChampion(args)
      if (!hit) return out(renderMiss(s, query, { champion: true }))
      return out(renderChampion(s, hit, { limit: optionalInt(args, 'limit', 6, 1, 12) }))
    }),
  })

  const augments = define({
    name: 'lol_augments',
    description:
      '查询海克斯强化榜单。传 name 时返回该英雄的强化排行（含机制简介）；不传 name 时返回全服强化强度榜，可用 rarity 过滤白银/黄金/棱彩。' +
      `用户问「海克斯排行/全服最强强化/棱彩强化有哪些」时调用。${QQ_NOTE}`,
    parameters: {
      name: { type: 'string', description: '可选：英雄名称，返回该英雄的强化榜' },
      rarity: { type: 'string', enum: ['silver', 'gold', 'prismatic'], description: '可选：稀有度过滤器（仅全服榜生效）' },
      limit: { type: 'number', description: '返回条数，默认 10', default: 10 },
    },
    output: output(),
    execute: guardTool('lol_augments', async (args) => {
      const s = store()
      if (!s.snapshot) return out(missingData())
      const name = optionalString(args, 'name')
      if (name) {
        const hit = s.findChampion(name)
        if (!hit) return out(renderMiss(s, name, { champion: true }))
        return out(renderAugmentRanking(s, hit, { limit: optionalInt(args, 'limit', 10, 1, 20) }))
      }
      const rarity = optionalString(args, 'rarity')
      return out(renderAugmentRanking(s, undefined, { rarity, limit: optionalInt(args, 'limit', 10, 1, 20) }))
    }),
  })

  const augment = define({
    name: 'lol_augment',
    description:
      '查询单个海克斯强化的完整档案：效果机制原文、稀有度、梯度、全服胜率/选取率、适配英雄、在哪些英雄榜上排名靠前。' +
      `用户问「XX 强化是什么/XX 海克斯效果」时调用。${QQ_NOTE}`,
    parameters: {
      name: { type: 'string', required: true, description: '强化名称，如「缩小引擎」「小蜜蜂」「循环往复」' },
    },
    output: output(),
    execute: guardTool('lol_augment', async (args) => {
      const s = store()
      if (!s.snapshot) return out(missingData())
      const query = requireString(args, 'name', '强化名称')
      const hit = s.findAugment(query)
      if (!hit) return out(renderMiss(s, query, { augment: true }))
      const owners = []
      for (const entry of s.champions) {
        const found = (entry.augments ?? []).find((row) => Number(row.id) === Number(hit.id))
        if (found) owners.push({ name: entry.name, rank: found.rank, winRate: found.winRate })
      }
      owners.sort((a, b) => Number(a.rank ?? 99) - Number(b.rank ?? 99))
      return out(renderAugmentDetail(s, { ...hit, owners }))
    }),
  })

  const build = define({
    name: 'lol_build',
    description:
      '查询某个英雄在海克斯大乱斗的当前版本出装：按流派（如暴击/特效/AP）列出核心装备组合、组合胜率与选取率，并给出综合最强组合。' +
      `用户问「XX 出什么装/XX 出装/XX 怎么出」时调用。${QQ_NOTE}`,
    parameters: {
      name: { type: 'string', required: true, description: '英雄名称' },
      tag: { type: 'string', description: '可选：只看某流派标签，如「暴击」「特效」「AP」' },
    },
    output: output(),
    execute: guardTool('lol_build', async (args) => {
      const s = store()
      if (!s.snapshot) return out(missingData())
      const { query, champion: hit } = lookupChampion(args)
      if (!hit) return out(renderMiss(s, query, { champion: true }))
      return out(renderBuild(s, hit, { tags: optionalString(args, 'tag') }))
    }),
  })

  const tier = define({
    name: 'lol_tier',
    description:
      '查询海克斯大乱斗英雄强度榜。不传 tier 返回 T1–T3 概览；传 tier=T1..T5 返回该梯队完整名单与推荐强化。' +
      `用户问「英雄强度榜/哪个英雄强/T1 有哪些」时调用。${QQ_NOTE}`,
    parameters: {
      tier: { type: 'string', enum: ['T1', 'T2', 'T3', 'T4', 'T5'], description: '可选：只查某个梯队' },
      limit: { type: 'number', description: '每档返回条数，默认 15', default: 15 },
    },
    output: output(),
    execute: guardTool('lol_tier', async (args) => {
      const s = store()
      if (!s.snapshot) return out(missingData())
      return out(renderTierList(s, { tier: optionalString(args, 'tier'), limit: optionalInt(args, 'limit', 15, 1, 30) }))
    }),
  })

  const fun = define({
    name: 'lol_fun',
    description:
      '整活/黑马推荐：传 name 返回该英雄胜率明显高于自身基线、但选取率不高的「黑马海克斯」；不传 name 返回全服冷门高胜率英雄。' +
      `用户问「有什么整活玩法/冷门强化的/花活」时调用。${QQ_NOTE}`,
    parameters: {
      name: { type: 'string', description: '可选：英雄名称' },
    },
    output: output(),
    execute: guardTool('lol_fun', async (args) => {
      const s = store()
      if (!s.snapshot) return out(missingData())
      const { query, champion: hit } = lookupChampion(args)
      if (query && !hit) return out(renderMiss(s, query, { champion: true }))
      return out(renderOffMeta(s, hit))
    }),
  })

  const search = define({
    name: 'lol_search',
    description:
      '在英雄与海克斯强化里模糊搜索，返回命中列表与下一步建议。用户给的名字/关键词不确定属于英雄还是强化时先调用（如「电耗子」「那个缩小」「小蜜蜂」）。',
    parameters: {
      query: { type: 'string', required: true, description: '关键词或名称' },
    },
    output: output(),
    execute: guardTool('lol_search', async (args) => {
      const s = store()
      if (!s.snapshot) return out(missingData())
      const query = requireString(args, 'query', '搜索关键词')
      return out(renderSearch(s, query, { champions: championsIn(query), augments: augmentsIn(query) }))
    }),
  })

  const meta = define({
    name: 'lol_meta',
    description: `查看当前数据快照的版本、来源、覆盖英雄/强化数量、抓取时间与诊断信息。用户问「数据是最新的吗/版本多少」时调用。${QQ_NOTE}`,
    parameters: {},
    output: output(),
    execute: guardTool('lol_meta', async () => out(renderMeta(store()))),
  })

  const trio = define({
    name: 'lol_trio',
    description:
      '查询某个英雄的「三强化组合」：同一局游戏能凑齐的三个海克斯强化套装，按组合胜率排序，并给出样本局数。' +
      `用户问「XX 三个海克斯怎么凑/同局选哪三个强化/强化搭配」时调用。${QQ_NOTE}`,
    parameters: {
      name: { type: 'string', required: true, description: '英雄名称' },
      limit: { type: 'number', description: '组合条数，默认 6', default: 6 },
    },
    output: output(),
    execute: guardTool('lol_trio', async (args) => {
      const s = store()
      if (!s.snapshot) return out(missingData())
      const { query, champion: hit } = lookupChampion(args)
      if (!hit) return out(renderMiss(s, query, { champion: true }))
      return out(renderTrios(s, hit, { limit: optionalInt(args, 'limit', 6, 1, 10) }))
    }),
  })

  const compare = define({
    name: 'lol_compare',
    description:
      '对比两个英雄的海克斯大乱斗强度：梯度/全服排名/胜率/选取率、各自 Top3 强化与最强出装，并给出结论。' +
      `用户问「XX 和 YY 哪个强/该玩谁/对比」时调用。first、second 都传英雄名。${QQ_NOTE}`,
    parameters: {
      first: { type: 'string', required: true, description: '第一个英雄名' },
      second: { type: 'string', required: true, description: '第二个英雄名' },
    },
    output: output(),
    execute: guardTool('lol_compare', async (args) => {
      const s = store()
      if (!s.snapshot) return out(missingData())
      const a = requireString(args, 'first', '第一个英雄')
      const b = requireString(args, 'second', '第二个英雄')
      const first = s.findChampion(a)
      const second = s.findChampion(b)
      if (!first) return out(renderMiss(s, a, { champion: true }))
      if (!second) return out(renderMiss(s, b, { champion: true }))
      return out(renderCompare(s, first, second))
    }),
  })

  const update = define({
    name: 'lol_update',
    description:
      '在线刷新数据：传 name 只刷新该英雄（走 aramgg 官方客户端 JSON API，含强化榜与出装，几秒内完成）；不传 name 刷新全站强化字典+物品+召唤师技能。' +
      '只在用户明确要求更新、或数据明显过期时调用。',
    parameters: {
      name: { type: 'string', description: '可选：只刷新这个英雄' },
    },
    output: output(),
    execute: guardTool('lol_update', async (args) => {
      const s = store()
      const name = optionalString(args, 'name')
      if (name) {
        const hit = s.findChampion(name)
        if (!hit) return out(renderMiss(s, name, { champion: true }))
        try {
          const result = await refreshChampion(hit)
          return out(
            `✅ 已在线刷新 ${result.name ?? hit.name}：强化 ${result.augments} 条、出装 ${result.builds} 个流派。\n` +
              `缓存文件：${result.file}\n现在可以直接问「${hit.name} 攻略」或调 lol_champion。`,
          )
        } catch (error) {
          return out(`⚠️ 在线刷新失败：${error instanceof Error ? error.message : String(error)}`)
        }
      }
      try {
        const result = await refreshLibrary()
        return out(`✅ 已在线刷新强化字典：${result.count} 条强化数据（含物品 ${result.items ?? 0} 件、召唤师技能 ${result.spells ?? 0} 个）。\n缓存文件：${result.file}`)
      } catch (error) {
        return out(`⚠️ 在线刷新失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }),
  })

  const card = define({
    name: 'lol_card',
    description:
      '把查询结果渲染成一张 1080 宽深色 PNG 图文卡片（QQ 里比长文本更好看）。kind 选择卡片类型：champion=英雄攻略（Top6 强化+出装+三强化组合）、trio=三强化组合、augment=单个强化档案、augments=强化榜、tier=英雄梯队、fun=整活黑马、meta=数据状态。' +
      `成功后必须调用 qqbot_send_file 发送返回的图片路径。${CARD_NOTE}`,
    parameters: {
      kind: {
        type: 'string',
        required: true,
        enum: ['champion', 'trio', 'augment', 'augments', 'tier', 'fun', 'meta'],
        description: '卡片类型',
      },
      name: { type: 'string', description: '英雄名或强化名（kind=champion/augment/augments/fun 需要）' },
      rarity: { type: 'string', enum: ['silver', 'gold', 'prismatic'], description: '可选：kind=augments 且无 name 时的稀有度过滤' },
      tier: { type: 'string', enum: ['T1', 'T2', 'T3', 'T4', 'T5'], description: '可选：kind=tier 时指定梯队' },
    },
    output: output(),
    execute: guardTool('lol_card', async (args) => {
      const s = store()
      if (!s.snapshot) return out(missingData())
      const kind = requireString(args, 'kind', '卡片类型')
      const name = optionalString(args, 'name')
      let spec
      let label
      if (kind === 'champion') {
        const hit = name ? s.findChampion(name) : undefined
        if (!hit) return out(renderMiss(s, name ?? '', { champion: true }))
        spec = championCard(s, hit)
        label = `${hit.name} 攻略卡`
      } else if (kind === 'trio') {
        const hit = name ? s.findChampion(name) : undefined
        if (!hit) return out(renderMiss(s, name ?? '', { champion: true }))
        spec = trioCard(s, hit)
        label = `${hit.name} 三强化组合`
      } else if (kind === 'augment') {
        const hit = name ? s.findAugment(name) : undefined
        if (!hit) return out(renderMiss(s, name ?? '', { augment: true }))
        const owners = []
        for (const entry of s.champions) {
          const found = (entry.augments ?? []).find((row) => Number(row.id) === Number(hit.id))
          if (found) owners.push({ name: entry.name, rank: found.rank, winRate: found.winRate })
        }
        owners.sort((a, b) => Number(a.rank ?? 99) - Number(b.rank ?? 99))
        spec = augmentCard(s, hit, owners)
        label = `${hit.name} 强化卡`
      } else if (kind === 'augments') {
        const hit = name ? s.findChampion(name) : undefined
        if (name && !hit) return out(renderMiss(s, name, { champion: true }))
        spec = augmentRankingCard(s, hit, { rarity: optionalString(args, 'rarity'), limit: 8 })
        label = hit ? `${hit.name} 强化榜` : '强化强度榜'
      } else if (kind === 'tier') {
        spec = tierCard(s, { tier: optionalString(args, 'tier'), limit: 10 })
        label = '英雄梯队卡'
      } else if (kind === 'fun') {
        const hit = name ? s.findChampion(name) : undefined
        if (name && !hit) return out(renderMiss(s, name, { champion: true }))
        spec = funCard(s, hit)
        label = '整活黑马卡'
      } else if (kind === 'meta') {
        spec = metaCard(s)
        label = '数据状态卡'
      } else {
        return out(`未知卡片类型「${kind}」。可用：champion / augment / augments / tier / fun / meta`)
      }

      try {
        const image = await renderCard(spec)
        return out(
          `${label}已生成：${image.width}×${image.height}，${(image.bytes / 1024).toFixed(1)} KB\n${image.path}\n` +
            '请立即用 qqbot_send_file 发送这张图片到当前 QQ 会话。',
        )
      } catch (error) {
        const hit = name ? s.findChampion(name) : undefined
        let fallback
        if (kind === 'champion') fallback = renderChampion(s, hit, { limit: 6 })
        else if (kind === 'trio') fallback = hit ? renderTrios(s, hit, { limit: 6 }) : undefined
        else if (kind === 'augments') fallback = renderAugmentRanking(s, hit, { rarity: optionalString(args, 'rarity'), limit: 10 })
        else if (kind === 'augment') fallback = hit ? renderAugmentDetail(s, s.findAugment(name ?? '')) : undefined
        else if (kind === 'tier') fallback = renderTierList(s, { tier: optionalString(args, 'tier'), limit: 15 })
        else if (kind === 'fun') fallback = renderOffMeta(s, hit)
        else fallback = renderMeta(s)
        return out(`⚠️ 卡片渲染失败：${error instanceof Error ? error.message : String(error)}\n\n${fallback ?? '（图片渲染失败，无文字兜底）'}`)
      }
    }),
  })

  return [help, champion, augments, augment, build, trio, compare, tier, fun, search, meta, update, card]
}

/** 供日志/诊断使用。 */
export const TOOL_NAMES = Object.freeze([
  'lol_help',
  'lol_champion',
  'lol_augments',
  'lol_augment',
  'lol_build',
  'lol_trio',
  'lol_compare',
  'lol_tier',
  'lol_fun',
  'lol_search',
  'lol_meta',
  'lol_update',
  'lol_card',
])
