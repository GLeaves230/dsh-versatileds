/**
 * QQ 分享卡片的解析（纯函数，方便单测）。
 *
 * 别人在 QQ 里转发 B站 视频，送过来的是 `json` 段（com.tencent.miniapp_01 之类），
 * 里面只有一个 prompt 和 meta.detail_1。以前插件把它当 `[json]` 扔掉，
 * 模型既看不到内容，也点不进去；这里负责把标题、描述、跳转链接挖出来。
 */

/** 解析一个消息段；不是能识别的卡片就返回 null。 */
export function parseShareCard(seg) {
  if (!seg || seg.type !== 'json') return null
  let raw = seg.data?.data
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw) } catch { return null }
  }
  if (!raw || typeof raw !== 'object') return null
  const meta = raw.meta?.detail_1 || raw.meta?.news || raw.meta?.detail || raw.meta || {}
  const title = String(meta.title || raw.prompt || '').trim()
  const desc = String(meta.desc || raw.prompt || '').trim()
  const url = String(meta.qqdocurl || meta.jumpUrl || meta.url || '').trim()
  const preview = String(meta.preview || '').trim()
  if (!title && !desc && !url) return null
  return { app: String(raw.app || ''), title, desc, url, preview }
}

/** 卡片转一行文本：群历史、日志、触发回复都用这个，别让它变成 [json]。 */
export function cardTextOf(card) {
  if (!card) return ''
  const name = card.title && card.title !== '哔哩哔哩' ? card.title : ''
  const body = card.desc || card.title || ''
  const parts = [`[分享${name ? `·${name}` : ''}] ${body}`]
  // 短链后面的 share_medium / bbid / ts 是转发参数，留着又长又乱，只保留干净的地址
  const cleanUrl = String(card.url || '').split('?')[0]
  if (cleanUrl) parts.push(cleanUrl)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/** 一条消息里第一张能解析的分享卡片。 */
export function findShareCard(segments) {
  for (const seg of segments || []) {
    const card = parseShareCard(seg)
    if (card) return card
  }
  return null
}

/** 卡片里直接带 BV 号最好；否则跟着 b23.tv 短链跳一次，从落点拿 BV 号。 */
export async function resolveBvidFromCard(card) {
  if (!card) return ''
  const direct = `${card.url} ${card.desc} ${card.title}`.match(/BV[0-9A-Za-z]{10}/)
  if (direct) return direct[0]
  if (!card.url || !/^https?:\/\/(b23\.tv|bili(23|bilibili)\.(tv|com))\//i.test(card.url)) return ''
  try {
    const res = await fetch(card.url, { redirect: 'follow', signal: AbortSignal.timeout(4000) })
    const hit = String(res.url || '').match(/BV[0-9A-Za-z]{10}/)
    return hit ? hit[0] : ''
  } catch {
    return ''
  }
}
