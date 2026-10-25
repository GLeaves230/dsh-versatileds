/**
 * dsh-versatileds-plugin — 多功能DS插件。
 *
 * 把原来的 B站 插件与 QQ 插件合成一个插件，两套能力各自保持原来的工具名、
 * 配置项与行为，只是挂到同一个条目下：
 *
 * - `bili` 工具 + `biliAgent` 服务（B站 模块）
 * - `qq` 工具 + 自动回复 / 主动搭话（QQ 模块）
 *
 * Config 分成 `bili` / `qq` 两块，各自的 schema 原样嵌套，所以字段名互不影响；
 * 设置页按「B站模块」「QQ模块」两个选项页展示，点进去就是原来各自的样子。
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import Schema from '@deepseek-ai/schemastery'

import {
  Config as BiliConfig,
  apply as applyBili,
} from './bili/index.js'
import {
  Config as QqConfig,
  apply as applyQq,
} from './qq/index.js'

export const Config = Schema.object({
  bili: BiliConfig,
  qq: QqConfig,
})

export const name = 'versatileds'
export const inject = ['tools']

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)))

/** 当前插件版本：从 package.json 读，改版本只改那一处，别的地方都引用这个。 */
export const VERSION = (() => {
  try {
    return String(JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8')).version || '')
  } catch {
    return ''
  }
})()

/** DSH_HOME：插件所有路径都从这里推，不写死绝对路径。 */
function dshHome() {
  return process.env.DSH_HOME || join(process.env.USERPROFILE || '', '.dsh')
}

const VENDOR = join(PLUGIN_ROOT, 'vendor')

/**
 * 外部依赖：插件自带的包 + 期望落地位置 + 判定就绪的探针文件。
 * 缺失就从 vendor 解压，做到「零外部依赖」。
 */
function depSpecs(home) {
  return [
    {
      name: 'ffmpeg',
      zip: join(VENDOR, 'ffmpeg.zip'),
      // 包里是 imageio_ffmpeg/binaries/...，所以解到 ffmpeg 这一层
      target: join(home, 'tmp', 'live', 'ffmpeg'),
      probe: join(home, 'tmp', 'live', 'ffmpeg', 'imageio_ffmpeg', 'binaries', 'ffmpeg-win-x86_64-v7.1.exe'),
      hint: 'B站 抓帧和表情包缩图要用',
    },
    {
      name: 'memorix',
      zip: join(VENDOR, 'memorix.zip'),
      // 包里是 node_modules/memorix/...，解到 mcp/memorix 这一层
      target: join(home, '..', 'mcp', 'memorix'),
      probe: join(home, '..', 'mcp', 'memorix', 'node_modules', 'memorix', 'dist', 'cli', 'index.js'),
      hint: 'MCP 记忆服务的 CLI',
    },
  ]
}

/** 解压一个依赖包；返回 { ok, why }。 */
function extractDep(dep) {
  if (!existsSync(dep.zip)) return { ok: false, why: `插件里没有 ${basename(dep.zip)}` }
  try {
    mkdirSync(dep.target, { recursive: true })
    const q = (s) => String(s).replace(/'/g, "''")
    const ps = `Expand-Archive -LiteralPath '${q(dep.zip)}' -DestinationPath '${q(dep.target)}' -Force`
    const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { stdio: 'ignore', timeout: 600_000 })
    const ok = existsSync(dep.probe)
    return { ok, why: ok ? '' : `解压后探针仍不存在（exit ${r.status}）` }
  } catch (err) {
    return { ok: false, why: String(err?.message ?? err) }
  }
}

/** 两个模块都只依赖 tools；它们内部通过 ctx.get 读取可选服务。 */
export function apply(ctx, config) {
  const home = dshHome()

  // 启动先把版本打出来：排查问题时一眼知道跑的是哪一版
  console.info(`[dsh-versatileds-plugin] 版本 v${VERSION || 'unknown'}`)

  // 自检 + 缺失时从自带包解压：后台跑，不挡插件启动
  for (const dep of depSpecs(home)) {
    if (existsSync(dep.probe)) {
      console.info(`[dsh-versatileds-plugin] 依赖就绪：${dep.name}`)
      continue
    }
    console.info(`[dsh-versatileds-plugin] 依赖缺失：${dep.name}，后台解压中…`)
    setTimeout(() => {
      try {
        const r = extractDep(dep)
        if (r.ok) console.info(`[dsh-versatileds-plugin] 依赖已解压：${dep.name}`)
        else console.warn(`[dsh-versatileds-plugin] 依赖 ${dep.name} 初始化失败：${r.why}（${dep.hint}）`)
      } catch (err) {
        console.warn(`[dsh-versatileds-plugin] 依赖 ${dep.name} 解压异常：${err?.message ?? err}`)
      }
    }, 500)
  }

  applyBili(ctx, config.bili)
  applyQq(ctx, config.qq)
}
