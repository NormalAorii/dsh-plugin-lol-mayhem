/**
 * dsh-plugin-lol-mayhem / live
 *
 * 在线刷新：复用 `scripts/crawl.mjs` 的 API 抓取，把单个英雄或全站字典增量写进
 * 运行时快照（DSH_HOME/plugin-data/dsh-plugin-lol-mayhem/snapshot.json），
 * 不改插件包内的 data/snapshot.json。数据源响应快（单英雄 ~0.5s），无需长等待。
 * 无第三方依赖。
 * @module dsh-plugin-lol-mayhem/live
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { getStore, invalidate, runtimeDir } from './store.js'

let crawlModule

/** 懒加载抓取模块；缺文件时给出可操作的中文提示。 */
export async function loadCrawl() {
  if (crawlModule !== undefined) return crawlModule
  try {
    crawlModule = await import('../scripts/crawl.mjs')
  } catch (error) {
    crawlModule = null
    throw new Error(
      `在线刷新不可用（插件缺少 scripts/crawl.mjs）：${error instanceof Error ? error.message : String(error)}。` +
        '可以改用 npm run crawl 在插件目录离线更新 data/snapshot.json。',
    )
  }
  return crawlModule
}

/** 运行时快照路径。 */
export function snapshotFile() {
  return path.join(runtimeDir(), 'snapshot.json')
}

/** 取当前快照的原始 JSON（store.snapshot 是展开后的视图，不能回写）。 */
function rawBase(store) {
  const file = store?.meta?.().sourceFile
  if (file && existsSync(file)) {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8'))
      if (raw && typeof raw === 'object') return raw
    } catch {
      /* 落空到空快照 */
    }
  }
  const runtime = snapshotFile()
  if (existsSync(runtime)) {
    try {
      return JSON.parse(readFileSync(runtime, 'utf8'))
    } catch {
      /* 落空 */
    }
  }
  return { schemaVersion: 2, meta: {}, champions: {}, augments: {}, items: {}, spells: {} }
}

function persist(snapshot) {
  mkdirSync(runtimeDir(), { recursive: true })
  const file = snapshotFile()
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(snapshot), 'utf8')
  renameSync(tmp, file)
  invalidate()
  return file
}

function touchMeta(snapshot, patch) {
  snapshot.schemaVersion = 2
  snapshot.meta = {
    ...(snapshot.meta ?? {}),
    source: 'aramgg 官方客户端数据 API',
    locale: 'zh-CN',
    patch: patch.gamePatch ?? snapshot.meta?.patch,
    gamePatch: patch.gamePatch ?? snapshot.meta?.gamePatch,
    dataVersion: patch.dataVersion ?? snapshot.meta?.dataVersion,
    crawledAt: new Date().toISOString(),
    crawledAtMs: Date.now(),
    partial: false,
  }
}

/**
 * 在线刷新单个英雄：拉该英雄最新数据 → 合并进运行时快照。
 * @param {{id: number, name?: string}} champion store.findChampion 的返回值
 * @returns {Promise<{id:number, name:string|undefined, augments:number, builds:number, trios:number, file:string}>}
 */
export async function refreshChampion(champion) {
  if (!champion || !Number.isFinite(Number(champion.id))) throw new Error('没有找到要刷新的英雄')
  const store = getStore()
  const crawl = await loadCrawl()
  if (typeof crawl.refreshChampion !== 'function') {
    throw new Error('在线刷新不可用：scripts/crawl.mjs 没有导出 refreshChampion')
  }
  const { champion: fresh, meta } = await crawl.refreshChampion(champion.id)
  if (!fresh || !fresh.id) throw new Error(`抓取「${champion.name}」数据失败：返回结构异常`)

  const snapshot = rawBase(store)
  snapshot.champions = snapshot.champions ?? {}
  snapshot.champions[fresh.id] = fresh
  touchMeta(snapshot, meta ?? {})
  snapshot.meta.championCount = Object.keys(snapshot.champions).length
  const file = persist(snapshot)
  return {
    id: Number(fresh.id),
    name: fresh.name ?? champion.name,
    augments: (fresh.augments ?? []).length,
    builds: (fresh.builds ?? []).length,
    trios: (fresh.trios ?? []).length,
    file,
  }
}

/**
 * 在线刷新全站字典：强化中文名/稀有度/效果说明 + 物品名 + 召唤师技能。
 * @returns {Promise<{augments:number, items:number, spells:number, dataVersion:string|undefined, file:string}>}
 */
export async function refreshLibrary() {
  const store = getStore()
  const crawl = await loadCrawl()
  if (typeof crawl.fetchGlobal !== 'function' || typeof crawl.normalizeAugmentLibrary !== 'function') {
    throw new Error('在线刷新不可用：scripts/crawl.mjs 缺少 fetchGlobal / normalizeAugmentLibrary')
  }
  const global = await crawl.fetchGlobal()
  const augments = crawl.normalizeAugmentLibrary(global.augments)
  const count = Object.keys(augments).length
  if (count === 0) throw new Error('强化字典返回为空，可能接口改版，请稍后再试')

  const snapshot = rawBase(store)
  snapshot.augments = { ...(snapshot.augments ?? {}), ...augments }
  snapshot.items = Object.fromEntries((global.items.data ?? []).map((item) => [Number(item.id), item.name]))
  snapshot.spells = Object.fromEntries((global.spells.data ?? []).map((spell) => [Number(spell.id), spell.name]))
  touchMeta(snapshot, {
    gamePatch: global.config?.gamePatch,
    dataVersion: global.config?.dataVersion,
  })
  snapshot.meta.augmentCount = Object.keys(snapshot.augments).length
  snapshot.meta.itemCount = Object.keys(snapshot.items).length
  const file = persist(snapshot)
  return {
    augments: count,
    items: Object.keys(snapshot.items).length,
    spells: Object.keys(snapshot.spells).length,
    dataVersion: global.config?.dataVersion,
    file,
  }
}
