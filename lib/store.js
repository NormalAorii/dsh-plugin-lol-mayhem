/**
 * dsh-plugin-lol-mayhem / store
 *
 * 数据层：加载随插件打包的快照 `data/snapshot.json`（schema v2，由 scripts/crawl.mjs
 * 从 aramgg 客户端数据 API 生成），叠加运行时刷新缓存；构建索引并提供查询函数。
 * 读到 v1/v2 都能用：v2 的压缩数组在这里展开成视图对象。
 * 无第三方依赖。
 * @module dsh-plugin-lol-mayhem/store
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUNDLED_SNAPSHOT = path.join(PLUGIN_ROOT, 'data', 'snapshot.json')
const DDRAGON_INDEX = path.join(PLUGIN_ROOT, 'data', 'champions-ddragon.json')

/** 运行时刷新缓存目录（DSH_HOME/plugin-data/<plugin>）。 */
export function runtimeDir() {
  const home = process.env.DSH_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh')
  return path.join(home, 'plugin-data', 'dsh-plugin-lol-mayhem')
}

function readJson(file) {
  try {
    if (!existsSync(file)) return undefined
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

/** 常见社区绰号 → Riot championId。 */
const NICKNAMES = {
  瞎子: 64, 盲僧: 64, 李青: 64, 大虫子: 31, 科加斯: 31, 狗头: 75, 内瑟斯: 75,
  诺手: 122, 德莱厄斯: 122, 卡牌: 4, 崔斯特: 4, 狐狸: 103, 阿狸: 103,
  电耗子: 85, 凯南: 85, 老鼠: 29, 图奇: 29, 剑圣: 11, 易大师: 11, 蛮王: 23,
  泰达米尔: 23, 冰鸟: 34, 艾尼维亚: 34, 火男: 63, 布兰德: 63, 死歌: 30,
  卡尔萨斯: 30, 石头人: 54, 墨菲特: 54, 小丑: 35, 萨科: 35, 蒙多: 36,
  风女: 40, 迦娜: 40, 飞机: 42, 库奇: 42, 女警: 51, 凯特琳: 51,
  螳螂: 121, 卡兹克: 121, 大嘴: 96, 克格莫: 96, 挖掘机: 421, 雷克塞: 421,
  蜘蛛: 60, 伊莉丝: 60, 蛇女: 69, 卡西奥佩娅: 69, 豹女: 76, 奈德丽: 76,
  龙女: 102, 希瓦娜: 102, 螃蟹: 6, 厄加特: 6, 吸血鬼: 8, 弗拉基米尔: 8,
  提莫队长: 17, 提百万: 17, 男枪: 104, 格雷福斯: 104, 女枪: 21, 厄运小姐: 21,
  奥巴马: 236, 卢锡安: 236, ez: 81, 伊泽瑞尔: 81, 轮子妈: 15, 希维尔: 15,
  球女: 61, 奥莉安娜: 61, 三只手: 45, 维克托: 45, 发条: 61, 乌鸦: 50,
  斯维因: 50, 妖姬: 7, 诡术妖姬: 7, 小鱼人: 105, 菲兹: 105, 劫: 238,
  亚索: 157, 永恩: 777, 岩雀: 163, 塔莉垭: 163, 沙皇: 268, 阿兹尔: 268,
  洛: 497, 霞: 498, 派克: 555, 剑魔: 266, 亚托克斯: 266, 腕豪: 875,
  瑟提: 875, 破败王: 234, 佛耶戈: 234, 铁男: 82, 莫德凯撒: 82,
  妮蔻: 518, 琪亚娜: 246, 佐伊: 142, 塞拉斯: 517, 猫咪: 350, 悠米: 350,
  牛头: 12, 阿里斯塔: 12, 泰坦: 111, 诺提勒斯: 111, 机器人: 53, 锤石: 412,
  日女: 89, 蕾欧娜: 89, 布隆: 201, 巴德: 432, 洛手: 122, 大发明家: 74,
  黑默丁格: 74, 炸弹人: 115, 吉格斯: 115, 卡莎: 145, 卡蜜尔: 164, 青钢影: 164,
  刀妹: 39, 艾瑞莉娅: 39, 锐雯: 92, 鳄鱼: 58, 雷克顿: 58, 巨魔: 48,
  特朗德尔: 48, 龙龟: 33, 拉莫斯: 33, 乌迪尔: 77, 翠神: 427, 艾翁: 427,
  触手妈: 420, 俄洛伊: 420, 掘墓: 83, 约里克: 83, 猴子: 62, 悟空: 62,
  杰斯: 126, 波比: 78, 兰博: 68, 猪妹: 113, 瑟庄妮: 113, 奥恩: 516,
  卡萨丁: 38, 玛尔扎哈: 90, 大眼: 161, 维克兹: 161, 冰女: 127, 丽桑卓: 127,
  艾克: 245, 卡特: 55, 卡特琳娜: 55, 阿卡丽: 84, 阿卡莉: 84, 赛娜: 235,
  奇亚娜: 246, 奎桑提: 897, 纳尔: 150, 千珏: 203, 阿克尚: 166, 薇古丝: 711,
  泽丽: 221, 芮尔: 526, 格温: 887, 烈娜塔: 888, 尼菈: 895, 贝蕾亚: 233,
  斯莫德: 901, 彗: 910, 安蓓萨: 799, 梅尔: 800, 亚恒: 802, 妮蔻: 518,
  蝎子: 904, 布兰德: 63, 莉莉娅: 876, 塞纳: 235, 韦鲁斯: 110,
}

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\s·・._-]+/g, '')
    .replace(/[（）()【】\[\]]/g, '')
}

/** 0.5448 → "54.48%" */
export function pct(value, digits = 2) {
  if (value === null || value === undefined || value === '') return '—'
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  return `${(num * 100).toFixed(digits)}%`
}

/** 0.5448 → "54.5%"（更短，卡片/消息用） */
export function pct1(value) {
  return pct(value, 1)
}

/** 清洗游戏文本里的占位标记（`%i:OnHit%`、`<br>` 等），保留可读中文。 */
export function cleanMarkup(input) {
  return String(input ?? '')
    .replace(/%i:[A-Za-z0-9_]+%/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?[A-Za-z][^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const RARITY_LABEL = { silver: '白银', gold: '黄金', prismatic: '棱彩' }
export const RARITY_ORDER = { silver: 0, gold: 1, prismatic: 2 }

/** 把 v2 的 18 键加点序列转成「主 > 副 > 次」优先级。 */
export function skillPriority(keys) {
  const sequence = String(keys ?? '').replace(/[^QWER]/g, '')
  const counts = { Q: 0, W: 0, E: 0 }
  const fifth = { Q: 999, W: 999, E: 999 }
  for (let index = 0; index < sequence.length; index += 1) {
    const key = sequence[index]
    if (key in counts) {
      counts[key] += 1
      if (counts[key] === 5 && fifth[key] === 999) fifth[key] = index
    }
  }
  return ['Q', 'W', 'E'].sort((a, b) => fifth[a] - fifth[b] || counts[b] - counts[a])
}

/** 上游 tier 可能是数字（1–5）或 "T1"；统一显示为 T1。 */
export function normalizeTier(value) {
  if (value === null || value === undefined || value === '') return null
  const text = String(value).trim().toUpperCase()
  return /^\d+$/.test(text) ? `T${text}` : text
}

/** v2 快照 → 视图（强化对象化、组合对象化、trios 展开）。 */
function adaptSnapshot(raw) {
  if (!raw || (raw.schemaVersion ?? 1) >= 2) {
    const augments = {}
    for (const [id, entry] of Object.entries(raw?.augments ?? {})) {
      const stats = entry.stats ?? {}
      augments[id] = {
        id: Number(entry.id ?? id),
        name: entry.name,
        key: entry.key,
        rarity: entry.rarity,
        rarityLabel: entry.rarityLabel ?? RARITY_LABEL[entry.rarity] ?? '',
        description: cleanMarkup(entry.description),
        icon: entry.icon,
        winRate: stats.winRate ?? entry.winRate ?? null,
        pickRate: stats.pickRate ?? entry.pickRate ?? null,
        tier: normalizeTier(stats.tier ?? entry.tier),
        topChampions: entry.topChampions ?? [],
      }
    }
    const champions = {}
    for (const [key, entry] of Object.entries(raw?.champions ?? {})) {
      const id = Number(entry.id ?? key)
      const augmentsView = (entry.augments ?? []).map((row) => {
        if (!Array.isArray(row)) {
          const detail = augments[String(row.id)] ?? {}
          return {
            id: Number(row.id),
            rank: row.rank,
            tier: normalizeTier(row.tier ?? detail.tier),
            winRate: row.winRate,
            pickRate: row.pickRate,
            games: row.games,
            name: row.name ?? detail.name,
            rarity: row.rarity ?? detail.rarity,
            rarityLabel: row.rarityLabel ?? detail.rarityLabel,
            description: row.description ?? detail.description,
          }
        }
        const [augmentId, rank, tier, winRate, pickRate, games] = row
        const detail = augments[String(augmentId)] ?? {}
        return {
          id: Number(augmentId),
          rank,
          tier: normalizeTier(tier ?? detail.tier),
          winRate,
          pickRate,
          games,
          name: detail.name,
          rarity: detail.rarity,
          rarityLabel: detail.rarityLabel,
          description: detail.description,
        }
      })
      const builds = (entry.builds ?? []).map((build) => ({
        label: build.label ?? '综合',
        tags: build.tags ?? [],
        winRate: build.winRate,
        pickRate: build.pickRate,
        games: build.games,
        combos: (build.combos ?? []).map((combo, index) =>
          Array.isArray(combo)
            ? { rank: index + 1, items: combo[0] ?? [], winRate: combo[1], pickRate: combo[2], games: combo[3] }
            : combo,
        ),
        skillOrders: build.skillOrders ?? [],
        summoners: build.summoners ?? [],
        startItems: build.startItems ?? [],
      }))
      const topBuild = builds[0]
      const trios = (entry.trios ?? []).map((trio) =>
        Array.isArray(trio)
          ? {
              ids: trio[0] ?? [],
              names: (trio[0] ?? []).map((augmentId) => augments[String(augmentId)]?.name ?? `未知强化 #${augmentId}`),
              winRate: trio[1],
              games: trio[2],
              pickRate: trio[3],
            }
          : trio,
      )
      champions[key] = {
        ...entry,
        id,
        tier: normalizeTier(entry.tier),
        displayName: entry.name,
        augments: augmentsView,
        builds,
        trios,
        startItems: entry.startItems ?? topBuild?.startItems ?? [],
        skillOrder: entry.skillOrder ?? skillPriority(topBuild?.skillOrders?.[0]?.keys),
        skillSequence: topBuild?.skillOrders?.[0]?.keys ?? '',
        summoners: entry.summoners ?? topBuild?.summoners ?? [],
        firstItem: topBuild?.combos?.[0]?.items?.[0] ?? '',
      }
    }
    return { ...raw, augments, champions, items: raw?.items ?? {}, spells: raw?.spells ?? {} }
  }
  // v1（HTML 时代）快照：原样返回，补 displayName/别名索引所需字段。
  const champions = {}
  for (const [key, entry] of Object.entries(raw?.champions ?? {})) {
    champions[key] = {
      ...entry,
      displayName: entry.displayName ?? entry.name,
      trios: entry.trios ?? [],
      skillOrder: entry.skillOrder ?? [],
    }
  }
  const augments = {}
  for (const [key, entry] of Object.entries(raw?.augments ?? {})) {
    augments[key] = { ...entry, description: cleanMarkup(entry.description) }
  }
  return { ...raw, champions, augments }
}

let cache = { key: '', store: undefined }

function snapshotKey(bundled, runtime) {
  const stamp = (file) => {
    try {
      return existsSync(file) ? `${statSync(file).mtimeMs}:${statSync(file).size}` : '-'
    } catch {
      return '-'
    }
  }
  return `${stamp(bundled)}|${stamp(runtime)}`
}

/**
 * 加载（并缓存）数据层。
 * @returns {{ snapshot: object|undefined, diagnostics: string[], champions: object[], championById: Map<number, object>, augmentById: Map<number, object>, items: Map<number, string>, spells: Map<number, string>, findChampion: Function, findAugment: Function, listTier: Function, topAugments: Function, bestBuild: Function, offMetaAugments: Function, globalAugmentRanking: Function, trioList: Function, meta: Function, sourceFile: string|undefined }}
 */
export function getStore() {
  const runtimeFile = path.join(runtimeDir(), 'snapshot.json')
  const key = snapshotKey(BUNDLED_SNAPSHOT, runtimeFile)
  if (cache.store && cache.key === key) return cache.store

  const diagnostics = []
  let raw
  let sourceFile
  const runtime = readJson(runtimeFile)
  const bundled = readJson(BUNDLED_SNAPSHOT)
  const usable = (candidate) =>
    candidate &&
    (candidate.schemaVersion === 1 || candidate.schemaVersion === 2) &&
    candidate.champions &&
    Object.keys(candidate.champions).length > 0
  if (usable(runtime) && (!usable(bundled) || Number(runtime.meta?.crawledAtMs ?? 0) >= Number(bundled.meta?.crawledAtMs ?? 0))) {
    raw = runtime
    sourceFile = runtimeFile
  } else if (usable(bundled)) {
    raw = bundled
    sourceFile = BUNDLED_SNAPSHOT
  }
  if (!raw) {
    diagnostics.push('数据快照缺失或损坏：请在插件目录运行 `npm run crawl` 生成 data/snapshot.json')
  } else if (raw.meta?.partial) {
    diagnostics.push('当前快照为部分数据（抓取未完成），未覆盖的英雄会提示缺失')
  }

  const snapshot = raw ? adaptSnapshot(raw) : undefined
  const champions = snapshot
    ? Object.values(snapshot.champions)
        .filter((entry) => entry && Number.isFinite(Number(entry.id)))
        .map((entry) => ({ ...entry, id: Number(entry.id) }))
        .sort((a, b) => Number(a.rank ?? 9999) - Number(b.rank ?? 9999))
    : []
  const championById = new Map(champions.map((entry) => [entry.id, entry]))
  const augmentById = new Map()
  for (const [augmentKey, augment] of Object.entries(snapshot?.augments ?? {})) {
    if (augment && augment.name) augmentById.set(Number(augment.id ?? augmentKey), augment)
  }
  const items = new Map(Object.entries(snapshot?.items ?? {}).map(([id, name]) => [Number(id), name]))
  const spells = new Map(Object.entries(snapshot?.spells ?? {}).map(([id, name]) => [Number(id), name]))

  // name → championId 索引（中文名 / 称号 / 英文 alias / ddragon 译名 / 社区绰号）
  const ddragon = readJson(DDRAGON_INDEX)
  const aliasById = new Map((ddragon?.champions ?? []).map((entry) => [Number(entry.id), entry]))
  const keysById = new Map()
  const addKey = (id, value) => {
    const key3 = normalize(value)
    if (!key3) return
    const list = keysById.get(id) ?? []
    if (!list.includes(key3)) list.push(key3)
    keysById.set(id, list)
  }
  for (const champion of champions) {
    addKey(champion.id, champion.name)
    addKey(champion.id, champion.displayName)
    addKey(champion.id, champion.title)
    addKey(champion.id, champion.alias)
    const alias = aliasById.get(champion.id)
    if (alias) {
      addKey(champion.id, alias.en)
      addKey(champion.id, alias.name)
      addKey(champion.id, alias.title)
    }
  }
  for (const [nick, id] of Object.entries(NICKNAMES)) {
    if (championById.has(id)) addKey(id, nick)
  }

  const exactKeys = new Map()
  for (const [id, keys] of keysById) for (const key3 of keys) if (!exactKeys.has(key3)) exactKeys.set(key3, id)

  /** 模糊查找英雄：id → 精确名 → 前缀 → 包含。 */
  function findChampion(query) {
    const value = String(query ?? '').trim()
    if (!value) return undefined
    if (/^\d+$/.test(value)) return championById.get(Number(value))
    const key3 = normalize(value)
    if (!key3) return undefined
    const exact = exactKeys.get(key3)
    if (exact) return championById.get(exact)
    const nickname = NICKNAMES[value.replace(/\s+/g, '')]
    if (nickname) return championById.get(nickname)
    const candidates = []
    for (const [id, keys] of keysById) {
      for (const candidate of keys) {
        if (candidate.startsWith(key3) || key3.startsWith(candidate)) candidates.push({ id, score: 2 - Math.abs(candidate.length - key3.length) / 20 })
        else if (candidate.includes(key3) || key3.includes(candidate)) candidates.push({ id, score: 1 - Math.abs(candidate.length - key3.length) / 20 })
      }
    }
    candidates.sort((a, b) => b.score - a.score)
    return candidates.length > 0 ? championById.get(candidates[0].id) : undefined
  }

  /** 模糊查找强化：id → 精确名 → 包含。 */
  function findAugment(query) {
    const value = String(query ?? '').trim()
    if (!value) return undefined
    if (/^\d+$/.test(value)) return augmentById.get(Number(value))
    const key3 = normalize(value)
    if (!key3) return undefined
    let best
    for (const augment of augmentById.values()) {
      const name = normalize(augment.name)
      if (name === key3) return augment
      if (name.includes(key3) || key3.includes(name)) {
        const score = Math.min(name.length, key3.length) / Math.max(name.length, key3.length)
        if (!best || score > best.score) best = { augment, score }
      }
    }
    return best?.augment
  }

  /** 取某英雄的强化榜（默认前 6），已合并全局效果说明。 */
  function topAugments(champion, limit = 6) {
    if (!champion) return []
    return (champion.augments ?? []).slice(0, limit).map((entry) => {
      const detail = snapshot?.augments?.[entry.id] ?? snapshot?.augments?.[String(entry.id)] ?? {}
      return {
        id: Number(entry.id),
        rank: entry.rank,
        name: entry.name ?? detail.name ?? `强化 ${entry.id}`,
        tier: entry.tier ?? detail.tier,
        rarity: entry.rarity ?? detail.rarity ?? 'gold',
        rarityLabel: entry.rarityLabel ?? detail.rarityLabel ?? RARITY_LABEL[entry.rarity ?? detail.rarity ?? 'gold'],
        winRate: entry.winRate ?? detail.winRate,
        pickRate: entry.pickRate,
        games: entry.games,
        description: detail.description ?? entry.description ?? '',
        globalWinRate: detail.winRate,
        topChampions: detail.topChampions ?? [],
      }
    })
  }

  /** 该英雄的最强/最热出装组合。 */
  function bestBuild(champion) {
    const builds = champion?.builds ?? []
    const combos = []
    for (const build of builds) {
      for (const combo of build.combos ?? []) {
        combos.push({
          items: combo.items ?? [],
          winRate: combo.winRate,
          pickRate: combo.pickRate,
          games: combo.games,
          tags: build.tags ?? [],
          label: build.label,
          rank: combo.rank,
        })
      }
    }
    const withItems = combos.filter((combo) => combo.items.length > 0)
    const eligible = withItems.filter((combo) => Number(combo.pickRate ?? 0) >= 0.01)
    const byWin = [...(eligible.length > 0 ? eligible : withItems)].sort(
      (a, b) => Number(b.winRate ?? 0) - Number(a.winRate ?? 0) || Number(b.pickRate ?? 0) - Number(a.pickRate ?? 0),
    )
    const byPick = [...withItems].sort((a, b) => Number(b.pickRate ?? 0) - Number(a.pickRate ?? 0))
    return {
      strongest: byWin[0],
      mostPopular: byPick[0],
      combos: byWin.slice(0, 4),
      builds: builds.map((build) => ({
        tags: build.tags ?? [],
        label: build.label,
        winRate: build.winRate,
        pickRate: build.pickRate,
        combos: (build.combos ?? []).slice(0, 4),
      })),
    }
  }

  /** 整活/黑马：该英雄胜率显著高于自身基线、但选取率不高的强化。 */
  function offMetaAugments(champion, limit = 5) {
    const base = Number(champion?.winRate ?? 0)
    return (champion?.augments ?? [])
      .map((entry) => ({ entry, delta: Number(entry.winRate ?? 0) - base, pick: Number(entry.pickRate ?? 0) }))
      .filter((row) => row.delta >= 0.02 && row.pick <= 0.15)
      .sort((a, b) => b.delta - a.delta || a.pick - b.pick)
      .slice(0, limit)
      .map((row) => {
        const detail = snapshot?.augments?.[row.entry.id] ?? {}
        return {
          id: Number(row.entry.id),
          name: row.entry.name ?? detail.name,
          tier: row.entry.tier,
          rarityLabel: row.entry.rarityLabel ?? RARITY_LABEL[detail.rarity ?? 'gold'],
          winRate: row.entry.winRate,
          pickRate: row.entry.pickRate,
          delta: row.delta,
          description: detail.description ?? '',
        }
      })
  }

  /** 全局强化排行（可过滤稀有度）。 */
  function globalAugmentRanking({ rarity, limit = 20, minPickRate = 0 } = {}) {
    const rows = [...augmentById.values()]
      .filter((augment) => (rarity ? augment.rarity === rarity : true))
      .filter((augment) => Number(augment.pickRate ?? 0) >= minPickRate)
      .filter((augment) => Number(augment.winRate ?? 0) > 0)
      .sort((a, b) => Number(b.winRate ?? 0) - Number(a.winRate ?? 0) || Number(b.pickRate ?? 0) - Number(a.pickRate ?? 0))
    return rows.slice(0, limit)
  }

  /** 三强化组合（同一局里能一起拿的三个强化）。 */
  function trioList(champion, limit = 6) {
    return (champion?.trios ?? [])
      .filter((trio) => (trio.names ?? trio.ids ?? []).length === 3)
      .sort((a, b) => Number(b.winRate ?? 0) - Number(a.winRate ?? 0))
      .slice(0, limit)
  }

  /** 按 T 级列出英雄。 */
  function listTier(tier, limit = 20) {
    const wanted = String(tier ?? '').toUpperCase()
    const rows = champions.filter((champion) => (wanted ? String(champion.tier ?? '').toUpperCase() === wanted : true))
    return rows.slice(0, limit)
  }

  /** 版本信息。 */
  function meta() {
    return {
      ...(snapshot?.meta ?? {}),
      sourceFile,
      championCount: champions.length,
      augmentCount: augmentById.size,
      itemCount: items.size,
    }
  }

  const store = {
    schemaVersion: snapshot?.schemaVersion ?? 0,
    snapshot,
    diagnostics,
    champions,
    championById,
    augmentById,
    items,
    spells,
    keysById,
    aliasById,
    findChampion,
    findAugment,
    topAugments,
    bestBuild,
    offMetaAugments,
    globalAugmentRanking,
    trioList,
    listTier,
    meta,
  }
  cache = { key, store }
  return store
}

/** 清空内存缓存（在线刷新后调用）。 */
export function invalidate() {
  cache = { key: '', store: undefined }
}
