/**
 * dsh-plugin-lol-mayhem / render
 *
 * 把快照数据渲染成适合 QQ 消息的短文本（纯文本 + 少量 emoji，避免 Markdown 表格）。
 * @module dsh-plugin-lol-mayhem/render
 */

import { pct, pct1, RARITY_LABEL } from './store.js'

/** 控制单条消息长度，超长时截断并提示卡片。 */
export function fit(value, max = 1150) {
  const str = String(value ?? '').trim()
  if (str.length <= max) return str
  return `${str.slice(0, max - 24).trimEnd()}\n…（内容较长，可用 lol_card 出图查看）`
}

function tierLabel(tier) {
  return tier ? String(tier).toUpperCase() : '—'
}

function augmentLine(entry, index) {
  const rarity = entry.rarityLabel ?? RARITY_LABEL[entry.rarity ?? 'gold'] ?? ''
  const head = `${index + 1}. ${entry.name}（${rarity}${entry.tier ? `·${tierLabel(entry.tier)}` : ''}）胜率${pct1(entry.winRate)} 选取${pct1(entry.pickRate)}`
  const desc = String(entry.description ?? '').trim()
  return desc ? `${head}\n   ↳ ${desc}` : head
}

function comboLine(combo, label) {
  if (!combo || !Array.isArray(combo.items) || combo.items.length === 0) return `${label}：暂无数据`
  const tags = (combo.tags ?? []).filter(Boolean)
  const tagText = tags.length > 0 ? `[${tags.join('/')}] ` : ''
  return `${label}：${tagText}${combo.items.join(' → ')}（胜率${pct1(combo.winRate)} 选取${pct1(combo.pickRate)}）`
}

function championHeader(champion) {
  const rank = Number.isFinite(Number(champion.rank)) ? `全服第${champion.rank}名` : ''
  const name = champion.title ? `${champion.title} ${champion.name}` : champion.name
  return `🏆 ${name}｜${tierLabel(champion.tier)}${rank ? ` ${rank}` : ''}\n胜率 ${pct(champion.winRate)}｜选取率 ${pct(champion.pickRate)}`
}

function trioLine(trio, index) {
  const names = (trio.names ?? []).filter(Boolean)
  if (names.length === 0) return `${index + 1}. ${(trio.ids ?? []).join(' + ')}`
  const sample = Number.isFinite(Number(trio.games)) ? `，${trio.games} 局样本` : ''
  return `${index + 1}. ${names.join(' + ')}｜胜率 ${pct1(trio.winRate)}${sample}`
}

function footer(store, extra = '') {
  const meta = store.meta()
  const parts = [`数据：aramgg.com（海克斯大乱斗 ${meta.patch ? `Patch ${meta.patch}` : '当前版本'}）`]
  if (extra) parts.push(extra)
  parts.push('样本为全服统计，非对局内实时推荐')
  return parts.join('｜')
}

export function renderHelp() {
  return [
    '🎮 海克斯大乱斗助手（LOL ARAM: Mayhem）',
    '',
    '查英雄：给我英雄名就行 ——「提莫」「亚索海克斯」「盲僧出装」',
    '常用指令：',
    '· 英雄攻略：lol_champion（Top6 海克斯 + 机制说明 + 最强出装 + 三强化组合）',
    '· 强化排行榜：lol_augments（可查某英雄，或全服强化强度）',
    '· 单个强化：lol_augment「缩小引擎」',
    '· 出装流派：lol_build「阿狸」',
    '· 三强化组合：lol_trio「提莫」',
    '· 英雄对比：lol_compare「提莫 亚索」',
    '· 英雄强度榜：lol_tier（T1~T5）',
    '· 整活黑马：lol_fun（冷门高胜率强化）',
    '· 模糊搜索：lol_search「电耗子」',
    '· 图文卡片：lol_card（出 PNG，再发到 QQ）',
    '· 数据版本：lol_meta',
    '',
    '直接问「XX 怎么玩/带什么海克斯/出什么装」也会自动走对应工具。',
  ].join('\n')
}

/** 单英雄完整攻略：强化 Top6（含机制）+ 出装 + 技能/召唤师 + 三强化组合。 */
export function renderChampion(store, champion, { limit = 6 } = {}) {
  const augments = store.topAugments(champion, limit)
  const build = store.bestBuild(champion)
  const lines = [championHeader(champion), '']

  lines.push(`✨ 海克斯强化 Top${augments.length}`)
  if (augments.length === 0) lines.push('暂无该英雄的强化统计')
  augments.forEach((entry, index) => lines.push(augmentLine(entry, index)))

  lines.push('')
  lines.push('🛠 出装推荐')
  lines.push(comboLine(build.strongest, '最强组合'))
  if (build.mostPopular && build.mostPopular !== build.strongest) {
    lines.push(comboLine(build.mostPopular, '最热门组合'))
  }
  const extraCombos = build.combos.filter((combo) => combo !== build.strongest && combo !== build.mostPopular).slice(0, 2)
  for (const combo of extraCombos) lines.push(comboLine(combo, '备选'))

  const extras = []
  const firstItem = champion.firstItem ?? champion.startItems?.[0]
  if (firstItem) extras.push(`首件核心：${firstItem}`)
  if (champion.skillOrder?.length) extras.push(`技能加点：${champion.skillOrder.join(' > ')}`)
  if (champion.summoners?.length) extras.push(`召唤师技能：${champion.summoners.join(' / ')}`)
  if (extras.length > 0) {
    lines.push('')
    lines.push(`📌 ${extras.join('｜')}`)
  }

  const trios = store.trioList(champion, 3)
  if (trios.length > 0) {
    lines.push('')
    lines.push('🧩 三强化组合（同一局能凑齐的套装）')
    trios.forEach((trio, index) => lines.push(trioLine(trio, index)))
  }

  lines.push('')
  lines.push(footer(store))
  lines.push('（想要图片版：lol_card champion）')
  return fit(lines.join('\n'), 1700)
}

/** 某英雄的强化排行榜，或全服强化强度榜。 */
export function renderAugmentRanking(store, champion, { rarity, limit = 10 } = {}) {
  if (champion) {
    const rows = store.topAugments(champion, limit)
    const lines = [`${champion.name} 的强化排行（按该英雄适配排名）`, '']
    if (rows.length === 0) lines.push('暂无数据')
    rows.forEach((entry, index) => lines.push(augmentLine(entry, index)))
    lines.push('', footer(store))
    return fit(lines.join('\n'), 1700)
  }
  const rows = store.globalAugmentRanking({ rarity, limit })
  const rarityText = rarity ? `${RARITY_LABEL[rarity] ?? rarity}强化` : '全部强化'
  const lines = [`📈 全服强化强度榜（${rarityText}·按胜率）`, '']
  if (rows.length === 0) lines.push('暂无数据')
  rows.forEach((entry, index) => {
    const rarityLabel = entry.rarityLabel ?? RARITY_LABEL[entry.rarity] ?? ''
    lines.push(`${index + 1}. ${entry.name}（${rarityLabel}）胜率${pct1(entry.winRate)} 选取${pct1(entry.pickRate)}`)
  })
  lines.push('', '想看某英雄带什么强化，直接说英雄名。', footer(store))
  return fit(lines.join('\n'), 1500)
}

/** 单个强化详解：效果、稀有度、全服胜率、适配英雄。 */
export function renderAugmentDetail(store, augment) {
  const rarityLabel = augment.rarityLabel ?? RARITY_LABEL[augment.rarity] ?? ''
  const lines = [
    `💠 ${augment.name}（${rarityLabel}）`,
    '',
    `效果：${augment.description || '暂无效果说明'}`,
  ]
  if (augment.winRate !== undefined && augment.winRate !== null) lines.push(`全服胜率：${pct(augment.winRate)}（全服选取 ${pct(augment.pickRate)}）`)
  const owners = []
  for (const champion of store.champions) {
    const hit = (champion.augments ?? []).find((entry) => Number(entry.id) === Number(augment.id))
    if (hit) owners.push({ name: champion.name, rank: hit.rank, winRate: hit.winRate })
  }
  owners.sort((a, b) => Number(a.rank ?? 99) - Number(b.rank ?? 99))
  if (Array.isArray(augment.topChampions) && augment.topChampions.length > 0) {
    lines.push(`官方适配英雄：${augment.topChampions.map((entry) => entry.name).filter(Boolean).join('、')}`)
  }
  if (owners.length > 0) {
    lines.push('', '该强化在这些英雄的榜上排名靠前：')
    for (const owner of owners.slice(0, 6)) {
      lines.push(`· ${owner.name} 第${owner.rank}位（胜率${pct1(owner.winRate)}）`)
    }
  }
  lines.push('', footer(store))
  return fit(lines.join('\n'), 1500)
}

/** 出装流派明细。 */
export function renderBuild(store, champion, { tags } = {}) {
  const build = store.bestBuild(champion)
  const lines = [championHeader(champion), '', '🛠 出装方案']
  const builds = tags
    ? build.builds.filter((entry) => (entry.tags ?? []).some((tag) => String(tag).toLowerCase().includes(tags.toLowerCase())))
    : build.builds
  if (builds.length === 0) lines.push(`没有匹配「${tags}」的流派，可用标签：${build.builds.map((entry) => (entry.tags ?? []).join('/')).filter(Boolean).join('、') || '暂无'}`)
  for (const entry of builds) {
    const tagText = (entry.tags ?? []).filter(Boolean).join(' / ') || '默认流派'
    lines.push('')
    lines.push(`【${tagText}】流派胜率${pct1(entry.winRate)} 选取${pct1(entry.pickRate)}`)
    ;(entry.combos ?? []).forEach((combo, index) => {
      lines.push(`  #${index + 1} ${(combo.items ?? []).join(' → ')}｜胜率${pct1(combo.winRate)} 选取${pct1(combo.pickRate)}`)
    })
  }
  lines.push('', comboLine(build.strongest, '👉 综合最强'))
  if (champion.summoners?.length) lines.push(`召唤师技能：${champion.summoners.join(' / ')}`)
  lines.push('', footer(store))
  return fit(lines.join('\n'), 1700)
}

/** 三强化组合：同一局能凑齐的三个海克斯，胜率最高的组合。 */
export function renderTrios(store, champion, { limit = 6 } = {}) {
  const trios = store.trioList(champion, limit)
  const lines = [`🧩 ${champion.name} 的三强化组合（同局可凑齐）`, '']
  if (trios.length === 0) {
    lines.push('该英雄暂无三强化组合统计。')
  } else {
    trios.forEach((trio, index) => lines.push(trioLine(trio, index)))
    lines.push('', '用法：看到这三个强化同时出现时优先凑齐，胜率明显高于单拿。')
  }
  lines.push('', footer(store))
  return fit(lines.join('\n'), 1500)
}

/** 两个英雄对比。 */
export function renderCompare(store, first, second) {
  const side = (champion, label) => {
    const top = store.topAugments(champion, 3)
    const build = store.bestBuild(champion)
    const combo = build.strongest
    return [
      `${label} ${champion.title ? `${champion.title} ` : ''}${champion.name}｜${tierLabel(champion.tier)}${champion.rank ? ` 全服第${champion.rank}名` : ''}`,
      `  胜率 ${pct(champion.winRate)}｜选取 ${pct(champion.pickRate)}`,
      `  强化：${top.map((entry) => entry.name).filter(Boolean).join(' / ') || '暂无'}`,
      `  最强出装：${combo?.items?.join(' → ') ?? '暂无'}${combo ? `（胜率${pct1(combo.winRate)}）` : ''}`,
    ].join('\n')
  }
  const lines = ['⚖️ 英雄对比', '', side(first, 'A'), '', side(second, 'B'), '']
  const diff = Number(first.winRate ?? 0) - Number(second.winRate ?? 0)
  const better = diff >= 0 ? first.name : second.name
  lines.push(`结论：按全服胜率，${better} 领先 ${pct1(Math.abs(diff))}。`)
  lines.push(footer(store))
  return fit(lines.join('\n'), 1500)
}

/** 英雄强度榜。 */
export function renderTierList(store, { tier, limit = 15 } = {}) {
  const rows = store.listTier(tier, limit)
  const title = tier ? `🏅 ${String(tier).toUpperCase()} 英雄榜` : '🏅 海克斯大乱斗英雄强度榜'
  const lines = [title, '']
  if (!tier) {
    for (const grade of ['T1', 'T2', 'T3']) {
      const list = store.listTier(grade, 8)
      if (list.length === 0) continue
      lines.push(`【${grade}】`)
      lines.push(list.map((entry, index) => `${index + 1}. ${entry.name} ${pct1(entry.winRate)}`).join('　'))
      lines.push('')
    }
    lines.push('要看完整梯队：lol_tier tier=T1（T1~T5 都支持）')
  } else {
    if (rows.length === 0) lines.push(`没有 ${tier} 的英雄数据`)
    else {
      rows.forEach((entry, index) => {
        lines.push(`${index + 1}. ${entry.name}｜胜率${pct1(entry.winRate)} 选取${pct1(entry.pickRate)}｜${tierLabel(entry.tier)}`)
        const top = (entry.augments ?? []).slice(0, 3).map((augment) => augment.name)
        if (top.length > 0) lines.push(`   推荐强化：${top.join(' / ')}`)
      })
    }
  }
  lines.push('', footer(store))
  return fit(lines.join('\n'), 1700)
}

/** 整活/黑马推荐：某英雄的冷门高胜率强化，或全服黑马英雄。 */
export function renderOffMeta(store, champion) {
  if (!champion) {
    const rows = [...store.champions]
      .filter((entry) => Number(entry.pickRate ?? 0) > 0 && Number(entry.pickRate ?? 0) < 0.05)
      .sort((a, b) => Number(b.winRate ?? 0) - Number(a.winRate ?? 0))
      .slice(0, 8)
    const lines = ['🎲 冷门黑马英雄（选取率<5% 且胜率最高）', '']
    if (rows.length === 0) lines.push('暂无数据')
    rows.forEach((entry, index) => {
      lines.push(`${index + 1}. ${entry.name}｜${tierLabel(entry.tier)} 胜率${pct1(entry.winRate)} 选取${pct1(entry.pickRate)}`)
    })
    lines.push('', '想看某个英雄的整活海克斯：lol_fun 名字', footer(store))
    return fit(lines.join('\n'), 1500)
  }
  const rows = store.offMetaAugments(champion, 5)
  const lines = [`🎲 ${champion.name} 的整活/黑马海克斯`, `（胜率明显高于英雄基线 ${pct1(champion.winRate)}，但选取率不高）`, '']
  if (rows.length === 0) lines.push('这个英雄暂时没有明显黑马强化，走 lol_champion 看常规 Top6 吧')
  rows.forEach((entry, index) => {
    lines.push(`${index + 1}. ${entry.name}（${entry.rarityLabel}${entry.tier ? `·${tierLabel(entry.tier)}` : ''}）胜率${pct1(entry.winRate)} 选取${pct1(entry.pickRate)} 高出${pct1(entry.delta)}`)
    if (entry.description) lines.push(`   ↳ ${entry.description}`)
  })
  lines.push('', footer(store))
  return fit(lines.join('\n'), 1500)
}

/** 搜索命中列表。 */
export function renderSearch(store, query, { champions = [], augments = [] } = {}) {
  const lines = [`🔎 搜索「${query}」`]
  if (champions.length > 0) {
    lines.push('', '英雄：')
    champions.slice(0, 5).forEach((entry) => lines.push(`· ${entry.name}（${tierLabel(entry.tier)} 胜率${pct1(entry.winRate)}）→ lol_champion`))
  }
  if (augments.length > 0) {
    lines.push('', '强化：')
    augments.slice(0, 5).forEach((entry) => lines.push(`· ${entry.name}（${entry.rarityLabel ?? RARITY_LABEL[entry.rarity] ?? ''}）→ lol_augment`))
  }
  if (champions.length === 0 && augments.length === 0) {
    lines.push('', `没有找到「${query}」相关的英雄或强化。`)
    lines.push('可以试试：提莫 / 亚索 / 缩小引擎 / 小蜜蜂 / 循环往复')
  }
  return fit(lines.join('\n'), 1200)
}

/** 数据版本与覆盖率。 */
export function renderMeta(store) {
  const meta = store.meta()
  const lines = [
    '📦 海克斯大乱斗数据',
    '',
    `版本：${meta.patch ? `Patch ${meta.patch}` : '未知'}${meta.dataVersion ? `（数据 ${meta.dataVersion}）` : ''}`,
    `来源：${meta.source ?? 'aramgg 官方客户端数据 API'}`,
    `英雄：${meta.championCount ?? 0} 个｜强化：${meta.augmentCount ?? 0} 个｜物品：${meta.itemCount ?? 0} 个`,
    `数据生成：${meta.generatedAt ?? '未知'}`,
    `抓取时间：${meta.crawledAt ?? '未知'}`,
    meta.sourceFile ? `快照文件：${meta.sourceFile}` : '',
  ].filter(Boolean)
  if (store.diagnostics.length > 0) {
    lines.push('', '⚠️ 诊断：', ...store.diagnostics)
  }
  lines.push('', '说明：数据来自 aramgg 官方客户端的公开只读统计接口（全服对局样本）。op.gg 的海克斯大乱斗统计没有开放接口（客户端加密拉取），所以未使用。数据落后时用 lol_update 在线刷新。')
  return fit(lines.join('\n'), 1400)
}

/** 找不到英雄/强化时的兜底提示。 */
export function renderMiss(store, query, { champion, augment } = {}) {
  if (champion) {
    return fit(`没有找到英雄「${query}」。\n试试中文名（提莫/亚索）、称号（迅捷斥候）、英文名（Teemo）或外号（瞎子/狐狸）。\n也可以先 lol_search 模糊搜索。`)
  }
  if (augment) {
    return fit(`没有找到强化「${query}」。\n可以试效果关键词或直接问英雄：\n· 提莫带什么海克斯\n· lol_augments 名字`)
  }
  return fit(`没有找到「${query}」的匹配结果。\n英雄可以试：提莫 / 亚索 / 阿狸 / 盲僧\n强化可以试：缩小引擎 / 小蜜蜂 / 循环往复 / 装甲冲击`)
}
