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
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import Schema from '@deepseek-ai/schemastery'

/** 带时间戳的日志：DSH 终端里插件输出没时间，排查时对不上先后顺序。 */
function plog(level, ...args) {
  const t = new Date().toTimeString().slice(0, 8)
  const fn = typeof console[level] === 'function' ? console[level] : console.info
  fn.call(console, `[${t}]`, ...args)
}

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
      // wheel 解出来的 exe 版本号随 imageio-ffmpeg 变，别写死文件名；
      // 只要 binaries 目录在就行，具体用哪个 exe 由 bundledFfmpegCandidates() 去 glob。
      probe: join(home, 'versatileds', 'ffmpeg', 'imageio_ffmpeg', 'binaries'),
      hint: 'B站 抓帧和表情包缩图要用',
      // 优先走 PyPI 镜像的 imageio-ffmpeg wheel（里面就是同一个 exe），下载失败才用 vendor 自带包
      wheel: true,
      // PyPI wheel 拿不到时的备选：GitHub 上的 Windows 预编译包，走 gh-proxy 镜像（国内能下）
      urls: [
        'https://gh-proxy.com/https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
      ],

      wheelJson: 'https://pypi.tuna.tsinghua.edu.cn/pypi/imageio-ffmpeg/json',
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
      plog('warn', `[dsh-versatileds-plugin] ${dep.name} 查 wheel 地址失败：${err?.message ?? err}`)
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
        // Expand-Archive 只认 .zip 后缀，wheel 内容其实就是 zip，存成 .zip 才能解
        const tmpZip = join(dep.target, '_download.zip')
        writeFileSync(tmpZip, buf)
        const q = (s) => String(s).replace(/'/g, "''")
        spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
          `Expand-Archive -LiteralPath '${q(tmpZip)}' -DestinationPath '${q(dep.target)}' -Force`],
        { stdio: 'ignore', timeout: 300_000 })
        try { unlinkSync(tmpZip) } catch { /* ignore */ }
      } else if (/\.zip$/i.test(String(url))) {
        // GitHub 预编译 zip（BtbN/FFmpeg-Builds）：解压后把 bin/ffmpeg.exe 收成统一名字，
        // 让 probe 和 bundledFfmpegCandidates() 都能找到。
        mkdirSync(dep.target, { recursive: true })
        const binDir = join(dep.target, 'imageio_ffmpeg', 'binaries')
        const tmpZip = join(dep.target, '_dep_download.zip')
        const tmpDir = join(dep.target, '_dep_unzip')
        writeFileSync(tmpZip, buf)
        const q = (s) => String(s).replace(/'/g, "''")
        const uz = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
          `Expand-Archive -LiteralPath '${q(tmpZip)}' -DestinationPath '${q(tmpDir)}' -Force; ` +
          `$exe = Get-ChildItem -LiteralPath '${q(tmpDir)}' -Recurse -Filter 'ffmpeg.exe' | Select-Object -First 1; ` +
          `if ($exe) { New-Item -ItemType Directory -Force -Path '${q(binDir)}' | Out-Null; ` +
          `Copy-Item $exe.FullName '${q(join(binDir, 'ffmpeg-win-x86_64-v7.1.exe'))}' -Force } else { Write-Error 'ffmpeg.exe not found' }`,
        ], { encoding: 'utf8', timeout: 1_200_000 })
        if (!existsSync(dep.probe)) {
          plog('warn', `[dsh-versatileds-plugin] ${dep.name} zip 解压后没找到 ${dep.probe}（exit ${uz.status}）${String(uz.stderr || '').trim().slice(0, 200)}`)
        }
        try { unlinkSync(tmpZip) } catch { /* ignore */ }
        if (!existsSync(dep.probe)) {
          plog('warn', `[dsh-versatileds-plugin] ${dep.name} wheel 解压后没找到 ${dep.probe}`)
        }
      } else {
        mkdirSync(dirname(dep.probe), { recursive: true })
        writeFileSync(dep.probe, buf)
      }
      if (existsSync(dep.probe)) return { ok: true, why: '' }
      throw new Error('写完还是找不到探针')
    } catch (err) {
      plog('warn', `[dsh-versatileds-plugin] ${dep.name} 下载失败（${String(url).split('/')[2]}）：${err?.message ?? err}`)
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
    plog('info', `[dsh-versatileds-plugin] 版本 v${VERSION || 'unknown'}`)
  }

  // 自检 + 缺失时先下载、下载不行再从自带包解压：后台跑，不挡插件启动
  for (const dep of depSpecs(home)) {
    if (existsSync(dep.probe)) {
      if (firstBoot) plog('info', `[dsh-versatileds-plugin] 依赖就绪：${dep.name}`)
      continue
    }
    plog('info', `[dsh-versatileds-plugin] 依赖缺失：${dep.name}，后台下载中…`)
    setTimeout(async () => {
      try {
        const got = await downloadDep(dep)
        if (got.ok) {
          plog('info', `[dsh-versatileds-plugin] 依赖已下载：${dep.name}`)
          return
        }
        plog('info', `[dsh-versatileds-plugin] ${dep.name} 下载不可用（${got.why}），退回自带包`)
        const r = extractDep(dep)
        if (r.ok) plog('info', `[dsh-versatileds-plugin] 依赖已解压：${dep.name}`)
        else {
          plog('warn', `[dsh-versatileds-plugin] 依赖 ${dep.name} 初始化失败：${r.why}（${dep.hint}）`)
          // ffmpeg 起不来，B站 的抓帧/缩图全废，直接把 B站 模块关掉，别让它半残地跑
          if (dep.name === 'ffmpeg') {
            try { config.bili.enabled.set(false) } catch { /* 老框架没有 set 就算了 */ }
            plog('warn', '[dsh-versatileds-plugin] ffmpeg 不可用，B站 模块已自动关闭（放好 ffmpeg 后重新启用即可）')
          }
        }
      } catch (err) {
        plog('warn', `[dsh-versatileds-plugin] 依赖 ${dep.name} 初始化异常：${err?.message ?? err}`)
      }
    }, 500)
  }

  applyBili(ctx, config.bili)
  applyQq(ctx, config.qq)
}
