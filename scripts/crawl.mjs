/**
 * dsh-plugin-lol-mayhem / crawl
 *
 * 数据源：aramgg 官方客户端的公开只读数据 API（无需 Key，服务端限流）。
 *   GET https://data.dtodo.cn/api/client/v1/config                      → 当前 dataVersion + manifest 路径
 *   GET https://data.dtodo.cn/api/client/v1/data/<version>/manifest.json
 *   GET .../augments.json  champions.json  items.json  summoner-spells.json
 *   GET .../champions/<championId>.json
 *
 * 同一个文件既是抓取库（插件运行时增量刷新用），也是 CLI（构建整份快照）：
 *   node scripts/crawl.mjs [--limit 20] [--out ../data/snapshot.json] [--quiet]
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ORIGIN = 'https://data.dtodo.cn'
export const CONFIG_URL = `${ORIGIN}/api/client/v1/config`
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36 dsh-plugin-lol-mayhem'
const HERE = dirname(fileURLToPath(import.meta.url))
export const PLUGIN_ROOT = dirname(HERE)
export const DEFAULT_CACHE = join(PLUGIN_ROOT, '..', 'lol-probe', 'cache', 'api')

/** 清洗游戏富文本：`<scaleAF>适应之力</scaleAF>` → `适应之力`，`%i:OnHit%` → ``。 */
export function cleanGameText(input) {
  return String(input ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?[A-Za-z][^>]*>/g, '')
    .replace(/%i:[A-Za-z0-9_]+%/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cacheFileFor(url, cache) {
  let hash = 0
  for (let index = 0; index < url.length; index += 1) hash = (hash * 31 + url.charCodeAt(index)) | 0
  return join(cache, `${Math.abs(hash).toString(36)}.json`)
}

/** 带磁盘缓存的 JSON 抓取；缓存文件按 URL 哈希命名，损坏自动重抓。 */
export async function fetchJson(url, { cache = DEFAULT_CACHE, retries = 4, timeoutMs = 30000 } = {}) {
  const file = cacheFileFor(url, cache)
  if (existsSync(file) && statSync(file).size > 2) {
    try {
      return JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      /* 缓存损坏，继续走网络 */
    }
  }
  let lastError
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'user-agent': UA, accept: 'application/json,text/plain,*/*' },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const text = await response.text()
      if (text.length < 2) throw new Error('响应为空')
      const data = JSON.parse(text)
      mkdirSync(cache, { recursive: true })
      writeFileSync(file, text)
      return data
    } catch (error) {
      lastError = error
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 350 * attempt))
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(
    `抓取失败 ${url}：${lastError instanceof Error ? lastError.message : String(lastError)}`,
  )
}

/** 当前数据版本信息。 */
export async function fetchConfig(options) {
  const config = await fetchJson(CONFIG_URL, options)
  if (!config?.manifest) throw new Error('config 响应异常：缺少 manifest 字段')
  return config
}

/** 全站数据（强化字典 / 英雄列表 / 物品 / 召唤师技能）。 */
export async function fetchGlobal(options = {}) {
  const config = await fetchConfig(options)
  const base = `${ORIGIN}/api/client/v1/data/${config.dataVersion}`
  const fetcher = (name) => fetchJson(`${base}/${name}`, options)
  const [augments, champions, items, spells] = await Promise.all([
    fetcher('augments.json'),
    fetcher('champions.json'),
    fetcher('items.json'),
    fetcher('summoner-spells.json'),
  ])
  return { config, base, augments, champions, items, spells }
}

/** 单个英雄的原始数据。 */
export async function fetchChampionRaw(championId, { cache, global } = {}) {
  const ctx = global ?? (await fetchGlobal({ cache }))
  return fetchJson(`${ctx.base}/champions/${Number(championId)}.json`, { cache })
}

function splitTags(tags) {
  const raw = tags?.primary_tags_f3pie
  if (!raw) return ['综合']
  return String(raw)
    .split(/\s*[,/]\s*/)
    .filter(Boolean)
}

function namesFor(ids, namesMap) {
  return (ids ?? []).map((id) => namesMap.get(Number(id)) ?? `#${id}`)
}

/** augment 字典（全局）。 */
export function normalizeAugmentLibrary(augmentsResource) {
  const out = {}
  for (const entry of augmentsResource?.data ?? []) {
    const stats = entry.stats ?? {}
    out[entry.id] = {
      id: entry.id,
      name: entry.name,
      key: entry.key,
      rarity: entry.rarity,
      rarityLabel: entry.rarityDisplayName ?? entry.rarityName,
      description: cleanGameText(entry.description),
      icon: entry.iconUrl,
      stats: {
        tier: stats.tier ?? null,
        winRate: stats.winRate ?? null,
        pickRate: stats.pickRate ?? null,
      },
      topChampions: (entry.topChampions ?? []).slice(0, 6).map((champion) => ({
        id: champion.id,
        name: champion.name,
      })),
    }
  }
  return out
}

/** 单个英雄 → 快照结构（强化与组合用数字数组压缩体积）。 */
export function normalizeChampion(raw, { itemName, spellName, rank }) {
  const champion = raw.champion ?? {}
  const rawBuilds = Array.isArray(raw.builds) && raw.builds.length > 0 ? raw.builds : raw.build ? [raw.build] : []
  const builds = rawBuilds.map((build) => {
    const starting = [...(build.startingItems ?? [])].sort((a, b) => (b.games ?? 0) - (a.games ?? 0))[0]
    const orders = (build.skillOrders ?? []).slice(0, 2).map((order) => ({
      keys: (order.skillKeys ?? []).join(''),
      winRate: order.winRate ?? null,
      games: order.games ?? null,
    }))
    return {
      label: build.tags?.primary_tags_f3pie ?? '综合',
      tags: splitTags(build.tags),
      winRate: build.stats?.winRate ?? null,
      pickRate: build.stats?.pickRate ?? null,
      games: build.stats?.games ?? null,
      combos: (build.coreItems ?? []).slice(0, 5).map((row) => [
        namesFor(row.itemIds, itemName),
        row.winRate ?? null,
        row.pickRate ?? null,
        row.games ?? null,
      ]),
      startItems: namesFor(starting?.itemIds, itemName),
      situational: (build.situationalItems ?? [])
        .slice(0, 6)
        .map((row) => [itemName.get(Number(row.id)) ?? `#${row.id}`, row.games ?? null]),
      skillOrders: orders,
      summoners: namesFor((build.summonerSpells ?? [])[0]?.summonerSpellIds, spellName),
    }
  })

  const top = builds[0]
  return {
    id: champion.id,
    alias: champion.alias ?? '',
    name: champion.name ?? '',
    title: champion.title ?? '',
    roles: champion.roles ?? [],
    icon: champion.iconUrl,
    rank: rank ?? null,
    tier: champion.stats?.tier ?? null,
    winRate: champion.stats?.winRate ?? null,
    pickRate: champion.stats?.pickRate ?? null,
    builds,
    startItems: top?.startItems ?? [],
    skillOrders: top?.skillOrders ?? [],
    summoners: top?.summoners ?? [],
    augments: (raw.augments ?? [])
      .filter((entry) => entry?.stats)
      .map((entry) => [
        entry.id,
        entry.stats.rank ?? null,
        entry.stats.tier ?? null,
        entry.stats.winRate ?? null,
        entry.stats.pickRate ?? null,
        entry.stats.games ?? null,
      ])
      .sort((a, b) => (a[1] ?? 9999) - (b[1] ?? 9999)),
    trios: (raw.augmentTrios ?? []).slice(0, 6).map((trio) => [
      (trio.augmentIds ?? []).map(Number),
      trio.stats?.winRate ?? null,
      trio.stats?.games ?? null,
      trio.stats?.pickRate ?? null,
    ]),
  }
}

async function mapLimit(items, limit, worker, onProgress) {
  const results = new Array(items.length)
  let cursor = 0
  let done = 0
  const runners = Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, async () => {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await worker(items[index])
      done += 1
      onProgress?.(done, items.length)
    }
  })
  await Promise.all(runners)
  return results
}

/**
 * 构建完整快照。
 * @param {{limit?:number, concurrency?:number, cache?:string, onProgress?:Function}} [options]
 */
export async function buildSnapshot(options = {}) {
  const { limit, concurrency = 6, cache, onProgress } = options
  const global = await fetchGlobal({ cache })
  const itemName = new Map((global.items.data ?? []).map((item) => [Number(item.id), item.name]))
  const spellName = new Map((global.spells.data ?? []).map((spell) => [Number(spell.id), spell.name]))
  const roster = (global.champions.data ?? []).map((entry, index) => ({ ...entry, siteRank: index + 1 }))
  const targets = limit ? roster.slice(0, limit) : roster

  const rows = await mapLimit(
    targets,
    concurrency,
    async (champion) => {
      const raw = await fetchChampionRaw(champion.id, { cache, global })
      return normalizeChampion(raw, { itemName, spellName, rank: champion.siteRank })
    },
    onProgress,
  )

  const augmentation = normalizeAugmentLibrary(global.augments)
  return {
    schemaVersion: 2,
    meta: {
      source: 'aramgg 官方客户端数据 API',
      sourceUrl: CONFIG_URL,
      locale: global.config.locale,
      gamePatch: global.config.gamePatch,
      patch: global.config.gamePatch,
      dataVersion: global.config.dataVersion,
      generatedAt: global.config.generatedAt,
      crawledAt: new Date().toISOString(),
      crawledAtMs: Date.now(),
      championCount: rows.length,
      augmentCount: Object.keys(augmentation).length,
      itemCount: itemName.size,
      partial: Boolean(limit),
    },
    items: Object.fromEntries(itemName),
    spells: Object.fromEntries(spellName),
    augments: augmentation,
    champions: Object.fromEntries(rows.map((row) => [row.id, row])),
  }
}

/** 运行时增量刷新单个英雄：始终拉最新版本，返回归一化英雄 + 版本信息。 */
export async function refreshChampion(championId, { cache } = {}) {
  const global = await fetchGlobal({ cache })
  const itemName = new Map((global.items.data ?? []).map((item) => [Number(item.id), item.name]))
  const spellName = new Map((global.spells.data ?? []).map((spell) => [Number(spell.id), spell.name]))
  const index = (global.champions.data ?? []).findIndex((entry) => Number(entry.id) === Number(championId))
  const raw = await fetchChampionRaw(championId, { cache, global })
  return {
    champion: normalizeChampion(raw, {
      itemName,
      spellName,
      rank: index >= 0 ? index + 1 : null,
    }),
    meta: {
      gamePatch: global.config.gamePatch,
      dataVersion: global.config.dataVersion,
      generatedAt: global.config.generatedAt,
    },
  }
}

/** 人读质检报告。 */
export function buildReport(snapshot) {
  const champions = Object.values(snapshot.champions).sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
  const count = (predicate) => champions.filter(predicate).length
  const withAugments = count((entry) => entry.augments.length > 0)
  const withCombos = count((entry) => entry.builds.some((build) => build.combos.length > 0))
  const withTrios = count((entry) => entry.trios.length > 0)
  const augmentRows = Object.values(snapshot.augments)
  const lines = [
    '# aramgg 客户端数据 API 抓取报告',
    '',
    `- 数据版本：${snapshot.meta.dataVersion}（游戏 ${snapshot.meta.gamePatch}）`,
    `- 抓取时间：${snapshot.meta.crawledAt}`,
    `- 英雄 ${champions.length} / 强化 ${augmentRows.length} / 物品 ${Object.keys(snapshot.items).length}`,
    `- 有强化榜 ${withAugments}/${champions.length}；有核心三件套 ${withCombos}/${champions.length}；有三强化组合 ${withTrios}/${champions.length}`,
    '',
    '## 抽查',
    '',
  ]
  for (const name of ['提莫', '亚索', '阿狸']) {
    const champion = champions.find((entry) => entry.name === name)
    if (!champion) continue
    const top = champion.augments
      .slice(0, 3)
      .map(([id, rank, tier, winRate]) => {
        const augment = snapshot.augments[id]
        const rate = winRate == null ? '—' : `${(Number(winRate) * 100).toFixed(1)}%`
        return `${augment?.name ?? id}(#${rank} T${tier} ${rate})`
      })
      .join('、')
    const combo = champion.builds[0]?.combos[0]?.[0]?.join('+') ?? '无'
    lines.push(`- ${champion.name}：T${champion.tier} 胜率 ${champion.winRate}｜Top3 强化：${top}｜首套：${combo}`)
  }
  lines.push(
    '',
    `- 强化缺胜率 ${augmentRows.filter((entry) => !entry.stats?.winRate).length} 条；缺说明 ${augmentRows.filter((entry) => !entry.description).length} 条`,
  )
  return `${lines.join('\n')}\n`
}

async function main() {
  const args = process.argv.slice(2)
  const readFlag = (name, fallback) => {
    const index = args.indexOf(`--${name}`)
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback
  }
  const limit = readFlag('limit') ? Number(readFlag('limit')) : undefined
  const out = readFlag('out', join(PLUGIN_ROOT, 'data', 'snapshot.json'))
  const quiet = args.includes('--quiet')
  if (!quiet) console.log('[crawl] 读取 aramgg 客户端数据 API…')
  const started = Date.now()
  const snapshot = await buildSnapshot({
    limit,
    onProgress: quiet
      ? undefined
      : (done, total) => {
          if (done % 25 === 0 || done === total) console.log(`[crawl] 英雄详情 ${done}/${total}`)
        },
  })
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(snapshot))
  writeFileSync(join(dirname(out), 'report.md'), buildReport(snapshot))
  console.log(
    `[crawl] 完成：${snapshot.meta.championCount} 英雄 / ${snapshot.meta.augmentCount} 强化 / ` +
      `${Object.keys(snapshot.items).length} 物品，版本 ${snapshot.meta.dataVersion}，` +
      `${((Date.now() - started) / 1000).toFixed(1)}s\n[crawl] 输出 ${out}`,
  )
}

const isMain =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href
if (isMain) {
  main().catch((error) => {
    console.error(`[crawl] 失败：${error instanceof Error ? error.stack ?? error.message : String(error)}`)
    process.exit(1)
  })
}
