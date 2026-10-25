/**
 * 直播画面能力：只取画面，不碰弹幕。
 *
 * - 直播间地址从配置或调用方传进来，优先用调用方的（QQ 侧跳板）
 * - 抓帧用 ffmpeg，只取一帧 jpg
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/** 从直播间链接或纯房间号里取出 room_id。 */
export function parseLiveRoom(input) {
  const s = String(input || '').trim()
  if (!s) return ''
  const m = s.match(/live\.bilibili\.com\/(?:h5\/)?(\d+)/i) || s.match(/^(\d+)$/)
  return m ? m[1] : ''
}

export async function fetchLiveInfo(roomId) {
  const room = String(roomId || '').trim()
  if (!room) return null
  const url = `https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${room}`
  const res = await fetch(url, {
    headers: { referer: 'https://live.bilibili.com/', 'user-agent': UA },
  })
  const json = await res.json()
  if (json?.code !== 0) return null
  const d = json.data || {}
  return {
    roomId: String(d.room_id ?? room),
    uid: String(d.uid ?? ''),
    title: String(d.title ?? ''),
    liveStatus: Number(d.live_status ?? 0),
    online: Number(d.online ?? 0),
    area: String(d.area_name ?? ''),
    liveTime: String(d.live_time ?? ''),
  }
}

async function fetchPlayUrl(roomId) {
  const url = `https://api.live.bilibili.com/xlive/web-room/v1/playUrl/playUrl?cid=${roomId}&platform=web&qn=80&https_url_req=1&ptype=8`
  const res = await fetch(url, {
    headers: { referer: 'https://live.bilibili.com/', 'user-agent': UA },
  })
  const json = await res.json()
  return String(json?.data?.durl?.[0]?.url || '')
}

export async function grabLiveFrame({ roomId, ffmpeg, out }) {
  const room = String(roomId || '').trim()
  const ff = String(ffmpeg || '').trim()
  if (!room) return { ok: false, reason: '没有直播间地址' }
  if (!ff || !existsSync(ff)) return { ok: false, reason: 'ffmpeg 路径不对' }

  const playUrl = await fetchPlayUrl(room)
  if (!playUrl) return { ok: false, reason: '没拿到播放地址（可能没在播）' }

  mkdirSync(dirname(out), { recursive: true })
  const res = spawnSync(ff, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-user_agent', UA,
    '-headers', 'Referer: https://live.bilibili.com/\r\nOrigin: https://live.bilibili.com\r\n',
    '-i', playUrl,
    '-frames:v', '1',
    '-q:v', '3',
    out,
  ], { stdio: 'ignore', timeout: 60_000 })

  if (res.error) return { ok: false, reason: `ffmpeg 起不来: ${res.error.message}` }
  if (!existsSync(out)) return { ok: false, reason: `ffmpeg 退出码 ${res.status}` }
  return { ok: true, file: out, at: Date.now(), room, playUrl: playUrl.slice(0, 80) }
}

/**
 * 从视频直链抓几帧：按总时长比例取时间点，每帧单独起一次 ffmpeg。
 * 抓不到就返回原因，不影响视频详情本身。
 */
export function grabVideoFrames({ bvid, url, duration, ffmpeg, outDir, count = 3 }) {
  const ff = String(ffmpeg || '').trim()
  if (!ff || !existsSync(ff)) return { ok: false, reason: 'ffmpeg 路径不对' }
  if (!url) return { ok: false, reason: '没有播放地址' }
  const total = Math.max(0, Number(duration) || 0)
  const n = Math.max(1, Math.min(6, Number(count) || 3))
  mkdirSync(outDir, { recursive: true })
  const files = []
  for (let i = 0; i < n; i += 1) {
    // 有总时长就按 10%~85% 分散取，没有就往后错几秒
    const ratio = n === 1 ? 0.5 : 0.1 + (0.75 * i) / (n - 1)
    const at = total > 0 ? Math.max(1, Math.floor(total * ratio)) : 1 + i * 5
    const out = join(outDir, `${bvid}-${i + 1}.jpg`)
    const res = spawnSync(ff, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-user_agent', UA,
      '-headers', 'Referer: https://www.bilibili.com/\r\nOrigin: https://www.bilibili.com/\r\n',
      '-ss', String(at),
      '-i', url,
      '-frames:v', '1',
      '-vf', 'scale=720:-2',
      '-q:v', '3',
      out,
    ], { stdio: 'ignore', timeout: 45_000 })
    if (!res.error && existsSync(out)) files.push(out)
  }
  if (!files.length) return { ok: false, reason: '一帧都没抓到（直链可能过期或需要会员）' }
  return { ok: true, files }
}
