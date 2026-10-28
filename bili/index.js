/**
 * dsh-versatileds — B站 小号代理插件。
 *
 * 注册一个模型可见的 `versatileds_bili` 工具；开关与频率全部走 Config，
 * DSH 设置页会自动为这个条目生成表单。
 */

import http from 'node:http'
/** 带时间戳的日志（跟主插件一致）。 */
function plog(level, ...args) {
  const t = new Date().toTimeString().slice(0, 8)
  const fn = typeof console[level] === 'function' ? console[level] : console.info
  fn.call(console, `[${t}]`, ...args)
}

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve as resolvePath } from 'node:path'

import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

import { BiliClient, BiliError } from '../lib/bili.js'
import { fetchLiveInfo, grabLiveFrame, grabVideoFrames, parseLiveRoom } from '../lib/live.js'

const COOKIE_KEYS = ['SESSDATA', 'bili_jct', 'buvid3', 'buvid4', 'DedeUserID']

const ACTIONS = [
  'me', 'search', 'video', 'popular', 'feed', 'auto_browse',
  'like', 'coin', 'danmaku', 'comment', 'follow', 'follow_season', 'dm',
  'live', 'live_frame',
]

const WRITE_ACTIONS = new Set(['like', 'coin', 'danmaku', 'comment', 'follow', 'follow_season', 'dm'])

/** 动作 -> 允许开关字段 */
const ENABLERS = {
  like: 'allowLike',
  coin: 'allowCoin',
  danmaku: 'allowDanmaku',
  comment: 'allowComment',
  dm: 'allowDm',
  follow: 'allowFollow',
  follow_season: 'allowFollow',
}

/** 动作 -> 间隔字段 */
const INTERVALS = {
  like: 'likeIntervalSec',
  coin: 'coinIntervalSec',
  danmaku: 'danmakuIntervalSec',
  comment: 'commentIntervalSec',
  dm: 'dmIntervalSec',
  follow: 'followIntervalSec',
  follow_season: 'followIntervalSec',
}

const DESCRIPTION = `B站 小号代理。action 决定动作：
- me：查看登录态（昵称、硬币、等级）
- search：搜视频，参数 keyword
- video：视频详情，参数 bvid；默认会抓几帧画面（frames=false 可关），抓到的帧给出文件路径
  同时上报观看历史（historyReportEnabled 控制），note 可写一句看后感进本地 bili_log.md
- popular：热门视频
- feed：首页推荐流（登录后才有个性化结果）
- like：点赞/取消，参数 bvid，live=true 才执行
- coin：投币，参数 bvid、num（1 或 2）
- danmaku：发弹幕，参数 bvid、text（100 字内）、at（毫秒）
- comment：发评论，参数 bvid、text；at_owner=true 时在开头 @ 主人（名字优先用配置的 ownerName，没填就按 ownerUid 查昵称）
  主动评论的规矩：只在真看过、真有话可说时发，别为了互动而互动；同一条视频最多一条评论，别复读别人的话、别水文；
  at_owner 只在确实值得让主人看到时才传——有最小间隔限制（默认 6 小时），太频繁会被忽略成不带 @。
- follow：关注/取关用户，参数 uid
- follow_season：追番/取消，参数 season_id
- dm：私信，参数 uid、text；uid 留空就发给配置里绑定的主人（ownerUid）
- live：查直播间状态，参数 live_url 可选（留空用插件里配的直播间）
- live_frame：抓一帧直播画面存成 jpg，参数 live_url 可选
- auto_browse：马上自己刷一轮 B站（看推荐、抓帧、记笔记，本命话题才评论），返回这轮看了什么

写操作只有显式传 live=true 才真正发出去；不传只返回将要发送的内容，不落请求。
点赞、投币、弹幕、评论、私信各有独立的开关和最小间隔，在 DSH 设置页的插件配置里调。
被禁用的动作会直接返回「已被配置禁用」，间隔未到会返回还需等待多少秒。

直播只抓画面、不连弹幕。QQ 插件那边填了直播间就用 QQ 的，没填就用本插件里的。`

export const Config = Schema.object({
  enabled: Schema.boolean().default(true).volatile()
    .description('B站 模块启用：关掉后不注册 bili 工具、不抓帧、不提供 biliAgent 服务'),
  allowLike: Schema.boolean().default(true).volatile().description('允许点赞/取消点赞'),
  allowCoin: Schema.boolean().default(true).volatile().description('允许投币'),
  allowDanmaku: Schema.boolean().default(true).volatile().description('允许发弹幕'),
  allowComment: Schema.boolean().default(true).volatile().description('允许发评论'),
  allowDm: Schema.boolean().default(false).volatile().description('允许私信（默认关闭）'),
  allowFollow: Schema.boolean().default(false).volatile().description('允许关注用户、追番（默认关闭）'),
  likeIntervalSec: Schema.number().default(60).volatile().description('两次点赞的最小间隔（秒）'),
  coinIntervalSec: Schema.number().default(3600).volatile().description('两次投币的最小间隔（秒）'),
  danmakuIntervalSec: Schema.number().default(600).volatile().description('两条弹幕的最小间隔（秒）'),
  commentIntervalSec: Schema.number().default(1800).volatile().description('两条评论的最小间隔（秒）'),
  dmIntervalSec: Schema.number().default(600).volatile().description('两条私信的最小间隔（秒）'),
  followIntervalSec: Schema.number().default(3600).volatile().description('两次关注/追番的最小间隔（秒）'),
  perActionGapSec: Schema.number().default(360).volatile().description('同一类动作的最短间隔（秒），对所有写操作生效，0 表示不限制'),
  cookieFile: Schema.string().default('').volatile()
    .description('cookie 文件路径；留空则用 <DSH_HOME>/bili/cookies.json，也可用环境变量'),
  ownerUid: Schema.string().default('').volatile()
    .description('主人账号的 B站 UID；评论里 @ 主人时按它查昵称'),
  ownerName: Schema.string().default('').volatile()
    .description('主人账号的显示名；填了就直接用，不再按 UID 查'),
  liveUrl: Schema.string().default('').volatile()
    .description('默认直播间链接，比如 https://live.bilibili.com/21987615；QQ 侧填了就用 QQ 的'),
  liveEnabled: Schema.boolean().default(false).volatile()
    .description('直播挂起：启用后按间隔自动抓图，关掉就完全不碰直播'),
  liveFrameIntervalSec: Schema.number().default(300).volatile()
    .description('自动抓图的间隔（秒），最小 60'),
  ffmpegPath: Schema.string().default('').volatile()
    .description('ffmpeg 可执行文件路径，抓直播帧用'),
  liveFrameDir: Schema.string().default('').volatile()
    .description('抓到的帧存哪；留空用 <DSH_HOME>/bili/image'),
  videoFrameEnabled: Schema.boolean().default(true).volatile()
    .description('看视频时抓几帧画面：开了才能在 video 里"看到"视频内容'),
  videoFrameCount: Schema.number().default(3).volatile()
    .description('每个视频抓几帧，1~6'),
  videoFrameDir: Schema.string().default('').volatile()
    .description('视频帧存哪；留空用 <DSH_HOME>/bili/frame'),
  historyReportEnabled: Schema.boolean().default(true).volatile()
    .description('看视频时向 B站 上报观看进度，历史记录里才会出现看过的视频'),
  ownerAtMinGapSec: Schema.number().default(21600).volatile()
    .description('评论里 @ 主人的最小间隔（秒），0 不限；默认 6 小时，免得一直 @ 让人烦'),
  autoBrowseEnabled: Schema.boolean().default(true).volatile()
    .description('自动刷 B站：按间隔自己看推荐、抓帧、记笔记；相关视频可以自己评论（不点赞、不投币）'),
  autoBrowseIntervalSec: Schema.number().default(1200).volatile()
    .description('自动刷的间隔（秒），最小 300，默认 20 分钟'),
  autoBrowseCount: Schema.number().default(2).volatile()
    .description('每轮看几条，1~3'),
  autoBrowseComment: Schema.boolean().default(true).volatile()
    .description('自动刷时允许评论：只对大肥鱼 / 鲸鱼娘 / AI 角色相关的视频评，一条一条来，不水文'),
  autoBrowseNotify: Schema.boolean().default(true).volatile()
    .description('刷完用「分享视频」的形式发给主人（跟自动分享同一个样式，但不受自动分享开关影响；需要 QQ 模块启用）'),
  autoBrowseTopics: Schema.string()
    .default('大肥鱼,鲸鱼娘,鲸鱼,deepseek,DSH,AI 角色,ai娘,AI少女,人机恋,赛博')
    .volatile()
    .description('自动刷时哪些话题可以评论：逗号分隔的关键词，命中标题/简介/UP/标签就评；留空表示都不评'),
  autoBrowseCommentStyle: Schema.string()
    .default('写一条像真人发的评论：一两句，说具体看到的内容或感受，不夸空话、不刷屏、不用「首先」「总之」，不带话题标签，不超过 60 字。只输出评论正文。')
    .volatile()
    .description('自动评论怎么写：给模型的指令，默认是「一两句、说具体的、不水文」'),
  autoBrowseProvider: Schema.string().default('deepseek-account').volatile()
    .description('自动刷挑片用的模型路由（DSH 的 llm provider）'),
  autoBrowseModel: Schema.string().default('deepseek-flash').volatile()
    .description('自动刷挑片用的模型名'),
})

class GuardError extends Error {}

class Guard {
  constructor(config) {
    this.config = config
    this.last = new Map()
  }

  /** 某类动作实际生效的间隔（秒）：自身最小间隔和通用下限取更严格的那个。 */
  effectiveInterval(action) {
    const key = INTERVALS[action]
    const own = key ? Number(this.config[key].get() ?? 0) : 0
    const gap = Number(this.config.perActionGapSec.get() ?? 0)
    return Math.max(own, gap)
  }

  check(action) {
    const flag = ENABLERS[action]
    if (flag && this.config[flag].get() === false) {
      throw new GuardError(`${action} 已被配置禁用（${flag}=false）`)
    }

    const interval = this.effectiveInterval(action)
    const now = Date.now()
    const last = this.last.get(action) ?? 0
    if (interval > 0 && last > 0 && now - last < interval * 1000) {
      const wait = Math.ceil((interval * 1000 - (now - last)) / 1000)
      throw new GuardError(`${action} 间隔未到，约 ${wait} 秒后再试（配置 ${interval}s）`)
    }

    this.last.set(action, now)
  }

  remaining(action) {
    const interval = this.effectiveInterval(action)
    const last = this.last.get(action) ?? 0
    if (!interval || !last) return 0
    const left = Math.ceil((interval * 1000 - (Date.now() - last)) / 1000)
    return left > 0 ? left : 0
  }

  skip(action) {
    this.last.delete(action)
  }

  snapshot() {
    const out = {}
    for (const action of Object.keys(INTERVALS)) out[action] = this.remaining(action)
    return out
  }
}

const STATUS_PORT = 18765

/** 插件加载时刻：自动刷 / 直播还没跑过时，倒计时从这儿开始算（跟着上级开关走）。 */
const startedAt = Date.now()

/** 直播抓帧的上次时间：模块级，定时器和状态接口共用。everRan 用来区分「没跑过」和「被跳过」。 */
const liveFrameState = { lastAt: 0, everRan: false }

/** 自动刷状态文件路径（模块级，状态接口自包含，不依赖 apply 里的函数）。 */
function autoStateFile() {
  return join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'versatileds', 'bilibili', 'auto_browse.json')
}

/** 读自动刷状态对象；文件不存在或坏了返回 null（用来区分「从没跑过」和「被跳过」）。 */
function readAutoState() {
  try {
    const data = JSON.parse(readFileSync(autoStateFile(), 'utf8'))
    return data && typeof data === 'object' ? data : null
  } catch {
    return null
  }
}

/** 读上次自动刷时间；读不到就当 0。 */
function readAutoLastRun() {
  try {
    const data = JSON.parse(readFileSync(autoStateFile(), 'utf8'))
    return Number(data?.lastRunAt || 0)
  } catch {
    return 0
  }
}

/** 跳过时把上次自动刷时间清零。 */
function clearAutoLastRun() {
  try {
    let data = {}
    try { data = JSON.parse(readFileSync(autoStateFile(), 'utf8')) || {} } catch { data = {} }
    data.lastRunAt = 0
    mkdirSync(dirname(autoStateFile()), { recursive: true })
    writeFileSync(autoStateFile(), JSON.stringify(data), 'utf8')
  } catch { /* ignore */ }
}

/** 给设置页轮询冷却状态用的小接口，只监听本机。 */
function startStatusServer(guard, config, biliClient) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (url.pathname === '/account') {
      // B站 账号状态（设置页「账号状态」用，走 lib 的 me()，2026-10-28）
      let loggedIn = false
      let uid = ''
      let name = ''
      let level = 0
      let exp = 0
      let nextExp = 0
      try {
        const nav = await biliClient.me()
        loggedIn = nav?.isLogin === true
        uid = String(nav?.mid || '')
        name = String(nav?.uname || '')
        level = Number(nav?.level_info?.current_level || 0)
        exp = Number(nav?.level_info?.current_exp || 0)
        nextExp = Number(nav?.level_info?.next_exp || 0)
      } catch {
        // 网络/接口失败时退回只看有没有 cookie
        try {
          const ck = JSON.parse(readFileSync(cookiePath(config), 'utf8'))
          loggedIn = Boolean(ck && (ck.SESSDATA || ck.sessData))
          uid = String(ck?.DedeUserID || ck?.uid || '')
        } catch { /* 未登录 */ }
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify({ loggedIn, uid, name, level, exp, nextExp }))
      return
    }
    if (url.pathname === '/cooldowns') {
      const now = Date.now()
      const out = guard.snapshot()
      // 自动刷和直播抓帧不是写操作，走的不是 Guard，单独算剩余时间
      // 约定：状态文件不存在 = 从没跑过（从插件加载算起）；文件里 lastRunAt=0 = 被跳过（立刻到期）
      const autoOn = config.autoBrowseEnabled.get() === true
      const autoInterval = Math.max(300, Number(config.autoBrowseIntervalSec.get() ?? 1200))
      const autoSt = readAutoState()
      if (!autoOn) {
        out.autoBrowse = 0
      } else if (!autoSt) {
        out.autoBrowse = Math.max(0, Math.ceil((startedAt + autoInterval * 1000 - now) / 1000))
      } else {
        const last = Number(autoSt.lastRunAt || 0)
        out.autoBrowse = last
          ? Math.max(0, Math.ceil((last + autoInterval * 1000 - now) / 1000))
          : 0
      }
      const liveOn = config.liveEnabled.get() === true
      const liveInterval = Math.max(60, Number(config.liveFrameIntervalSec.get() ?? 300))
      const liveBase = liveFrameState.lastAt || (liveFrameState.everRan ? 0 : startedAt)
      out.liveFrame = liveOn
        ? Math.max(0, Math.ceil((liveBase + liveInterval * 1000 - now) / 1000))
        : 0
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(out))
      return
    }
    if (url.pathname === '/skip') {
      const action = url.searchParams.get('action')
      if (action === 'autoBrowse') {
        clearAutoLastRun()
      } else if (action === 'liveFrame') {
        liveFrameState.lastAt = 0
        liveFrameState.everRan = true
      } else if (action) {
        guard.skip(action)
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true }))
      return
    }
    res.writeHead(404)
    res.end()
  })
  server.on('error', () => {})
  server.listen(STATUS_PORT, '127.0.0.1')
  return () => { try { server.close() } catch { /* ignore */ } }
}

function cookiePath(config) {
  const custom = config.cookieFile.get()
  if (custom) return resolvePath(custom)
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'versatileds', 'bilibili', 'cookies.json')
}

function liveFramePath(config) {
  const custom = String(config.liveFrameDir.get() || '').trim()
  if (custom) return /\.(jpg|jpeg|png)$/i.test(custom) ? custom : join(custom, 'latest.jpg')
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  // 抓图归 B站 插件自己，放在它的 image 子目录里
  return join(home, 'versatileds', 'bilibili', 'image', 'latest.jpg')
}

/** 视频帧目录：每次抓帧按 bvid 命名，和直播帧分开存。 */
function videoFrameDir(config) {
  const custom = String(config.videoFrameDir.get() || '').trim()
  if (custom) return custom
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'versatileds', 'bilibili', 'frame')
}

/** 「上次在评论里 @ 主人」的时间戳，用来卡 @ 的频率。 */
function ownerAtStatePath() {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'versatileds', 'bilibili', 'owner_at.json')
}

function loadOwnerAt() {
  try {
    const data = JSON.parse(readFileSync(ownerAtStatePath(), 'utf8'))
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

function saveOwnerAt(state) {
  try {
    mkdirSync(dirname(ownerAtStatePath()), { recursive: true })
    writeFileSync(ownerAtStatePath(), JSON.stringify(state, null, 2), 'utf8')
  } catch { /* ignore */ }
}

function loadCookies(config) {
  const fromEnv = {}
  for (const key of COOKIE_KEYS) {
    if (process.env[key]) fromEnv[key] = process.env[key]
  }
  if (Object.keys(fromEnv).length > 0) return fromEnv

  const file = cookiePath(config)
  if (existsSync(file)) {
    try {
      const data = JSON.parse(readFileSync(file, 'utf8'))
      return Object.fromEntries(
        COOKIE_KEYS.filter((k) => data[k]).map((k) => [k, String(data[k])]),
      )
    } catch {
      return {}
    }
  }
  return {}
}

function fmtVideo(v) {
  const stat = v.stat || {}
  const dur = v.duration || 0
  return [
    `${v.bvid} | ${v.title}`,
    `  UP: ${v.owner?.name ?? ''} | ${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}` +
      ` | 播放 ${stat.view ?? '-'} 赞 ${stat.like ?? '-'} 币 ${stat.coin ?? '-'} 弹幕 ${stat.danmaku ?? '-'}`,
  ].join('\n')
}

/** search/type 的字段和视频详情不同：author / play / duration 是字符串，没有 stat。 */
function fmtSearchItem(v) {
  const title = String(v.title || '').replace(/<[^>]+>/g, '')
  return [
    `${v.bvid} | ${title}`,
    `  UP: ${v.author ?? ''} | ${v.duration ?? '0:00'} | 播放 ${v.play ?? '-'} 弹幕 ${v.video_review ?? '-'}`,
  ].join('\n')
}

function ok(text) {
  return typeof text === 'string' ? text : JSON.stringify(text, null, 2)
}

export const name = 'bili-agent'
export const inject = ['tools']

export function apply(ctx, config) {
  const client = new BiliClient({ cookies: loadCookies(config), dryRun: false })
  const guard = new Guard(config)

  ctx.effect(() => {
    const stop = startStatusServer(guard, config, client)
    return () => { stop?.() }
  }, 'dsh-versatileds: cooldown status server')

  // 看过的视频统一记到共享的 bili_log.md，不管调用方是 QQ 还是别的会话
  const logSeen = (bvid, title, owner, note) => {
    try {
      const dir = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'versatileds', 'qq')
      mkdirSync(dir, { recursive: true })
      const time = new Date().toLocaleString('zh-CN', { hour12: false })
      const extra = String(note || '').trim().replace(/\s+/g, ' ')
      appendFileSync(join(dir, 'bili_log.md'),
        `- ${time} 看了 ${bvid}：${title}（${owner || ''}）${extra ? `｜笔记：${extra}` : ''}\n`, 'utf8')
    } catch { /* ignore */ }
  }

  // ---------- 自动刷 B站 ----------
  /** 自动刷的状态：上次跑的时间、评论过的 bvid。 */
  const autoStatePath = () => join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'versatileds', 'bilibili', 'auto_browse.json')

  function loadAutoState() {
    try {
      const data = JSON.parse(readFileSync(autoStatePath(), 'utf8'))
      return data && typeof data === 'object' ? data : {}
    } catch {
      return {}
    }
  }

  function saveAutoState(state) {
    try {
      mkdirSync(dirname(autoStatePath()), { recursive: true })
      writeFileSync(autoStatePath(), JSON.stringify(state, null, 2), 'utf8')
    } catch { /* ignore */ }
  }

  /** bili_log 里出现过的 bvid：自动刷不重复看。 */
  function seenBvids() {
    try {
      const dir = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'versatileds', 'qq')
      const text = readFileSync(join(dir, 'bili_log.md'), 'utf8')
      return new Set([...text.matchAll(/BV[0-9A-Za-z]{10}/g)].map((m) => m[0]))
    } catch {
      return new Set()
    }
  }

  /** 自动刷的调试日志：写到 <DSH_HOME>/bili/auto_browse.log。 */
  const debugLog = (line) => {
    try {
      const dir = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'versatileds', 'bilibili')
      mkdirSync(dir, { recursive: true })
      appendFileSync(join(dir, 'auto_browse.log'),
        `- ${new Date().toLocaleString('zh-CN', { hour12: false })} ${line}\n`, 'utf8')
    } catch { /* ignore */ }
  }

  /** 调 DSH 的 llm 服务要一段文本（插件内直接调，不用 API key、也不开 DSH 会话）。 */
  async function askModel(prompt, maxTokens = 700, temperature = 0.7) {
    const llm = ctx.get && ctx.get('llm')
    if (!llm || typeof llm.stream !== 'function') return ''
    let out = ''
    try {
      for await (const chunk of llm.stream({
        provider: String(config.autoBrowseProvider.get() || 'deepseek-account'),
        model: String(config.autoBrowseModel.get() || 'deepseek-flash'),
        messages: [{ role: 'user', content: [{ type: 'text', text: String(prompt) }] }],
        maxTokens,
        temperature,
        signal: AbortSignal.timeout(60_000),
      })) {
        if (chunk?.type === 'text-delta' && chunk.text) out += chunk.text
        else if (chunk?.type === 'block-end' && chunk.block?.type === 'text' && !out) out = chunk.block.text
      }
    } catch (err) {
      debugLog(`llm fail: ${err?.message ?? err}`)
      return ''
    }
    return out.trim()
  }

  /** 从模型回答里抠出 JSON（可能带 ```json 包裹）。 */
  function parseJson(text) {
    const t = String(text || '').replace(/```(?:json)?/gi, '').trim()
    const start = t.indexOf('{')
    const end = t.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      return JSON.parse(t.slice(start, end + 1))
    } catch {
      return null
    }
  }

  /** 命中「可评话题」的哪个关键词（关键词在设置里改）；没命中返回空串。 */
  function topicHitOf(v) {
    const words = String(config.autoBrowseTopics.get() || '')
      .split(/[,，\s]+/)
      .map((w) => w.trim())
      .filter(Boolean)
    if (!words.length) return ''
    const tags = Array.isArray(v?.tags) ? v.tags.map((t) => (typeof t === 'string' ? t : (t?.tag_name || ''))).join(' ') : ''
    const hay = `${v?.title || ''} ${v?.desc || ''} ${v?.owner?.name || ''} ${tags}`.toLowerCase()
    return words.find((w) => hay.includes(w.toLowerCase())) || ''
  }

  /** 只对命中「可评话题」关键词的视频自动评论（默认是大肥鱼 / 鲸鱼娘 / AI 角色那类）。 */
  function isOwnTopic(v) {
    return Boolean(topicHitOf(v))
  }

  let autoRunning = false

  /** 刷一轮：推荐 → 挑 1~2 条 → 看（抓帧 + 笔记）→ 本命话题才评论 → 汇报主人。 */
  async function autoBrowseOnce(trigger = 'tick') {
    if (autoRunning) return { ok: false, reason: '上一轮还没跑完' }
    autoRunning = true
    try {
      const want = Math.min(3, Math.max(1, Number(config.autoBrowseCount.get() ?? 2)))
      const seen = seenBvids()
      let list = []
      try { list = (await client.feed(14)) || [] } catch { list = [] }
      if (list.filter((it) => it.bvid).length < 3) {
        try { list = list.concat((await client.popular(12)) || []) } catch { /* ignore */ }
      }
      const fresh = list
        .filter((it) => it && it.bvid)
        .filter((it, i, arr) => arr.findIndex((x) => x.bvid === it.bvid) === i)
        .filter((it) => !seen.has(it.bvid))
        .slice(0, 12)
      if (!fresh.length) return { ok: false, reason: '没新视频' }

      const menu = fresh.map((v, i) => `${i + 1}. ${v.bvid} | ${v.title} | ${v.owner?.name ?? ''}`).join('\n')
      const answer = await askModel(
        `你在刷 B站 首页推荐。下面是候选，挑 ${want} 条你真感兴趣的：优先画画、动画、AI、国创、AI 角色二创；不要军事、时政、社会新闻、财经、真人八卦、怀旧剧、引战争议。每条写一句口语化的看后感（10~30 字，像跟朋友聊天，不用句号结尾，别只写标题）。必须给满 ${want} 条，每条都要有 note。\n\n${menu}\n\n只输出 JSON：{"picks":[{"index":1,"note":"..."}]}`,
        700,
        0.8,
      )
      debugLog(`pick answer len=${String(answer || '').length} text=${String(answer || '').replace(/\s+/g, ' ').slice(0, 200)}`)
      const plan = parseJson(answer)
      let picks = Array.isArray(plan?.picks)
        ? plan.picks.filter((p) => p && Number.isFinite(Number(p.index)))
        : []
      if (!picks.length) {
        // JSON 没解析出来就按字段抠，别整轮白跑
        const re = /"index"\s*:\s*(\d+)\s*,\s*"note"\s*:\s*"([^"]*)"/g
        let m
        while ((m = re.exec(String(answer || '')))) picks.push({ index: Number(m[1]), note: m[2] })
      }
      if (!picks.length) picks = [{ index: 1, note: '' }]
      // 不够 want 条就按候选顺序补（优先偏好话题），保证这轮不只看一条
      const chosen = new Set(picks.map((p) => Number(p.index) - 1))
      const prefer = /(画画|绘画|动画|手书|AI|国创|二创|原创|oc|OC|meme|梗|模型|渲染|大肥鱼|鲸鱼)/
      const rest = fresh
        .map((v, i) => ({ v, i }))
        .filter(({ i }) => !chosen.has(i))
        .sort((a, b) => Number(prefer.test(b.v.title || '')) - Number(prefer.test(a.v.title || '')))
      for (const { i } of rest) {
        if (picks.length >= want) break
        picks.push({ index: i + 1, note: '' })
      }

      const results = []
      for (const pick of picks.slice(0, want)) {
        const v = fresh[Number(pick?.index) - 1] || fresh[0]
        if (!v?.bvid) continue
        try {
          const info = await client.video(v.bvid)
          const note = String(pick?.note || '').trim().slice(0, 60) || `看了《${String(info.title || '').slice(0, 30)}》`
          logSeen(v.bvid, info.title, info.owner?.name, note)

          let frameCount = 0
          if (config.videoFrameEnabled.get() === true) {
            try {
              const play = await client.playUrl(v.bvid)
              const got = grabVideoFrames({
                bvid: v.bvid,
                url: play.url,
                duration: play.duration || info.duration,
                ffmpeg: String(config.ffmpegPath.get() || '').trim(),
                outDir: videoFrameDir(config),
                count: Number(config.videoFrameCount.get() ?? 3),
              })
              frameCount = got.ok ? got.files.length : 0
            } catch { /* 抓不到不影响 */ }
          }

          if (config.historyReportEnabled.get() !== false) {
            try {
              const duration = Number(info.duration || 0)
              await client.reportHistory(v.bvid, {
                progress: Math.max(1, Math.floor(duration * 0.15)),
                info,
              })
            } catch { /* ignore */ }
          }

          debugLog(`watch ${v.bvid} topic=${topicHitOf(info) || '-'} commentOn=${config.autoBrowseComment.get() === true} allow=${config.allowComment.get() !== false}`)
          let commented = ''
          let commentIssue = ''
          if (config.autoBrowseComment.get() === true && config.allowComment.get() !== false && isOwnTopic(info)) {
            const state = loadAutoState()
            const done = new Set(Array.isArray(state.commented) ? state.commented : [])
            let canComment = true
            try { guard.check('comment') } catch { canComment = false }
            if (canComment && !done.has(v.bvid)) {
              const styleHint = String(config.autoBrowseCommentStyle.get() || '').trim()
              const draft = await askModel(
                `你刚看完这条 B站 视频：《${info.title}》（UP：${info.owner?.name || ''}）。简介：${String(info.desc || '').slice(0, 300)}\n\n` +
                `${styleHint || '写一条像真人发的评论：一两句，说具体看到的内容或感受，不夸空话、不刷屏，不超过 60 字。'}\n\n只输出评论正文。`,
                500,
                0.9,
              )
              const body = String(draft || '').replace(/^["「]|["」]$/g, '').trim()
              if (body.length >= 4) {
                try {
                  client.dryRun = false
                  const res = await client.comment(v.bvid, body, '', { bypassDryRun: true })
                  const rpid = res?.rpid ?? res?.reply?.rpid
                  // 接口返回成功不代表真发出去了：低等级号会被静默吞掉，去评论区确认一下
                  const visible = await client.commentVisible(info.aid, rpid).catch(() => false)
                  done.add(v.bvid)
                  state.commented = [...done].slice(-400)
                  saveAutoState(state)
                  if (visible) {
                    commented = body
                  } else {
                    commentIssue = '接口返回成功但评论区看不到（可能被审核或吞了）'
                    debugLog(`comment invisible ${v.bvid} rpid=${rpid}`)
                  }
                } catch (err) { debugLog(`comment fail ${v.bvid}: ${err?.message ?? err}`) } finally {
                  client.dryRun = true
                }
              }
            }
          }

          results.push({ bvid: v.bvid, title: info.title, note, frames: frameCount, commented, commentIssue })
        } catch (err) {
          results.push({ bvid: v.bvid, error: String(err?.message ?? err) })
        }
      }

      const state = loadAutoState()
      state.lastRunAt = Date.now()
      state.lastTrigger = trigger
      saveAutoState(state)

      if (config.autoBrowseNotify.get() === true && results.length) {
        try {
          const qq = ctx.get && ctx.get('qqAgent')
          const owner = String((qq && qq.ownerQQ && qq.ownerQQ()) || '').trim()
          const watched = results.filter((r) => !r.error)
          if (qq && owner) {
            // 用「分享视频」的形式汇报：跟自动分享一个样式，但不受 videoShareEnabled 影响
            let shared = 0
            if (typeof qq.shareVideo === 'function') {
              for (const r of watched) {
                try {
                  await qq.shareVideo(r.bvid, { userId: owner })
                  shared += 1
                  await new Promise((res) => setTimeout(res, 1200))
                } catch { /* 单条分享失败就跳过 */ }
              }
            }
            // 分享发不出去时退回文字，别让这轮白刷
            if (!shared && typeof qq.sendPrivate === 'function') {
              const lines = results.map((r) => (r.error
                ? `- ${r.bvid} 没看成：${r.error}`
                : `- ${r.bvid} ${r.title}${r.commented ? '（评了）' : ''}`))
              await qq.sendPrivate(owner, `刷完一轮，看了 ${results.length} 条：\n${lines.join('\n')}`)
            }
            // 评论内容单独报一条：省得主人自己去视频底下翻
            const commentedList = watched.filter((r) => r.commented)
            if (commentedList.length && typeof qq.sendPrivate === 'function') {
              const cl = commentedList.map((r) =>
                `- 《${String(r.title || r.bvid).slice(0, 40)}》\n  评：「${r.commented}」`)
              await qq.sendPrivate(owner, `这轮自动评论了 ${commentedList.length} 条：\n${cl.join('\n')}`)
            }
            // 发了但评论区看不到的，单独说一声，别当成发表成功了
            const issueList = watched.filter((r) => r.commentIssue)
            if (issueList.length && typeof qq.sendPrivate === 'function') {
              const il = issueList.map((r) =>
                `- 《${String(r.title || r.bvid).slice(0, 40)}》：${r.commentIssue}`)
              await qq.sendPrivate(owner, `有 ${issueList.length} 条评论没显示出来：\n${il.join('\n')}`)
            }
          }
        } catch { /* 汇报失败不影响 */ }
      }
      return { ok: true, results }
    } finally {
      autoRunning = false
    }
  }

  // 给别的插件（比如 QQ）一个直接查询的入口，不走工具调用。总开关热关时要能撤，包成函数。
  const provideBiliAgent = () => ctx.provide('biliAgent', {
    search: (keyword, page = 1) => client.search(keyword, page),
    video: (bvid) => client.video(bvid),
    feed: (ps = 10) => client.feed(ps),
    popular: (ps = 10) => client.popular(ps),
    watch: async (bvid) => {
      const info = await client.watch(bvid)
      logSeen(bvid, info.title, info.owner)
      return info
    },
    /** url 留空时用本插件配置的直播间；QQ 侧有地址时会传进来，优先用 QQ 的。 */
    liveConfig: () => ({
      url: String(config.liveUrl.get() || '').trim(),
      framePath: liveFramePath(config),
    }),
    liveStatus: async (url) => {
      const target = String(url || '').trim() || String(config.liveUrl.get() || '').trim()
      const room = parseLiveRoom(target)
      if (!room) return null
      return fetchLiveInfo(room)
    },
    liveFrame: async (url, outPath) => {
      const target = String(url || '').trim() || String(config.liveUrl.get() || '').trim()
      const room = parseLiveRoom(target)
      if (!room) return { ok: false, reason: '没有可用的直播间地址' }
      const r = await grabLiveFrame({
        roomId: room,
        ffmpeg: String(config.ffmpegPath.get() || ''),
        out: String(outPath || '').trim() || liveFramePath(config),
      })
      if (r.ok) plog('info', `[dsh-versatileds] 抓到直播帧 ${room}`)
      return r
    },
  })

  // ---------- 直播挂起 ----------
  // 上次抓帧时间放在模块级的 liveFrameState 里，状态接口要读它

  /** 挂起后每隔 liveFrameIntervalSec 抓一帧；关掉就完全不碰直播。 */
  function startLiveFrames() {
    let stopped = false
    const tick = async () => {
      if (stopped) return
      if (config.liveEnabled.get() !== true) return
      const room = parseLiveRoom(config.liveUrl.get())
      if (!room) return
      const intervalMs = Math.max(60, Number(config.liveFrameIntervalSec.get() ?? 300)) * 1000
      if (liveFrameState.lastAt && Date.now() - liveFrameState.lastAt < intervalMs) return
      liveFrameState.lastAt = Date.now()
      liveFrameState.everRan = true
      const r = await grabLiveFrame({
        roomId: room,
        ffmpeg: String(config.ffmpegPath.get() || ''),
        out: liveFramePath(config),
      }).catch(() => ({ ok: false, reason: '异常' }))
      if (!r.ok) plog('warn', '[dsh-versatileds] 定时抓帧失败:', r.reason)
    }
    const first = setTimeout(() => { tick().catch(() => {}) }, 20_000)
    const timer = setInterval(() => { tick().catch(() => {}) }, 60_000)
    return () => { stopped = true; clearTimeout(first); clearInterval(timer) }
  }

  // ---------- 自动刷的定时器 ----------
  function startAutoBrowseTicker() {
    let stopped = false
    const tick = async () => {
      if (stopped) return
      if (config.autoBrowseEnabled.get() !== true) return
      const intervalMs = Math.max(300, Number(config.autoBrowseIntervalSec.get() ?? 1200)) * 1000
      // 每次从文件读：设置页点「跳过」会把它清零，读内存变量会一直以为还没到点
      const lastAt = readAutoLastRun()
      if (lastAt && Date.now() - lastAt < intervalMs) return
      const r = await autoBrowseOnce('tick').catch(() => ({ ok: false }))
      if (r?.ok) plog('info', `[dsh-versatileds] 自动刷完成，看了 ${r.results.length} 条`)
    }
    const first = setTimeout(() => { tick().catch(() => {}) }, 120_000)
    const timer = setInterval(() => { tick().catch(() => {}) }, 60_000)
    return () => { stopped = true; clearTimeout(first); clearInterval(timer) }
  }

  // ---------- 总开关：热启停（volatile 只换值、不重跑 apply） ----------
  let biliStops = []
  let biliRunning = false
  let biliToolDisposer = null
  let biliAgentDisposer = null
  const isBiliOn = () => config.enabled.get() !== false
  const disposeBiliHandle = (d) => {
    try {
      if (typeof d === 'function') d()
      else if (typeof d?.dispose === 'function') d.dispose()
    } catch { /* 卸载失败不影响开关 */ }
  }

  function startBiliBusiness() {
    if (!isBiliOn() || biliRunning) return
    biliRunning = true
    if (!biliAgentDisposer) biliAgentDisposer = provideBiliAgent()
    biliStops = [startLiveFrames(), startAutoBrowseTicker()].filter((stop) => typeof stop === 'function')
    if (!biliToolDisposer) biliToolDisposer = registerBiliTool()
  }

  function stopBiliBusiness() {
    if (!biliRunning) return
    biliRunning = false
    for (const stop of biliStops.splice(0).reverse()) { try { stop() } catch { /* ignore */ } }
    if (biliToolDisposer) { disposeBiliHandle(biliToolDisposer); biliToolDisposer = null }
    if (biliAgentDisposer) { disposeBiliHandle(biliAgentDisposer); biliAgentDisposer = null }
  }

  ctx.effect(() => {
    startBiliBusiness()
    // 面板上翻总开关：volatile 只换值、不重跑 apply，这里每 2 秒对一次状态
    const timer = setInterval(() => {
      if (isBiliOn() === biliRunning) return
      if (isBiliOn()) startBiliBusiness()
      else stopBiliBusiness()
    }, 2000)
    return () => { clearInterval(timer); stopBiliBusiness() }
  }, 'dsh-versatileds: bili automation')

  ctx.on('loader/volatile-update', (paths) => {
    const hit = Array.isArray(paths) && paths.some((p) => Array.isArray(p) && p[0] === 'enabled')
    if (!hit) return
    if (isBiliOn()) startBiliBusiness()
    else stopBiliBusiness()
  })

  // 用 function 声明（会提升）：startBiliBusiness 在上面就调它
  function registerBiliTool() {
    return ctx.tools.register(defineTool({
      // 带插件前缀：别的 B站 插件也注册 `bili` 时，DSH 会让后注册的那个直接抛错
      name: 'versatileds_bili',
    description: DESCRIPTION,
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ACTIONS,
        description: '要执行的动作。',
      },
      keyword: { type: 'string', description: 'search 的关键词。' },
      bvid: { type: 'string', description: '视频 BV 号。' },
      uid: { type: 'string', description: '用户 UID；dm 留空则用配置里绑定的主人 ownerUid。' },
      text: { type: 'string', description: '弹幕或评论或私信正文。' },
      page: { type: 'integer', description: 'search 的页码，默认 1。' },
      num: { type: 'integer', description: 'coin 的投币数，1 或 2。' },
      at: { type: 'integer', description: 'danmaku 的时间点，毫秒，默认 1500。' },
      at_owner: {
        type: 'boolean',
        description: 'comment 时在评论开头 @ 主人；名字优先用配置的 ownerName，没填就按 ownerUid 查。',
      },
      frames: {
        type: 'boolean',
        description: 'video 时顺便抓几帧画面；不传则按插件配置的 videoFrameEnabled。',
      },
      note: {
        type: 'string',
        description: 'video 时写一句看后感，追加到本地 bili_log.md（只记本地，不发给 B站）。',
      },
      season_id: { type: 'integer', description: 'follow_season 的番剧 season_id。' },
      live_url: { type: 'string', description: 'live / live_frame 用，直播间链接或房间号；留空用插件配置的。' },
      frame_path: { type: 'string', description: 'live_frame 用，截图存哪；留空用默认共享路径。' },
      live: {
        type: 'boolean',
        description: '写操作必须显式传 true 才真正执行；不传只返回将要发送的内容。',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      try {
        client.cookies = loadCookies(config)

        if (WRITE_ACTIONS.has(args.action)) {
          guard.check(args.action)
          client.dryRun = args.live !== true
        }

        switch (args.action) {
          case 'me': {
            const me = await client.me()
            const info = {
              登录: Boolean(me.isLogin),
              昵称: me.uname ?? '',
              UID: me.mid ?? '',
              等级: me.level_info?.current_level ?? null,
              硬币: me.money ?? null,
            }
            if (!me.isLogin) {
              info.配置 = {
                方式一: '设置环境变量 SESSDATA / bili_jct / buvid3（buvid3 可省）',
                方式二: `把 JSON 写到 ${cookiePath(config)}，字段同上`,
                格式: '{"SESSDATA":"...","bili_jct":"...","buvid3":"..."}',
              }
            }
            return ok(info)
          }
          case 'search': {
            const list = await client.search(args.keyword ?? '', args.page ?? 1)
            return list.map(fmtSearchItem).join('\n\n') || '没有结果'
          }
          case 'video': {
            const bvid = args.bvid ?? ''
            const v = await client.video(bvid)
            logSeen(bvid, v.title, v.owner?.name, args.note)
            let text = fmtVideo(v)
            // 抓帧开关：显式传 frames 就用它，不传按配置；抓不到只提示，不影响详情
            const wantFrames = args.frames === undefined
              ? config.videoFrameEnabled.get() === true
              : args.frames === true
            if (wantFrames) {
              try {
                const play = await client.playUrl(bvid)
                const got = grabVideoFrames({
                  bvid,
                  url: play.url,
                  duration: play.duration || v.duration,
                  ffmpeg: String(config.ffmpegPath.get() || '').trim(),
                  outDir: videoFrameDir(config),
                  count: Number(config.videoFrameCount.get() ?? 3),
                })
                text += got.ok ? `\n  帧：${got.files.join('、')}` : `\n  抓帧失败：${got.reason}`
              } catch (err) {
                text += `\n  抓帧失败：${err?.message ?? err}`
              }
            }
            // 上报观看历史：B站 只有收到 /history/report 才会把这条记进「观看历史」
            if (config.historyReportEnabled.get() !== false) {
              try {
                const duration = Number(v.duration || 0)
                const progress = Math.max(1, Math.floor(duration * 0.15))
                await client.reportHistory(bvid, { progress, info: v })
                const mmss = `${Math.floor(progress / 60)}:${String(progress % 60).padStart(2, '0')}`
                text += `\n  历史：已上报（看到 ${mmss}）`
              } catch (err) {
                text += `\n  历史：上报失败（${err?.message ?? err}）`
              }
            }
            return text
          }
          case 'popular': {
            const list = await client.popular(12)
            return list.map(fmtVideo).join('\n\n')
          }
          case 'feed': {
            const list = await client.feed(12)
            return list
              .filter((it) => it.bvid)
              .map(fmtVideo)
              .join('\n\n')
          }
          case 'like': {
            const r = await client.like(args.bvid ?? '')
            return ok({ 动作: 'like', 结果: r, 已发送: !client.dryRun })
          }
          case 'coin': {
            const r = await client.coin(args.bvid ?? '', args.num ?? 1)
            return ok({ 动作: 'coin', 结果: r, 已发送: !client.dryRun })
          }
          case 'danmaku': {
            const r = await client.danmaku(args.bvid ?? '', args.text ?? '', args.at ?? 1500)
            return ok({ 动作: 'danmaku', 结果: r, 已发送: !client.dryRun })
          }
          case 'comment': {
            // @ 主人：配置里填了名字就用填的，否则按 ownerUid 查 B站 昵称
            let atName = args.at_owner
              ? await client.ownerName(config.ownerUid.get(), config.ownerName.get())
              : ''
            // 频率闸：距上次 @ 不够久就只发评论、不带 @，免得一直 @ 让人烦
            let atNote = ''
            const gapSec = Number(config.ownerAtMinGapSec.get() ?? 21600)
            if (atName && gapSec > 0) {
              const last = Number(loadOwnerAt().at || 0)
              if (last && Date.now() - last < gapSec * 1000) {
                const left = Math.ceil((gapSec * 1000 - (Date.now() - last)) / 1000)
                atName = ''
                atNote = `@ 已跳过（距上次不到 ${gapSec} 秒，还差约 ${left} 秒）`
              }
            }
            // 评论也走 live：不传 live 只预览，传了才真发
            const live = args.live === true
            const r = await client.comment(args.bvid ?? '', args.text ?? '', atName, { bypassDryRun: live })
            if (atName) saveOwnerAt({ at: Date.now(), bvid: args.bvid ?? '' })
            return ok({
              动作: 'comment',
              真发: live,
              结果: r,
              ...(atNote ? { 备注: atNote } : {}),
            })
          }
          case 'follow': {
            const r = await client.follow(args.uid ?? '')
            return ok({ 动作: 'follow', 结果: r, 已发送: !client.dryRun })
          }
          case 'follow_season': {
            const r = await client.followSeason(args.season_id ?? 0)
            return ok({ 动作: 'follow_season', 结果: r, 已发送: !client.dryRun })
          }
          case 'dm': {
            // uid 留空就发给配置里绑定的主人；两边都没有才报错
            const target = String(args.uid ?? '').trim() || String(config.ownerUid.get() ?? '').trim()
            if (!target) throw new Error('私信需要 uid，或者在插件配置里绑定 ownerUid')
            const r = await client.dm(target, args.text ?? '')
            return ok({ 动作: 'dm', 结果: r, 已发送: !client.dryRun })
          }
          case 'auto_browse': {
            const r = await autoBrowseOnce('tool')
            return ok(r)
          }
          case 'live': {
            const url = String(args.live_url || '').trim() || String(config.liveUrl.get() || '').trim()
            const room = parseLiveRoom(url)
            if (!room) return '没配直播间地址'
            const info = await fetchLiveInfo(room)
            if (!info) return '查不到这个直播间'
            return ok({ ...info, 在播: info.liveStatus === 1 })
          }
          case 'live_frame': {
            const url = String(args.live_url || '').trim() || String(config.liveUrl.get() || '').trim()
            const room = parseLiveRoom(url)
            if (!room) return '没配直播间地址'
            const r = await grabLiveFrame({
              roomId: room,
              ffmpeg: String(config.ffmpegPath.get() || ''),
              out: String(args.frame_path || '').trim() || liveFramePath(config),
            })
            return ok(r)
          }
          default:
            return `未知动作: ${args.action}`
        }
      } catch (err) {
        if (err instanceof GuardError) {
          return `已拦截：${err.message}`
        }
        if (err instanceof BiliError) {
          const hint = err.isRiskControl
            ? '（风控，停手十分钟以上）'
            : err.isAuth
              ? '（登录态失效，需要重新提供 cookie）'
              : ''
          return `接口错误 ${err.message}${hint}`
        }
        return `执行失败: ${err?.message ?? err}`
      } finally {
        client.dryRun = true
      }
    },
  }))
  }
}
