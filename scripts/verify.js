/**
 * dsh-plugin-lol-mayhem / verify
 *
 * 离线自检：数据快照完整性、13 个工具注册与样例输出、内容质量、模糊匹配、PNG 卡片生成。
 * 用法：npm run verify（需要 data/snapshot.json 已生成）。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getStore } from '../lib/store.js'
import { createTools, TOOL_NAMES } from '../lib/tools.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const snapshotPath = path.join(root, 'data', 'snapshot.json')

let pass = 0
let fail = 0
const failures = []

function check(label, condition, detail = '') {
  if (condition) {
    pass += 1
    console.log(`  ✅ ${label}`)
  } else {
    fail += 1
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function section(title) {
  console.log(`\n${title}`)
}

function fakeDefineTool(spec) {
  return spec
}

async function runTool(tools, name, args) {
  const tool = tools.find((entry) => entry.name === name)
  if (!tool) throw new Error(`工具未注册：${name}`)
  const value = await tool.execute(args ?? {})
  return String(value?.text ?? '')
}

async function main() {
  console.log('== dsh-plugin-lol-mayhem 离线自检 ==')

  section('1. 数据快照')
  check('data/snapshot.json 存在', fs.existsSync(snapshotPath))
  if (!fs.existsSync(snapshotPath)) {
    report()
    return
  }
  let raw = null
  try {
    raw = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
    check('快照 JSON 合法', true)
  } catch (error) {
    check('快照 JSON 合法', false, String(error))
  }
  if (!raw) {
    report()
    return
  }
  check('schemaVersion 为 2', Number(raw.schemaVersion) === 2, `实际 ${raw.schemaVersion}`)
  check('英雄数量 173', Object.keys(raw.champions ?? {}).length === 173, `实际 ${Object.keys(raw.champions ?? {}).length}`)
  check('强化数量 218', Object.keys(raw.augments ?? {}).length === 218, `实际 ${Object.keys(raw.augments ?? {}).length}`)
  check('物品数量 ≥300', Object.keys(raw.items ?? {}).length >= 300, `实际 ${Object.keys(raw.items ?? {}).length}`)
  check('meta 含 gamePatch', Boolean(raw.meta?.gamePatch), JSON.stringify(raw.meta ?? {}))

  const store = getStore()
  check('store 已加载快照', Boolean(store.snapshot))
  check('诊断为空', store.diagnostics.length === 0, store.diagnostics.join('；'))

  const timo = store.findChampion('提莫')
  check('找到提莫（id 17）', Number(timo?.id) === 17, `实际 ${timo?.id}`)
  if (timo) {
    const augs = store.topAugments(timo, 6)
    check('提莫强化榜 ≥6 条', augs.length >= 6, `实际 ${augs.length}`)
    check(
      '每条强化含 name/description/winRate',
      augs.every((entry) => entry.name && entry.description && Number(entry.winRate) >= 0),
      JSON.stringify(augs.map((entry) => entry.name)),
    )
    const build = store.bestBuild(timo)
    check('提莫有出装组合', Boolean(build.strongest?.items?.length), JSON.stringify(build.strongest ?? {}))
    check('提莫有首件核心', Boolean(timo.firstItem), String(timo.firstItem))
    check('提莫有三强化组合', store.trioList(timo, 3).length > 0, `实际 ${store.trioList(timo, 3).length}`)
    check('提莫技能加点已推导', Array.isArray(timo.skillOrder) && timo.skillOrder.length >= 3, JSON.stringify(timo.skillOrder))
  }

  section('2. 工具注册')
  const tools = createTools(fakeDefineTool)
  check(`工具数量 ${TOOL_NAMES.length}`, tools.length === TOOL_NAMES.length, `实际 ${tools.length}`)
  for (const name of TOOL_NAMES) {
    const tool = tools.find((entry) => entry.name === name)
    check(`工具 ${name} 已注册且有描述`, Boolean(tool && tool.description && tool.description.length > 10))
    check(`工具 ${name} 输出 schema 合法`, Boolean(tool?.output && tool.output.schema?.type === 'object' && typeof tool.output.render === 'function'))
  }

  section('3. 样例调用')
  const samples = [
    ['lol_help', {}, ['海克斯大乱斗', 'lol_champion']],
    ['lol_champion', { name: '提莫' }, ['提莫', 'Top6', '↳', '最强组合']],
    ['lol_champion', { name: '盲僧' }, ['李青']],
    ['lol_augments', { name: '亚索' }, ['亚索']],
    ['lol_augments', {}, ['强化强度榜']],
    ['lol_augment', { name: '缩小引擎' }, ['缩小引擎', '效果']],
    ['lol_build', { name: '阿狸' }, ['出装']],
    ['lol_build', { name: '提莫', tag: 'AP' }, ['AP']],
    ['lol_trio', { name: '提莫' }, ['三强化组合']],
    ['lol_compare', { first: '提莫', second: '亚索' }, ['对比', '结论']],
    ['lol_tier', { tier: 'T1' }, ['T1']],
    ['lol_fun', { name: '提莫' }, ['整活']],
    ['lol_search', { query: '电耗子' }, ['凯南']],
    ['lol_meta', {}, ['版本']],
  ]
  for (const [name, args, hints] of samples) {
    let output = ''
    try {
      output = await runTool(tools, name, args)
      check(`${name} 输出非空`, output.length > 20, `${output.length} 字`)
      check(`${name} 输出 ≤ 2000 字`, output.length <= 2000, `${output.length} 字`)
      for (const hint of hints) check(`${name} 含「${hint}」`, output.includes(hint))
    } catch (error) {
      check(`${name} 执行成功`, false, String(error))
    }
  }

  section('4. 内容质量')
  const timoText = await runTool(tools, 'lol_champion', { name: '提莫' })
  check('提莫攻略不含未映射物品 (#数字)', !/#\d+/.test(timoText), timoText.match(/#\d+/g)?.join(','))
  check('提莫攻略含 6 条强化说明', (timoText.match(/↳/g) ?? []).length >= 6)
  check('提莫攻略标注数据来源', timoText.includes('aramgg.com'))
  const metaText = await runTool(tools, 'lol_meta', {})
  check('数据版本包含 dataVersion', /16\.21\.\d+/.test(metaText), metaText.slice(0, 120))

  section('5. 模糊匹配')
  const fuzzy = [
    ['瞎子', '李青'],
    ['狐狸', '阿狸'],
    ['电耗子', '凯南'],
    ['提百万', '提莫'],
    ['迅捷斥候', '提莫'],
    ['亚索', '亚索'],
    ['厄斐琉斯', '厄斐琉斯'],
  ]
  for (const [query, expected] of fuzzy) {
    const hit = store.findChampion(query)
    check(`「${query}」→ ${expected}`, hit?.name === expected, `实际 ${hit?.name}`)
  }
  check('「缩小引擎」命中强化', store.findAugment('缩小引擎')?.name === '缩小引擎')
  check('「小蜜蜂」命中强化', Boolean(store.findAugment('小蜜蜂')))

  section('6. PNG 卡片')
  const cardCases = [
    ['champion', { kind: 'champion', name: '提莫' }],
    ['trio', { kind: 'trio', name: '提莫' }],
    ['tier', { kind: 'tier', tier: 'T1' }],
    ['meta', { kind: 'meta' }],
  ]
  for (const [label, args] of cardCases) {
    try {
      const output = await runTool(tools, 'lol_card', args)
      const match = output.match(/[A-Za-z]:\\[^\n]+\.png/)
      check(`${label} 卡片生成`, Boolean(match && fs.existsSync(match[0])), match ? match[0] : output.slice(0, 160))
      if (match && fs.existsSync(match[0])) {
        const size = fs.statSync(match[0]).size
        check(`${label} 卡片体积 > 20KB`, size > 20 * 1024, `${size} B`)
      }
    } catch (error) {
      check(`${label} 卡片生成`, false, String(error))
    }
  }

  report()
}

function report() {
  console.log(`\n== 结果：${pass} 通过 / ${fail} 失败 ==`)
  if (fail > 0) {
    console.log('失败项：')
    for (const item of failures) console.log(` - ${item}`)
    process.exitCode = 1
  } else {
    console.log('全部通过 ✅')
  }
}

main().catch((error) => {
  console.error('自检异常：', error)
  process.exitCode = 1
})
