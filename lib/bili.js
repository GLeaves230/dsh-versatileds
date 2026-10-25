/**
 * B站 客户端：WBI 签名、会话、限频、干跑。
 * 纯 Node 标准库实现，不依赖第三方包。
 */

import { createHash, randomUUID } from 'node:crypto'

const BASE = 'https://api.bilibili.com'
const VC = 'https://api.vc.bilibili.com'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

const MIXIN_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]

const RULES = {
  like: [60, 6],
  coin: [3600, 4],
  danmaku: [600, 2],
  comment: [1800, 2],
  follow: [3600, 3],
  dm: [600, 2],
  search: [60, 20],
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 评论正文的符号/空格清理：B站 评论区对多余空格很敏感，
 * 中文之间多一个空格就会像「每 口」这样断开来。
 * 只动空白和紧挨中文的标点，不改英文单词之间的空格。
 */
function tidyComment(text) {
  let t = String(text || '').replace(/\r\n?/g, '\n').trim()
  // 中文字符之间的空格去掉：「每 口」→「每口」
  t = t.replace(/([\u4e00-\u9fa5])[ \t]+(?=[\u4e00-\u9fa5])/g, '$1')
  // 连续空格/制表符合并成一个
  t = t.replace(/[ \t]{2,}/g, ' ')
  // 中文标点前后不留空格
  t = t.replace(/[ \t]+([，。！？、；：」』）】])/g, '$1')
  t = t.replace(/([，。！？、；：「『（【])[ \t]+/g, '$1')
  // 行首行尾空格、多余空行
  t = t.split('\n').map((line) => line.trim()).join('\n').replace(/\n{3,}/g, '\n\n')
  return t.trim()
}

function keyFromUrl(url) {
  return String(url || '').split('/').pop().split('.')[0]
}

function mixinKey(imgKey, subKey) {
  const raw = imgKey + subKey
  return MIXIN_TAB.map((i) => raw[i] || '').join('').slice(0, 32)
}

function signParams(params, imgKey, subKey) {
  const key = mixinKey(imgKey, subKey)
  const signed = { ...params, wts: String(Math.floor(Date.now() / 1000)) }
  const clean = {}
  for (const [k, v] of Object.entries(signed)) {
    clean[k] = String(v).replace(/[!'()*]/g, '')
  }
  const query = Object.keys(clean)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(clean[k])}`)
    .join('&')
  const wRid = createHash('md5').update(query + key).digest('hex')
  return { ...clean, w_rid: wRid }
}

export class BiliError extends Error {
  constructor(code, message, url = '') {
    super(`[${code}] ${message}`)
    this.code = code
    this.url = url
  }

  get isRiskControl() {
    return [-412, -352, -799, -509].includes(this.code)
  }

  get isAuth() {
    return [-101, -111].includes(this.code)
  }
}

export class BiliClient {
  constructor({ cookies = {}, dryRun = true, timeoutMs = 20_000 } = {}) {
    this.cookies = cookies
    this.dryRun = dryRun
    this.timeoutMs = timeoutMs
    this._wbi = null
    this._lastAt = 0
    this._stamps = {}
  }

  get csrf() {
    return this.cookies.bili_jct || ''
  }

  get loggedIn() {
    return Boolean(this.cookies.SESSDATA)
  }

  headers(referer = 'https://www.bilibili.com/') {
    const headers = {
      'User-Agent': UA,
      Referer: referer,
      Origin: 'https://www.bilibili.com',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      // 网页端 XHR 都带这个头，缺了容易被当脚本请求
      'X-Requested-With': 'XMLHttpRequest',
    }
    const cookie = Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
    if (cookie) headers.Cookie = cookie
    return headers
  }

  async throttle() {
    const gap = 800 + Math.random() * 1000
    const wait = this._lastAt + gap - Date.now()
    if (wait > 0) await sleep(wait)
    this._lastAt = Date.now()
  }

  checkRate(action) {
    const rule = RULES[action]
    if (!rule) return
    const [windowMs, limit] = [rule[0] * 1000, rule[1]]
    const now = Date.now()
    const list = (this._stamps[action] || []).filter((t) => now - t < windowMs)
    if (list.length >= limit) {
      const wait = Math.ceil((windowMs - (now - list[0])) / 1000)
      throw new Error(`限频：${action} 约 ${wait} 秒后再试`)
    }
    list.push(now)
    this._stamps[action] = list
  }

  async request(url, { method = 'GET', body, referer, signal } = {}) {
    const headers = this.headers(referer)
    if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded'
    let lastError
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.throttle()
      try {
        const res = await fetch(url, {
          method,
          headers,
          body,
          signal: signal ?? AbortSignal.timeout(this.timeoutMs),
        })
        const text = await res.text()
        if (res.status === 412 || res.status === 429) {
          lastError = new BiliError(-res.status, `HTTP ${res.status}`, url)
          await sleep(1500 * (attempt + 1))
          continue
        }
        if (!res.ok) throw new BiliError(res.status, text.slice(0, 160), url)
        return JSON.parse(text)
      } catch (err) {
        lastError = err
        await sleep(800 * (attempt + 1))
      }
    }
    throw new BiliError(-1, `请求失败: ${lastError?.message ?? lastError}`, url)
  }

  unwrap(payload, url) {
    const code = Number(payload?.code ?? 0)
    if (code !== 0) {
      throw new BiliError(code, String(payload?.message || payload?.msg || ''), url)
    }
    return payload?.data ?? {}
  }

  async get(path, params = {}, { wbi = false, check = true, referer } = {}) {
    let query = { ...params }
    if (wbi) {
      const [img, sub] = await this.wbiKeys()
      query = signParams(query, img, sub)
    }
    const qs = new URLSearchParams(query).toString()
    const url = qs ? `${BASE}${path}?${qs}` : `${BASE}${path}`
    const payload = await this.request(url, { referer, signal: undefined })
    return check ? this.unwrap(payload, url) : payload
  }

  async post(path, data = {}, { referer, params, wbi = false, bypassDryRun = false } = {}) {
    if (this.dryRun && !bypassDryRun) {
      const safe = { ...data }
      if (safe.csrf) safe.csrf = '***'
      return { _dryRun: true, path, data: safe, params: params ?? {} }
    }
    let query = { ...(params ?? {}) }
    if (wbi) {
      const [img, sub] = await this.wbiKeys()
      query = signParams(query, img, sub)
    }
    const qs = new URLSearchParams(query).toString()
    const url = qs ? `${BASE}${path}?${qs}` : `${BASE}${path}`
    const body = new URLSearchParams(data).toString()
    return this.unwrap(await this.request(url, { method: 'POST', body, referer }), url)
  }

  async wbiKeys() {
    if (this._wbi && Date.now() - this._wbi.at < 30 * 60 * 1000) {
      return [this._wbi.img, this._wbi.sub]
    }
    const payload = await this.request(`${BASE}/x/web-interface/nav`)
    const img = keyFromUrl(payload?.data?.wbi_img?.img_url)
    const sub = keyFromUrl(payload?.data?.wbi_img?.sub_url)
    if (!img || !sub) throw new BiliError(-1, '拿不到 wbi keys')
    this._wbi = { img, sub, at: Date.now() }
    return [img, sub]
  }

  // ---------- 只读 ----------
  me() {
    return this.get('/x/web-interface/nav', {}, { check: false }).then((p) => p.data ?? {})
  }

  /**
   * 主人账号的昵称：配置里填了 ownerName 就直接用（不查接口），
   * 否则按 ownerUid 查一次名片并缓存 6 小时；都没配就返回空串。
   */
  async ownerName(uid, custom) {
    const fixed = String(custom || '').trim()
    if (fixed) return fixed
    const mid = String(uid || '').trim()
    if (!mid) return ''
    const cache = this._ownerName
    if (cache && cache.mid === mid && Date.now() - cache.at < 6 * 3600_000) return cache.name
    const card = await this.get('/x/web-interface/card', { mid }).catch(() => ({}))
    const name = String(card?.card?.name || card?.name || '')
    if (name) this._ownerName = { mid, name, at: Date.now() }
    return name
  }

  search(keyword, page = 1) {
    return this.get(
      '/x/web-interface/wbi/search/type',
      { search_type: 'video', keyword, page, order: 'totalrank' },
      { wbi: true },
    ).then((d) => d.result ?? [])
  }

  video(bvid) {
    return this.get('/x/web-interface/view', { bvid })
  }

  /**
   * 取视频的直链播放地址（抓帧用）：优先 DASH 的单条视频流，退回 durl 的第一段。
   * 没登录态一般只能拿到 360P，抓帧够用。
   */
  async playUrl(bvid) {
    const info = await this.video(bvid)
    const cid = info?.cid ?? info?.pages?.[0]?.cid
    if (!cid) throw new Error('拿不到 cid')
    const dashData = await this.get('/x/player/playurl', { bvid, cid, qn: 80, fnval: 16, fourk: 1 })
    let url = String(dashData?.dash?.video?.[0]?.baseUrl || '')
    if (!url) {
      const durlData = await this.get('/x/player/playurl', { bvid, cid, qn: 64, fnval: 1, fourk: 1 })
      url = String(durlData?.durl?.[0]?.url || '')
    }
    if (!url) throw new Error('拿不到播放地址（可能需要登录态）')
    return {
      url,
      cid: String(cid),
      duration: Number(info.duration || 0),
      title: String(info.title || ''),
    }
  }

  popular(ps = 20) {
    return this.get('/x/web-interface/popular', { ps, pn: 1 }).then((d) => d.list ?? [])
  }

  feed(ps = 12) {
    return this.get(
      '/x/web-interface/wbi/index/top/feed/rcmd',
      { ps, fresh_type: 3, feed_version: 'V8' },
      { wbi: true },
    ).then((d) => d.item ?? [])
  }

  userSearch(keyword) {
    return this.get(
      '/x/web-interface/wbi/search/type',
      { search_type: 'bili_user', keyword, page: 1 },
      { wbi: true },
    ).then((d) => d.result ?? [])
  }

  replies(bvid, { sort = 2, ps = 12 } = {}) {
    return this.video(bvid).then((v) =>
      this.get('/x/v2/reply', { type: 1, oid: v.aid, sort, pn: 1, ps }),
    )
  }

  /**
   * 上报观看进度到服务端历史（/x/v2/history/report）。
   * 不做这一步，B站 的「观看历史」里就不会出现看过的视频。
   * progress 传秒数；不传就取时长的 15%（至少 1 秒）。
   */
  async reportHistory(bvid, { progress, info } = {}) {
    if (!this.loggedIn) throw new BiliError(-101, '未登录，无法上报历史')
    const v = info ?? (await this.video(bvid))
    const aid = v?.aid
    const cid = v?.cid ?? v?.pages?.[0]?.cid
    if (!aid || !cid) throw new Error('拿不到 aid/cid')
    const duration = Number(v.duration || 0)
    const sec = progress === undefined || progress === null
      ? Math.max(1, Math.floor(duration * 0.15))
      : Math.max(1, Math.floor(Number(progress) || 0))
    return this.post(
      '/x/v2/history/report',
      { aid: String(aid), cid: String(cid), progress: String(sec), csrf: this.csrf },
      { referer: `https://www.bilibili.com/video/${bvid}`, bypassDryRun: true },
    )
  }

  /** AI 字幕全文，没有字幕返回空串。 */
  async subtitle(bvid) {
    const info = await this.video(bvid)
    const cid = info?.pages?.[0]?.cid
    if (!cid) return ''
    const p = await this.get(
      '/x/player/wbi/v2',
      { aid: info.aid, cid, bvid },
      { wbi: true },
    )
    const subs = p?.subtitle?.subtitles || []
    const url = subs[0]?.subtitle_url
    if (!url) return ''
    const full = url.startsWith('//') ? `https:${url}` : url
    const res = await fetch(full, {
      headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' },
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!res.ok) return ''
    const json = await res.json()
    return (json.body || []).map((x) => x.content).join('')
  }

  /** 一次拉齐"看视频"需要的东西，给 QQ 协同用。 */
  async watch(bvid) {
    const info = await this.video(bvid)
    let subtitle = ''
    try {
      subtitle = await this.subtitle(bvid)
    } catch { /* 没字幕就跳过 */ }
    let topReplies = []
    try {
      const r = await this.replies(bvid, { ps: 6 })
      topReplies = (r?.replies || []).slice(0, 6).map((x) => x.content?.message || '')
    } catch { /* 评论失败就跳过 */ }
    const stat = info.stat || {}
    return {
      bvid,
      title: info.title,
      owner: info.owner?.name || '',
      duration: info.duration,
      desc: String(info.desc || '').slice(0, 400),
      view: stat.view,
      like: stat.like,
      coin: stat.coin,
      danmaku: stat.danmaku,
      subtitle: subtitle.slice(0, 2500),
      replies: topReplies,
    }
  }

  // ---------- 写操作 ----------
  like(bvid, on = true) {
    return this.post('/x/web-interface/archive/like', {
      bvid,
      like: on ? 1 : 2,
      csrf: this.csrf,
    })
  }

  coin(bvid, num = 1, alsoLike = false) {
    if (![1, 2].includes(num)) throw new Error('投币只能是 1 或 2 枚')
    return this.post('/x/web-interface/coin/add', {
      bvid,
      multiply: num,
      select_like: alsoLike ? 1 : 0,
      cross_domain: 'true',
      csrf: this.csrf,
    })
  }

  async danmaku(bvid, text, progressMs = 1500, mode = 1) {
    if (text.length > 100) throw new Error('弹幕最长 100 字')
    const info = await this.video(bvid)
    return this.post(
      '/x/v2/dm/post',
      {
        type: 1,
        oid: info.aid,
        msg: text,
        bvid,
        progress: Math.max(0, Math.trunc(progressMs)),
        color: 16777215,
        fontsize: 25,
        pool: 0,
        mode,
        plat: 1,
        statistics: '{"appId":100,"platform":5}',
        csrf: this.csrf,
      },
      {
        referer: `https://www.bilibili.com/video/${bvid}/`,
        params: { type: 1, oid: info.aid, web_location: '333.788' },
        wbi: true,
      },
    )
  }

  /**
   * 发评论。atName 非空时在正文开头写「@昵称 」，B站 会把它解析成 at。
   * 正文先过一遍符号/空格清理（tidyComment），避免「每 口」这种断词。
   * bypassDryRun 让评论可以单独放行（其它写操作仍受干跑保护）。
   */
  async comment(bvid, text, atName = '', { bypassDryRun = false } = {}) {
    const body = tidyComment(text)
    if (!body) throw new Error('评论内容为空')
    const info = await this.video(bvid)
    const who = String(atName || '').trim()
    const message = who ? `@${who} ${body}` : body
    return this.post(
      '/x/v2/reply/add',
      {
        oid: info.aid,
        type: 1,
        message,
        plat: 1,
        csrf: this.csrf,
        // 网页端会带这个（gaia 风控源），不带容易被判成脚本请求直接吞掉
        gaia_source: '',
      },
      // web_location 是网页端评论的固定位置标识，补上更像真人操作
      { bypassDryRun, params: { web_location: '333.788' } },
    )
  }

  /** 评论发出去后确认真的出现在评论区；低等级号会被 B站 静默吞掉（接口返回 0 但评论不可见）。 */
  async commentVisible(aid, rpid) {
    if (!rpid) return false
    const id = String(rpid)
    for (let pn = 1; pn <= 2; pn += 1) {
      const url = `${BASE}/x/v2/reply?oid=${aid}&type=1&sort=0&ps=20&pn=${pn}&nohot=1`
      let data
      try {
        data = this.unwrap(await this.request(url), url)
      } catch {
        return false
      }
      const list = data?.replies || []
      if (list.some((r) => String(r?.rpid) === id)) return true
      if (!list.length) break
    }
    return false
  }

  follow(uid, on = true) {
    return this.post('/x/relation/modify', {
      fid: uid,
      act: on ? 1 : 2,
      re_src: 11,
      csrf: this.csrf,
    })
  }

  followSeason(seasonId, on = true) {
    return this.post(`/x/space/bangumi/follow/${on ? 'add' : 'del'}`, {
      season_id: seasonId,
      csrf: this.csrf,
    })
  }

  async dm(uid, text) {
    const profile = await this.me()
    const sender = String(profile.mid || '')
    if (!sender) throw new BiliError(-101, '私信需要登录态')
    const body = new URLSearchParams({
      'msg[sender_uid]': sender,
      'msg[receiver_id]': uid,
      'msg[receiver_type]': '1',
      'msg[msg_type]': '1',
      'msg[dev_id]': randomUUID().toUpperCase(),
      'msg[timestamp]': String(Math.floor(Date.now() / 1000)),
      'msg[content]': JSON.stringify({ content: text }),
      csrf: this.csrf,
      csrf_token: this.csrf,
    }).toString()
    const url = `${VC}/web_im/v1/web_im/send_msg`
    if (this.dryRun) return { _dryRun: true, path: url, data: { text } }
    const payload = await this.request(url, {
      method: 'POST',
      body,
      referer: 'https://message.bilibili.com/',
    })
    return this.unwrap(payload, url)
  }
}
