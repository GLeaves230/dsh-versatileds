/**
 * dsh-versatileds-plugin — 多功能DS插件。
 *
 * 把原来的 B站 插件与 QQ 插件合成一个插件，两套能力各自保持原来的行为，
 * 配置项与行为不变，只是挂到同一个条目下。工具名带插件前缀，避免和别的同类插件撞名：
 *
 * - `versatileds_bili` 工具 + `biliAgent` 服务（B站 模块）
 * - `versatileds_qq` 工具 + 自动回复 / 主动搭话（QQ 模块）
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
 * 缺失时**先按镜像下载**，下载失败再退回 vendor 里的自带包（2026-10-26 主人：能下载就别塞包里）。
 * memorix 已于 2026-10-25 停用（记忆改成 md，主人定的），不再自检也不再解压。
 */
function depSpecs(home) {
  return [
    {
      name: 'ffmpeg',
      zip: join(VENDOR, 'ffmpeg.zip'),
      // 包里是 imageio_ffmpeg/binaries/...，落到 <DSH_HOME>/versatileds/ffmpeg（2026-10-26 主人要求）
      target: join(home, 'versatileds', 'ffmpeg'),
      probe: join(home, 'versatileds', 'ffmpeg', 'imageio_ffmpeg', 'binaries', 'ffmpeg-win-x86_64-v7.1.exe'),
      hint: 'B站 抓帧和表情包缩图要用',
      // 优先走 PyPI 镜像的 imageio-ffmpeg wheel（里面就是同一个 exe），下载失败才用 vendor 自带包
      wheel: true,
      wheelJson: 'https://pypi.tuna.tsinghua.edu.cn/pypi/imageio-ffmpeg/json',
      urls: [],
    },
  ]
}

/** 从镜像下载依赖；返回 { ok, why }。wheel 的（imageio-ffmpeg）下载后解压出 exe。 */
async function downloadDep(dep) {
  const urls = Array.isArray(dep.urls) ? dep.urls.slice() : []
  // wheel 类型：现查 PyPI 镜像的 json，拿 win_amd64 的 wheel 地址（硬写 URL 会被 CDN 换掉）
  if (dep.wheel) {
    try {
      const r = await fetch(dep.wheelJson, { signal: AbortSignal.timeout(30_000) })
      const j = await r.json()
      const u = (j.urls || []).find((x) => /win_amd64\.whl$/.test(String(x.filename || '')))
      if (u?.url) urls.unshift(u.url)
    } catch (err) {
      console.warn(`[dsh-versatileds-plugin] ${dep.name} 查 wheel 地址失败：${err?.message ?? err}`)
    }
  }
  if (!urls.length) return { ok: false, why: '没有下载地址' }
  for (const url of urls) {
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(600_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 1_000_000) throw new Error(`文件太小（${buf.length} 字节）`)
      if (dep.wheel) {
        // wheel 就是个 zip：解到 target，ffmpeg 会落在 imageio_ffmpeg/binaries/ 下
        mkdirSync(dep.target, { recursive: true })
        const tmpZip = join(dep.target, '_download.whl')
        writeFileSync(tmpZip, buf)
        const q = (s) => String(s).replace(/'/g, "''")
        spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
          `Expand-Archive -LiteralPath '${q(tmpZip)}' -DestinationPath '${q(dep.target)}' -Force`],
        { stdio: 'ignore', timeout: 300_000 })
        try { unlinkSync(tmpZip) } catch { /* ignore */ }
      } else {
        mkdirSync(dirname(dep.probe), { recursive: true })
        writeFileSync(dep.probe, buf)
      }
      if (existsSync(dep.probe)) return { ok: true, why: '' }
      throw new Error('写完还是找不到探针')
    } catch (err) {
      console.warn(`[dsh-versatileds-plugin] ${dep.name} 下载失败（${String(url).split('/')[2]}）：${err?.message ?? err}`)
    }
  }
  return { ok: false, why: '所有镜像都失败了' }
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

  // 版本和「依赖就绪」只在进程内第一次打：热重载一次就刷一屏太吵
  const firstBoot = globalThis.__versatiledsBootLogged !== true
  if (firstBoot) {
    globalThis.__versatiledsBootLogged = true
    console.info(`[dsh-versatileds-plugin] 版本 v${VERSION || 'unknown'}`)
  }

  // 自检 + 缺失时先下载、下载不行再从自带包解压：后台跑，不挡插件启动
  for (const dep of depSpecs(home)) {
    if (existsSync(dep.probe)) {
      if (firstBoot) console.info(`[dsh-versatileds-plugin] 依赖就绪：${dep.name}`)
      continue
    }
    console.info(`[dsh-versatileds-plugin] 依赖缺失：${dep.name}，后台下载中…`)
    setTimeout(async () => {
      try {
        const got = await downloadDep(dep)
        if (got.ok) {
          console.info(`[dsh-versatileds-plugin] 依赖已下载：${dep.name}`)
          return
        }
        console.info(`[dsh-versatileds-plugin] ${dep.name} 下载不可用（${got.why}），退回自带包`)
        const r = extractDep(dep)
        if (r.ok) console.info(`[dsh-versatileds-plugin] 依赖已解压：${dep.name}`)
        else console.warn(`[dsh-versatileds-plugin] 依赖 ${dep.name} 初始化失败：${r.why}（${dep.hint}）`)
      } catch (err) {
        console.warn(`[dsh-versatileds-plugin] 依赖 ${dep.name} 初始化异常：${err?.message ?? err}`)
      }
    }, 500)
  }

  applyBili(ctx, config.bili)
  applyQq(ctx, config.qq)
}
