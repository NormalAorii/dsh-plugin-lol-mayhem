/**
 * dsh-plugin-lol-mayhem / cardview
 *
 * 把 store 数据组装成 lib/cards.js 的卡片描述（badge/title/subtitle/sections/footer），
 * 由 renderCard 渲染为 1080 宽 PNG。无第三方依赖。
 * @module dsh-plugin-lol-mayhem/cardview
 */

import { pct, pct1 } from './store.js'

function patchLabel(store) {
  const meta = store.meta()
  return meta.patch ? `PATCH ${meta.patch}` : '当前版本'
}

function sourceFooter(store) {
  return `数据来源 aramgg.com（海克斯大乱斗全服统计·${patchLabel(store)}）｜非实时对局推荐`
}

function tierText(tier) {
  return tier ? String(tier).toUpperCase() : '—'
}

/** 英雄攻略卡：Top6 强化（含机制）+ 最强出装 + 三强化组合 + 技能/召唤师。 */
export function championCard(store, champion, { limit = 6 } = {}) {
  const augments = store.topAugments(champion, limit)
  const build = store.bestBuild(champion)
  const augLines = []
  augments.forEach((entry, index) => {
    const rarity = entry.rarityLabel ?? ''
    augLines.push(
      `- ${index + 1}. ${entry.name}（${rarity}${entry.tier ? `·${tierText(entry.tier)}` : ''}）胜率 ${pct1(entry.winRate)} · 选取 ${pct1(entry.pickRate)}`,
    )
    if (entry.description) augLines.push(`   ${entry.description}`)
  })
  const itemLines = []
  const pushCombo = (combo, label) => {
    if (!combo || !combo.items?.length) return
    const tags = (combo.tags ?? []).filter(Boolean).join('/')
    itemLines.push(`- ${label}：${combo.items.join(' → ')}（胜率 ${pct1(combo.winRate)} 选取 ${pct1(combo.pickRate)}${tags ? ` · ${tags}` : ''}）`)
  }
  pushCombo(build.strongest, '最强组合')
  if (build.mostPopular && build.mostPopular !== build.strongest) pushCombo(build.mostPopular, '最热门组合')
  for (const combo of build.combos.slice(0, 3)) {
    if (combo === build.strongest || combo === build.mostPopular) continue
    pushCombo(combo, '备选')
  }
  const detail = []
  const firstItem = champion.firstItem ?? champion.startItems?.[0]
  if (firstItem) detail.push(`首件核心：${firstItem}`)
  if (champion.skillOrder?.length) detail.push(`技能加点：${champion.skillOrder.join(' > ')}`)
  if (champion.summoners?.length) detail.push(`召唤师技能：${champion.summoners.join(' / ')}`)

  const sections = [
    { heading: `海克斯强化 Top${augments.length}`, lines: augLines.length ? augLines : ['暂无该英雄强化统计'] },
    { heading: '当前版本出装', lines: itemLines.length ? itemLines : ['暂无出装统计'] },
  ]
  const trios = store.trioList(champion, 3)
  if (trios.length > 0) {
    sections.push({
      heading: '三强化组合（同局可凑齐）',
      lines: trios.map((trio, index) => {
        const names = (trio.names ?? []).join(' + ')
        const sample = Number.isFinite(Number(trio.games)) ? `，${trio.games} 局` : ''
        return `- ${index + 1}. ${names}（胜率 ${pct1(trio.winRate)}${sample}）`
      }),
    })
  }
  if (detail.length > 0) sections.push({ heading: '其他细节', lines: detail })

  return {
    badge: `ARAM: MAYHEM · ${patchLabel(store)}`,
    title: champion.title ? `${champion.title} ${champion.name}` : champion.name,
    subtitle: `${tierText(champion.tier)}${champion.rank ? ` · 全服第 ${champion.rank} 名` : ''} · 胜率 ${pct(champion.winRate)} · 选取 ${pct(champion.pickRate)}`,
    sections,
    footer: sourceFooter(store),
  }
}

/** 强化详解卡。 */
export function augmentCard(store, augment, owners = []) {
  const rarity = augment.rarityLabel ?? ''
  const lines = []
  if (augment.description) lines.push(`- 效果：${augment.description}`)
  if (augment.winRate !== undefined && augment.winRate !== null) lines.push(`- 全服胜率：${pct(augment.winRate)} · 选取 ${pct(augment.pickRate)}`)
  if (augment.tier) lines.push(`- 梯度：${tierText(augment.tier)}`)
  const sections = [{ heading: '强化数据', lines: lines.length ? lines : ['暂无数据'] }]
  if (Array.isArray(augment.topChampions) && augment.topChampions.length > 0) {
    sections.push({
      heading: '适配英雄',
      lines: augment.topChampions.filter((entry) => entry.name).map((entry) => `- ${entry.name}`),
    })
  }
  if (owners.length > 0) {
    sections.push({
      heading: '在哪些英雄榜靠前',
      lines: owners.slice(0, 6).map((owner) => `- ${owner.name} 第 ${owner.rank} 位（胜率 ${pct1(owner.winRate)}）`),
    })
  }
  return {
    badge: `强化档案 · ${patchLabel(store)}`,
    title: augment.name,
    subtitle: `${rarity}强化${augment.tier ? ` · ${tierText(augment.tier)}` : ''}`,
    sections,
    footer: sourceFooter(store),
  }
}

/** 强化排行卡（某英雄或全服）。 */
export function augmentRankingCard(store, champion, { rarity, limit = 10 } = {}) {
  const lines = []
  if (champion) {
    const rows = store.topAugments(champion, limit)
    rows.forEach((entry, index) => {
      lines.push(`- ${index + 1}. ${entry.name}（${entry.rarityLabel ?? ''}）胜率 ${pct1(entry.winRate)} · 选取 ${pct1(entry.pickRate)}`)
      if (entry.description) lines.push(`   ${entry.description}`)
    })
    return {
      badge: `${patchLabel(store)} · 英雄强化榜`,
      title: champion.name,
      subtitle: `${tierText(champion.tier)} · 胜率 ${pct(champion.winRate)} · 选取 ${pct(champion.pickRate)}`,
      sections: [{ heading: `强化排行 Top${rows.length}`, lines: lines.length ? lines : ['暂无数据'] }],
      footer: sourceFooter(store),
    }
  }
  const rows = store.globalAugmentRanking({ rarity, limit })
  rows.forEach((entry, index) => {
    lines.push(`- ${index + 1}. ${entry.name}（${entry.rarityLabel ?? ''}）胜率 ${pct1(entry.winRate)}`)
  })
  return {
    badge: `${patchLabel(store)} · 全服强化强度`,
    title: rarity ? `${rarityLabel(rarity)}强化强度榜` : '全服强化强度榜',
    subtitle: '按全服胜率排序（无样本的强化不上榜）',
    sections: [{ heading: `Top${rows.length}`, lines: lines.length ? lines : ['暂无数据'] }],
    footer: sourceFooter(store),
  }
}

function rarityLabel(rarity) {
  return { silver: '白银', gold: '黄金', prismatic: '棱彩' }[rarity] ?? rarity
}

/** 英雄强度榜卡。 */
export function tierCard(store, { tier, limit = 10 } = {}) {
  const rows = store.listTier(tier, limit)
  const lines = rows.map((entry, index) => {
    const top = (entry.augments ?? []).slice(0, 2).map((augment) => augment.name).filter(Boolean).join(' / ')
    return `- ${index + 1}. ${entry.name}｜胜率 ${pct1(entry.winRate)} · 选取 ${pct1(entry.pickRate)}${top ? `｜${top}` : ''}`
  })
  return {
    badge: `${patchLabel(store)} · 英雄梯队`,
    title: tier ? `${tierText(tier)} 英雄榜` : '海克斯大乱斗英雄强度榜',
    subtitle: '按全服胜率与梯度排序',
    sections: [{ heading: tier ? `${tierText(tier)} 梯队` : '榜单', lines: lines.length ? lines : ['暂无数据'] }],
    footer: sourceFooter(store),
  }
}

/** 整活/黑马卡。 */
export function funCard(store, champion) {
  if (!champion) {
    const rows = [...store.champions]
      .filter((entry) => (entry.pickRate ?? 0) > 0 && (entry.pickRate ?? 0) < 0.05)
      .sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))
      .slice(0, 8)
    return {
      badge: `${patchLabel(store)} · 整活黑马`,
      title: '冷门高胜率英雄',
      subtitle: '选取率低于 5% 但胜率靠前',
      sections: [
        {
          heading: '黑马英雄',
          lines: rows.map((entry, index) => `- ${index + 1}. ${entry.name}（${tierText(entry.tier)}）胜率 ${pct1(entry.winRate)} · 选取 ${pct1(entry.pickRate)}`),
        },
      ],
      footer: sourceFooter(store),
    }
  }
  const rows = store.offMetaAugments(champion, 5)
  const lines = []
  rows.forEach((entry, index) => {
    lines.push(`- ${index + 1}. ${entry.name}（${entry.rarityLabel ?? ''}）胜率 ${pct1(entry.winRate)} · 选取 ${pct1(entry.pickRate)} · 高出 ${pct1(entry.delta)}`)
    if (entry.description) lines.push(`   ${entry.description}`)
  })
  return {
    badge: `${patchLabel(store)} · 整活黑马`,
    title: `${champion.name} 的黑马强化`,
    subtitle: `英雄基线胜率 ${pct1(champion.winRate)}｜胜率显著更高、选取率不高的强化`,
    sections: [{ heading: '黑马强化', lines: lines.length ? lines : ['暂无黑马强化，参考常规 Top6'] }],
    footer: sourceFooter(store),
  }
}

/** 三强化组合卡。 */
export function trioCard(store, champion, { limit = 6 } = {}) {
  const trios = store.trioList(champion, limit)
  return {
    badge: `${patchLabel(store)} · 三强化组合`,
    title: champion.title ? `${champion.title} ${champion.name}` : champion.name,
    subtitle: `同局可凑齐的三件海克斯套装｜英雄胜率 ${pct1(champion.winRate)}`,
    sections: [
      {
        heading: `组合 Top${trios.length || 0}`,
        lines: trios.length
          ? trios.map((trio, index) => {
              const sample = Number.isFinite(Number(trio.games)) ? `，${trio.games} 局` : ''
              return `- ${index + 1}. ${(trio.names ?? []).join(' + ')}（胜率 ${pct1(trio.winRate)}${sample}）`
            })
          : ['该英雄暂无三强化组合统计'],
      },
    ],
    footer: sourceFooter(store),
  }
}

/** 数据版本卡。 */
export function metaCard(store) {
  const meta = store.meta()
  const lines = [
    `- 版本：${meta.patch ? `Patch ${meta.patch}` : '未知'}${meta.dataVersion ? `（数据 ${meta.dataVersion}）` : ''}`,
    `- 来源：${meta.source ?? 'aramgg 官方客户端数据 API'}`,
    `- 覆盖英雄：${meta.championCount ?? 0}`,
    `- 覆盖强化：${meta.augmentCount ?? 0}`,
    `- 覆盖物品：${meta.itemCount ?? 0}`,
    `- 抓取时间：${meta.crawledAt ?? '未知'}`,
  ]
  if (store.diagnostics.length > 0) lines.push(...store.diagnostics.map((item) => `- ⚠️ ${item}`))
  return {
    badge: '数据状态',
    title: '海克斯大乱斗数据',
    subtitle: '快照数据，可在对话中说「刷新数据」在线更新',
    sections: [{ heading: '快照信息', lines }],
    footer: '数据来自 aramgg 官方客户端公开只读 API（全服对局样本）；op.gg 未开放海克斯大乱斗接口',
  }
}
