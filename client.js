/**
 * dsh-versatileds-plugin 的浏览器半侧。
 *
 * 一个左侧栏入口「多功能DS插件」，主面板里分「B站模块」「QQ模块」两个选项页，
 * 每个模块页就是原来各自插件设置页的样子（内部还保留自己的分类标签）。
 *
 * 配置读写仍走 Host 的 Config 表单：form.set / form.mutate 落盘并热替换插件。
 * 合并后配置分成 config.bili 与 config.qq 两块，所以每个模块页拿到的是
 * 一个按前缀收窄的 form 视图（scopeForm），页面代码不用关心嵌套层级。
 */

window.__ModuleLoader__.load({
  id: 'dsh-versatileds-plugin',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')

    // ---------------------------------------------------------------- 公共样式
    const rowStyle = { display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0' }
    const labelStyle = { minWidth: '210px', opacity: 0.9 }
    const hintStyle = { opacity: 0.55, fontSize: '12px' }
    const inputStyle = { flex: 1, maxWidth: '320px', padding: '3px 6px' }
    const numStyle = { width: '110px', padding: '3px 6px' }
    const cdStyle = { minWidth: '64px', fontSize: '12px', fontVariantNumeric: 'tabular-nums', opacity: 0.8 }
    const skipStyle = {
      fontSize: '12px', padding: '2px 8px', cursor: 'pointer',
      border: '1px solid rgba(128,128,128,0.4)', borderRadius: '4px', background: 'transparent',
    }
    const tabStyle = (active) => ({
      ...skipStyle,
      padding: '4px 12px',
      border: active ? '1px solid rgba(122,162,247,0.9)' : '1px solid rgba(128,128,128,0.35)',
      background: active ? 'rgba(122,162,247,0.16)' : 'transparent',
      fontWeight: active ? 600 : 400,
    })

    // 原来两个插件的状态服务端口不同，各自保留
    const BILI_STATUS_URL = 'http://127.0.0.1:18765'
    const QQ_STATUS_URL = 'http://127.0.0.1:18766'

    let timer
    function later(fn) {
      clearTimeout(timer)
      timer = setTimeout(fn, 1500)
    }

    function fmtLeft(sec) {
      if (!sec || sec <= 0) return ''
      if (sec < 60) return `${sec}s`
      const m = Math.floor(sec / 60)
      const s = sec % 60
      return `${m}:${String(s).padStart(2, '0')}`
    }

    function useSnapshot(form) {
      const [snap, setSnap] = React.useState(() => form.getSnapshot())
      React.useEffect(() => form.subscribe(() => setSnap(form.getSnapshot())), [form])
      return snap
    }

    /**
     * 把合并后的整份配置收窄成某个模块的一块：
     * snapshot.value 只给这一块的字段，set/unset 自动补上 `bili.` / `qq.` 前缀，
     * 这样原来按平铺字段写好的页面代码可以原样复用。
     */
    function scopeForm(base, prefix) {
      const pick = () => {
        const snap = base.getSnapshot()
        if (snap.status !== 'ready' || !snap.value || typeof snap.value !== 'object') return snap
        const sub = snap.value[prefix]
        if (!sub || typeof sub !== 'object') return { ...snap, status: 'unavailable', value: undefined }
        return { ...snap, value: sub }
      }
      return {
        getSnapshot: pick,
        subscribe: (listener) => base.subscribe(listener),
        set: (field, value) => base.mutate([{ op: 'set', path: [prefix, field], value }]),
        unset: (field) => base.mutate([{ op: 'unset', path: [prefix, field] }]),
      }
    }

    function useCooldowns(url, initial) {
      const [state, setState] = React.useState(initial)
      React.useEffect(() => {
        let alive = true
        const tick = async () => {
          try {
            const res = await fetch(`${url}/cooldowns`)
            const data = await res.json()
            if (alive) setState(data)
          } catch { /* 插件没起来就静默 */ }
        }
        tick()
        const t = setInterval(tick, 1000)
        return () => { alive = false; clearInterval(t) }
      }, [url])
      return [state, setState]
    }

    /**
     * 列表型配置：内部维护字符串数组，保存时转成逗号分隔写回。
     * 以前让人自己敲「a,b,c」，敲错一个逗号整项就废了。
     */
    function ListRow(props) {
      const { form, field, label, hint, value, disabled } = props
      const [open, setOpen] = React.useState(false)
      const [items, setItems] = React.useState([])
      const [msg, setMsg] = React.useState('')
      const parse = (raw) => String(raw || '').split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean)
      const list = parse(value)
      const inputStyle = {
        flex: 1, padding: '5px 8px', borderRadius: '6px',
        border: '1px solid rgba(128,128,128,0.35)',
        background: 'transparent', color: 'inherit', fontSize: '13px',
      }
      const openEditor = () => {
        setItems(list.length ? [...list, ''] : [''])
        setMsg('')
        setOpen(true)
      }
      const save = () => {
        const clean = items.map((s) => String(s || '').trim()).filter(Boolean)
        form.set(field, clean.join(','))
        setMsg('已保存')
        setOpen(false)
      }
      return React.createElement(
        'label',
        { style: rowStyle },
        React.createElement('span', { style: labelStyle }, label),
        React.createElement('button', {
          type: 'button', style: skipStyle, disabled, onClick: openEditor,
        }, '编辑列表'),
        React.createElement('span', { style: hintStyle }, `${list.length} 项${hint ? ` · ${hint}` : ''}`),
        open ? React.createElement(
          'div',
          {
            style: {
              position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            },
            onClick: (e) => { if (e.target === e.currentTarget) setOpen(false) },
          },
          React.createElement(
            'div',
            {
              style: {
                width: 'min(560px, 92vw)', maxHeight: '80vh', overflow: 'auto',
                background: 'Canvas', color: 'CanvasText', padding: '14px',
                border: '1px solid rgba(128,128,128,0.35)', borderRadius: '12px',
                boxShadow: '0 12px 48px rgba(0,0,0,0.45)',
              },
            },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' } },
              React.createElement('strong', { style: { fontSize: '14px' } }, label),
              React.createElement('span', { style: { flex: 1 } }),
              React.createElement('button', { type: 'button', style: skipStyle, onClick: () => setOpen(false) }, '取消'),
            ),
            items.length
              ? items.map((item, i) => React.createElement(
                  'div',
                  { key: `li${i}`, style: { display: 'flex', gap: '8px', marginBottom: '8px' } },
                  React.createElement('input', {
                    type: 'text',
                    value: item,
                    placeholder: i === items.length - 1 ? '新的一项（留空自动丢弃）' : '',
                    onChange: (e) => setItems(items.map((x, j) => (j === i ? e.target.value : x))),
                    style: inputStyle,
                  }),
                  React.createElement('button', {
                    type: 'button', style: skipStyle,
                    onClick: () => setItems(items.filter((_, j) => j !== i)),
                  }, '删'),
                ))
              : React.createElement('div', { style: { ...hintStyle, marginBottom: '8px' } }, '还没有项'),
            React.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center' } },
              React.createElement('button', {
                type: 'button', style: skipStyle, onClick: () => setItems([...items, '']),
              }, '+ 添加一项'),
              React.createElement('span', { style: { flex: 1 } }),
              msg ? React.createElement('span', { style: { ...hintStyle, color: '#2e7d32' } }, msg) : null,
              React.createElement('button', { type: 'button', style: skipStyle, onClick: save }, '保存'),
            ),
          ),
        ) : null,
      )
    }

    function NumberRow(props) {
      const { form, field, label, value, disabled } = props
      const [draft, setDraft] = React.useState(String(value))
      React.useEffect(() => { setDraft(String(value)) }, [value])
      const commit = () => {
        const n = Number(draft)
        if (draft === '' || !Number.isFinite(n) || n < 0) {
          setDraft(String(value))
          return
        }
        const next = Math.trunc(n)
        setDraft(String(next))
        if (next !== value) form.set(field, next)
      }
      return React.createElement(
        'label',
        { style: rowStyle },
        React.createElement('span', { style: labelStyle }, label),
        React.createElement('input', {
          type: 'number',
          min: 0,
          className: 'versatileds-num',
          value: draft,
          disabled,
          onChange: (e) => setDraft(e.target.value),
          onBlur: commit,
          onKeyDown: (e) => { if (e.key === 'Enter') e.currentTarget.blur() },
          style: numStyle,
        }),
        props.action
          ? React.createElement('span', { style: cdStyle },
              props.cooldowns && props.cooldowns.exhausted && props.action === 'proactive'
                ? '今日已满'
                : fmtLeft(props.cooldowns ? props.cooldowns[props.action] : 0))
          : null,
        props.action && props.cooldowns && props.cooldowns[props.action] > 0
          ? React.createElement('button', {
              type: 'button',
              style: skipStyle,
              onClick: () => props.onSkip && props.onSkip(props.action),
            }, '跳过')
          : null,
      )
    }

    function TextRow(props) {
      const { form, field, label, hint, value, disabled } = props
      const [draft, setDraft] = React.useState(String(value ?? ''))
      React.useEffect(() => { setDraft(String(value ?? '')) }, [value])
      const commit = () => {
        const next = draft.trim()
        if (next !== String(value ?? '')) form.set(field, next)
      }
      return React.createElement(
        'label',
        { style: rowStyle },
        React.createElement('span', { style: labelStyle }, label),
        React.createElement('input', {
          type: 'text',
          value: draft,
          disabled,
          onChange: (e) => setDraft(e.target.value),
          onBlur: commit,
          onKeyDown: (e) => { if (e.key === 'Enter') e.currentTarget.blur() },
          style: inputStyle,
          placeholder: hint || '',
        }),
        hint ? React.createElement('span', { style: hintStyle }, hint) : null,
      )
    }

    /** 聚焦聊天的实时状态：显示大肥鱼现在盯的是哪个会话（手动指定 / 自动挑），可一键填进输入框。 */
    function FocusStatusRow(props) {
      const { form, disabled } = props
      const [status, setStatus] = React.useState(null)
      const refresh = async () => {
        try {
          const r = await fetch(`${QQ_STATUS_URL}/focus_status`, { cache: 'no-store' })
          setStatus(await r.json())
        } catch {
          setStatus(null)
        }
      }
      React.useEffect(() => { refresh() }, [])
      const modeText = status
        ? (status.mode === 'manual' ? '手动指定' : '自动挑（大肥鱼自己找活跃的）')
        : '读取中…'
      const html = status
        ? `当前聚焦：${status.effective || '（还没有）'} · ${modeText}` +
          (status.picked && status.mode === 'auto' ? ` · 自动挑的是 ${status.picked}` : '')
        : '正在读取当前聚焦…'
      return React.createElement(
        // 用 div 不用 label：label 里的按钮点击会被转发给关联控件，鼠标判定会怪
        'div',
        { style: rowStyle },
        React.createElement('span', { style: labelStyle }, '当前聚焦'),
        React.createElement(
          'div',
          { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' } },
          React.createElement('span', { style: hintStyle }, html),
          React.createElement(
            'div',
            { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            React.createElement('button', {
              type: 'button',
              disabled: disabled || !status?.picked,
              onClick: (e) => { e.preventDefault(); e.stopPropagation(); if (status?.picked) { form.set('focusChatTarget', status.picked); refresh() } },
              style: { padding: '4px 12px', cursor: 'pointer' },
            }, '用自动挑的这个'),
            React.createElement('button', {
              type: 'button',
              disabled: disabled,
              onClick: (e) => { e.preventDefault(); e.stopPropagation(); form.set('focusChatTarget', ''); refresh() },
              style: { padding: '4px 12px', cursor: 'pointer' },
            }, '清空（回到自动）'),
            React.createElement('button', {
              type: 'button',
              disabled: false,
              onClick: (e) => { e.preventDefault(); e.stopPropagation(); refresh() },
              style: { padding: '4px 12px', cursor: 'pointer' },
            }, '刷新'),
          ),
        ),
      )
    }

    /** 测试语音：按当前参数念一段文本，先发私聊、也能发群。 */
    function VoiceTestRow(props) {
      const [text, setText] = React.useState('')
      const [busy, setBusy] = React.useState('')
      const [note, setNote] = React.useState('')
      const send = async (target) => {
        if (!String(text).trim()) {
          setNote('先写要念的内容')
          return
        }
        setBusy(target)
        setNote('')
        try {
          const r = await fetch(`${QQ_STATUS_URL}/voice_test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, target }),
          })
          const j = await r.json()
          if (j?.ok) setNote(`已发（${target === 'private' ? '私聊' : '群里'}）：${j.text}`)
          else setNote('失败：' + (j?.error || '未知错误'))
        } catch (e) {
          setNote('失败：' + (e?.message ?? e))
        } finally {
          setBusy('')
        }
      }
      return React.createElement(
        'div',
        { style: { ...rowStyle, alignItems: 'flex-start' } },
        React.createElement('span', { style: { ...labelStyle, paddingTop: '6px' } }, '测试语音'),
        React.createElement(
          'div',
          { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' } },
          React.createElement('input', {
            type: 'text',
            value: text,
            onChange: (e) => setText(e.target.value),
            placeholder: '写一句要念的话（表情会被去掉，「彳亍」会念成「行～」）',
            style: inputStyle,
          }),
          React.createElement(
            'div',
            { style: { display: 'flex', gap: '8px' } },
            React.createElement('button', {
              type: 'button',
              disabled: Boolean(busy),
              onClick: () => send('private'),
              style: { padding: '4px 14px', cursor: 'pointer' },
            }, busy === 'private' ? '发送中…' : '发私聊测试'),
            React.createElement('button', {
              type: 'button',
              disabled: Boolean(busy),
              onClick: () => send('group'),
              style: { padding: '4px 14px', cursor: 'pointer' },
            }, busy === 'group' ? '发送中…' : '发群里测试'),
          ),
          note ? React.createElement('span', { style: hintStyle }, note) : null,
        ),
      )
    }

    /** GPT-SoVITS 版本下拉：换版本会重启 API（v4 慢但稳，v2 快但略飘）。 */
    const VOICE_VERSION_OPTIONS = [
      ['v4', 'v4（音色稳，20-40 秒/句）'],
      ['v2', 'v2（快，6-17 秒/句，音色略飘）'],
    ]

    function VoiceVersionRow(props) {
      const { form, value, disabled } = props
      const [pending, setPending] = React.useState(false)
      const [note, setNote] = React.useState('')
      const current = String(value || 'v4')
      const switchTo = async (next) => {
        setPending(true)
        setNote('')
        try {
          await form.set('gsvVersion', next)
          const r = await fetch(`${QQ_STATUS_URL}/voice_switch?version=${encodeURIComponent(next)}`)
          const j = await r.json()
          setNote(j?.note || '已发起重启')
          // 轮询等 API 起来：起来就把提示换成「启动完成」，别一直挂着「正在重启」
          for (let i = 0; i < 45; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 2000))
            try {
              const s = await fetch(`${QQ_STATUS_URL}/voice_status`, { cache: 'no-store' })
              const sj = await s.json()
              if (sj?.apiUp) {
                setNote(`启动完成（${j?.version || next}）`)
                break
              }
            } catch { /* 还没起来，继续等 */ }
          }
        } catch (e) {
          setNote('重启失败：' + (e?.message ?? e))
        } finally {
          setPending(false)
        }
      }
      return React.createElement(
        'label',
        { style: rowStyle },
        React.createElement('span', { style: labelStyle }, 'GPT-SoVITS 版本'),
        React.createElement('select', {
          value: current,
          disabled: disabled || pending,
          onChange: (e) => switchTo(e.target.value),
          style: { ...inputStyle, cursor: 'pointer' },
        }, VOICE_VERSION_OPTIONS.map(([id, name]) => React.createElement('option', { key: id, value: id }, name))),
        React.createElement('span', { style: hintStyle }, note || '换版本会重启 API（约 40 秒），期间发不出语音'),
      )
    }

    /** 语音方案下拉：QQ 官方 AI 语音 / 本地 GPT-SoVITS。 */
    const VOICE_GSV_FIELDS = [
      ['gsvApiUrl', 'API 地址', 'api_v2.py 默认 http://127.0.0.1:9880'],
      ['gsvDir', 'GPT-SoVITS 目录', '里面有 api_v2.py；留空＝没装，只能用官方语音'],
      ['gsvPython', 'Python 3.11 路径', '留空用 <DSH_HOME>/python311/python.exe'],
      ['gsvRefAudio', '参考音频（wav）', '3-10 秒，决定音色和情绪'],
      ['gsvRefText', '参考音频的文本', '要和音频里说的一字不差'],
      ['gsvRefLang', '参考音频语言', 'zh / en / ja'],
      ['gsvTextLang', '合成语言', 'zh / en / ja'],
    ]

    function VoiceBackendRow(props) {
      const { form, value, disabled } = props
      const [pending, setPending] = React.useState(false)
      const current = String(value || 'qq')
      return React.createElement(
        'label',
        { style: rowStyle },
        React.createElement('span', { style: labelStyle }, '语音方案'),
        React.createElement('select', {
          value: current,
          disabled: disabled || pending,
          onChange: async (e) => {
            setPending(true)
            try { await form.set('voiceBackend', e.target.value) } finally { setPending(false) }
          },
          style: { ...inputStyle, cursor: 'pointer' },
        }, [['qq', 'QQ 官方 AI 语音'], ['gpt-sovits', 'GPT-SoVITS（本地）']].map(([id, name]) => React.createElement('option', { key: id, value: id }, name))),
        React.createElement('span', { style: hintStyle }, '官方语音零依赖；GPT-SoVITS 要本机装 Python 3.11 + 模型，跑不动会自动退回官方'),
      )
    }

    /** 语音音色：QQ 的 AI 音色列表（和 NapCat get_ai_characters 返回的一致）。 */
    const VOICE_OPTIONS = [
      ['lucy-voice-laibixiaoxin', '小新（推荐）'],
      ['lucy-voice-houge', '猴哥（推荐）'],
      ['lucy-voice-silang', '四郎（推荐）'],
      ['lucy-voice-guangdong-f1', '东北老妹儿（推荐）'],
      ['lucy-voice-guangxi-m1', '广西大表哥（推荐）'],
      ['lucy-voice-daji', '妲己（推荐/古风）'],
      ['lucy-voice-lizeyan', '霸道总裁（推荐/现代）'],
      ['lucy-voice-suxinjiejie', '酥心御姐（推荐/现代）'],
      ['lucy-voice-m8', '说书先生（搞怪）'],
      ['lucy-voice-male1', '憨憨小弟（搞怪）'],
      ['lucy-voice-male3', '憨厚老哥（搞怪）'],
      ['lucy-voice-lvbu', '吕布（古风）'],
      ['lucy-voice-xueling', '元气少女（现代）'],
      ['lucy-voice-f37', '文艺少女（现代）'],
      ['lucy-voice-male2', '磁性大叔（现代）'],
      ['lucy-voice-female1', '邻家小妹（现代）'],
      ['lucy-voice-m14', '低沉男声（现代）'],
      ['lucy-voice-f38', '傲娇少女（现代）'],
      ['lucy-voice-m101', '爹系男友（现代）'],
      ['lucy-voice-female2', '暖心姐姐（现代）'],
      ['lucy-voice-f36', '温柔妹妹（现代）'],
      ['lucy-voice-f34', '书香少女（现代）'],
    ]

    /** 语音音色下拉：选中哪个，发语音就用哪个。 */
    function VoiceRow(props) {
      const { form, value, disabled } = props
      const [pending, setPending] = React.useState(false)
      const current = String(value || 'lucy-voice-female1')
      return React.createElement(
        'label',
        { style: rowStyle },
        React.createElement('span', { style: labelStyle }, '语音音色'),
        React.createElement('select', {
          value: current,
          disabled: disabled || pending,
          onChange: async (e) => {
            setPending(true)
            try { await form.set('voiceCharacter', e.target.value) } finally { setPending(false) }
          },
          style: { ...inputStyle, cursor: 'pointer' },
        }, VOICE_OPTIONS.map(([id, name]) => React.createElement('option', { key: id, value: id }, name))),
        React.createElement('span', { style: hintStyle }, '发语音用的音色（NapCat 的 AI 音色）；目前只在群语音发送时生效'),
      )
    }

    /** 多行文本：给「评论风格」这种长提示词用。 */
    function TextAreaRow(props) {
      const { form, field, label, hint, value, disabled } = props
      const [draft, setDraft] = React.useState(String(value ?? ''))
      React.useEffect(() => { setDraft(String(value ?? '')) }, [value])
      const commit = () => {
        const next = draft.trim()
        if (next !== String(value ?? '')) form.set(field, next)
      }
      return React.createElement(
        'div',
        { style: { ...rowStyle, alignItems: 'flex-start' } },
        React.createElement('span', { style: { ...labelStyle, paddingTop: '4px' } }, label),
        React.createElement('textarea', {
          value: draft,
          disabled,
          rows: 3,
          onChange: (e) => setDraft(e.target.value),
          onBlur: commit,
          style: { flex: 1, maxWidth: '520px', padding: '4px 6px', resize: 'vertical' },
          placeholder: hint || '',
        }),
      )
    }

    function SecretRow(props) {
      const { form, field, label, hint, disabled } = props
      const [draft, setDraft] = React.useState('')
      const [saved, setSaved] = React.useState(false)
      const commit = () => {
        const next = draft.trim()
        if (!next) return
        setDraft('')
        setSaved(true)
        later(() => setSaved(false))
        form.set(field, next)
      }
      return React.createElement(
        'label',
        { style: rowStyle },
        React.createElement('span', { style: labelStyle }, label),
        React.createElement('input', {
          type: 'password',
          value: draft,
          disabled,
          autoComplete: 'new-password',
          onChange: (e) => setDraft(e.target.value),
          onBlur: commit,
          onKeyDown: (e) => { if (e.key === 'Enter') e.currentTarget.blur() },
          style: inputStyle,
          placeholder: hint || '留空不修改',
        }),
        saved ? React.createElement('span', { style: hintStyle }, '已保存') : null,
      )
    }

    function BoolRow(props) {
      const { form, field, label, hint, pending, setPending, checked, disabled } = props
      const value = field in pending ? pending[field] : checked
      return React.createElement(
        'div',
        { style: rowStyle },
        React.createElement('input', {
          type: 'checkbox',
          checked: value,
          disabled,
          onChange: (e) => {
            const next = e.target.checked
            setPending((p) => ({ ...p, [field]: next }))
            const settle = () => setPending((p) => {
              const copy = { ...p }
              delete copy[field]
              return copy
            })
            Promise.resolve(form.set(field, next)).then(settle, settle)
          },
          style: { margin: 0, cursor: 'pointer' },
        }),
        React.createElement('span', { style: labelStyle }, label),
        hint ? React.createElement('span', { style: hintStyle }, hint) : null,
      )
    }

    // ================================================================= B站模块
    const BILI_GROUPS = [
      ['write', '写操作'],
      ['video', '看视频'],
      ['auto', '自动刷'],
      ['live', '直播'],
      ['conn', '连接/身份'],
    ]

    /** B站 字段归到哪一页。 */
    function biliGroupOf(field) {
      if (/^(videoFrame|historyReport)/.test(field)) return 'video'
      if (/^autoBrowse/.test(field)) return 'auto'
      if (/^(live|ffmpeg)/.test(field)) return 'live'
      if (/^(cookieFile|ownerUid|ownerName)$/.test(field)) return 'conn'
      return 'write'
    }

    const BILI_BOOL_FIELDS = [
      ['enabled', 'B站模块启用', '关掉后整个 B站 模块不工作：不注册 bili 工具、不抓帧、不提供 biliAgent 服务。写操作仍然要传 live=true 才真发'],
      ['allowLike', '允许点赞', '关闭后 like 直接返回「已被配置禁用」'],
      ['allowCoin', '允许投币', '硬币有限（小号只有 2 个），投光了就得等下次'],
      ['allowDanmaku', '允许发弹幕', '100 字上限，有最短间隔'],
      ['allowComment', '允许发评论', '可配合 comment 的 at_owner 在开头 @ 主人'],
      ['allowDm', '允许私信', '默认关闭；dm 不传 uid 就发给绑定的主人'],
      ['allowFollow', '允许关注与追番', '默认关闭'],
      ['liveEnabled', '直播挂起', '启用后按间隔自动抓图，关掉完全不碰直播'],
      ['videoFrameEnabled', '看视频时抓帧', '打开后 video 会抓几帧画面，我就能"看到"视频内容'],
      ['historyReportEnabled', '上报观看历史', '看视频时把进度上报给 B站，账号的「观看历史」里才会出现'],
      ['autoBrowseEnabled', '自动刷 B站', '按间隔自己看推荐、抓帧、记笔记；不用 DSH 那边开定时任务'],
      ['autoBrowseComment', '自动刷时评论', '只对大肥鱼 / 鲸鱼娘 / AI 角色相关的视频评，一条一条来，不水文'],
      ['autoBrowseNotify', '刷完用分享汇报', '刷完把看过的视频用「分享」发给主人，跟自动分享同一个样式；跟自动分享开关无关，要 QQ 模块启用'],
    ]

    const BILI_NUM_FIELDS = [
      ['likeIntervalSec', '点赞最小间隔（秒）', 'like'],
      ['coinIntervalSec', '投币最小间隔（秒）', 'coin'],
      ['danmakuIntervalSec', '弹幕最小间隔（秒）', 'danmaku'],
      ['commentIntervalSec', '评论最小间隔（秒）', 'comment'],
      ['dmIntervalSec', '私信最小间隔（秒）', 'dm'],
      ['liveFrameIntervalSec', '抓图间隔（秒，60＝1 分钟）', ''],
      ['videoFrameCount', '每个视频抓几帧', ''],
      ['followIntervalSec', '关注/追番最小间隔（秒）', 'follow'],
      ['perActionGapSec', '同类动作最短间隔（秒，0＝不限）', '对所有写操作生效，和上面各自的间隔取更严的那个'],
      ['ownerAtMinGapSec', '@ 主人最小间隔（秒，21600＝6 小时）', ''],
      ['autoBrowseIntervalSec', '自动刷间隔（秒，1200＝20 分钟）', ''],
      ['autoBrowseCount', '每轮看几条（1~3）', ''],
    ]

    const BILI_LIST_FIELDS = [
      ['autoBrowseTopics', '可评话题关键词', '命中标题/简介/UP/标签才评；留空就都不评'],
    ]

    const BILI_TEXTAREA_FIELDS = [
      ['autoBrowseCommentStyle', '自动评论怎么写', '给模型的指令，默认一两句、说具体的、不水文'],
    ]

    const BILI_TEXT_FIELDS = [
      ['ownerUid', '主人 B站 UID', '评论里 @ 主人时按它查昵称'],
      ['ownerName', '主人显示名', '填了就直接用这个，不再按 UID 查'],
      ['cookieFile', 'cookie 文件路径', '留空用 <DSH_HOME>/bili/cookies.json'],
      ['liveUrl', '直播间链接', 'https://live.bilibili.com/房间号；QQ 侧填了就优先用 QQ 的'],
      ['ffmpegPath', 'ffmpeg 路径', '抓直播帧和视频帧都用它；留空就找 PATH 和默认路径'],
      ['liveFrameDir', '抓图目录', '留空用 <DSH_HOME>/bili/image'],
      ['videoFrameDir', '视频帧目录', '留空用 <DSH_HOME>/bili/frame'],
      ['autoBrowseProvider', '自动刷模型路由', 'DSH 的 llm provider，默认 deepseek-account'],
      ['autoBrowseModel', '自动刷模型名', '默认 deepseek-flash'],
    ]

    const BILI_ACTION_LABELS = {
      like: '点赞',
      coin: '投币',
      danmaku: '弹幕',
      comment: '评论',
      dm: '私信',
      follow: '关注',
      follow_season: '追番',
      autoBrowse: '自动刷',
      liveFrame: '直播抓帧',
    }

    /** 冷却状态面板：倒计时 + 跳过。labels 决定显示哪些项，B站/QQ 共用。 */
    function CooldownPanel({ labels, cooldowns, onSkip }) {
      const rows = Object.keys(labels || {}).filter((a) => Number(cooldowns[a]) > 0)
      // 跳过 / 倒计时结束都给一句反馈，否则点了按钮界面没有任何变化，看着像没生效
      const [msg, setMsg] = React.useState('')
      const prevRows = React.useRef([])
      const rowKey = rows.join(',')
      React.useEffect(() => {
        const ended = prevRows.current.filter((a) => !rows.includes(a))
        if (ended.length) setMsg(`「${labels[ended[0]] || ended[0]}」冷却结束`)
        prevRows.current = rows
      }, [rowKey])
      React.useEffect(() => {
        if (!msg) return undefined
        const t = setTimeout(() => setMsg(''), 4000)
        return () => clearTimeout(t)
      }, [msg])
      return React.createElement(
        'div',
        {
          style: {
            margin: '4px 0 12px',
            padding: '8px 10px',
            border: '1px solid rgba(128,128,128,0.25)',
            borderRadius: '6px',
            background: 'rgba(128,128,128,0.06)',
          },
        },
        React.createElement('div', { style: { fontWeight: 600, marginBottom: '4px' } }, '冷却状态'),
        rows.length
          ? rows.map((a) => React.createElement(
              'div',
              { key: a, style: rowStyle },
              React.createElement('span', { style: { minWidth: '90px', opacity: 0.9 } }, labels[a]),
              React.createElement('span', { style: cdStyle }, `${Number(cooldowns[a])} 秒`),
              React.createElement('button', {
                type: 'button',
                style: skipStyle,
                onClick: () => {
                  setMsg(`已跳过「${labels[a] || a}」`)
                  onSkip(a)
                },
              }, '跳过'),
            ))
          : React.createElement('div', { style: hintStyle }, '没有在冷却中的动作，可以直接调'),
        msg
          ? React.createElement('div', { style: { ...hintStyle, color: '#2e7d32', marginTop: '4px' } }, msg)
          : null,
      )
    }

    function createBiliPage(form) {
      return function BiliConfig() {
        const snap = useSnapshot(form)
        const [pending, setPending] = React.useState({})
        const [cooldowns, setCooldowns] = useCooldowns(BILI_STATUS_URL, {})
        const [activeTab, setActiveTab] = React.useState(BILI_GROUPS[0][0])
        const skipCooldown = (action) => {
          fetch(`${BILI_STATUS_URL}/skip?action=${encodeURIComponent(action)}`, { method: 'POST' })
            .then(() => setCooldowns((s) => ({ ...s, [action]: 0 })))
            .catch(() => {})
        }
        if (snap.status !== 'ready' || !snap.value) {
          return React.createElement(
            'div',
            { style: { padding: '12px 0', opacity: 0.7 } },
            snap.status === 'unavailable' ? '这个配置项当前不可用。' : '正在读取配置…',
          )
        }
        const v = snap.value
        const children = [
          React.createElement(
            'p',
            { key: 'hint', style: { opacity: 0.7, marginBottom: '8px' } },
            '改完立即生效，写操作还要在调用时传 live=true 才会真正发出。',
          ),
          React.createElement(
            'div',
            { key: 'tabs', style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' } },
            ...BILI_GROUPS.map(([key, label]) => React.createElement('button', {
              key,
              type: 'button',
              onClick: () => setActiveTab(key),
              style: tabStyle(activeTab === key),
            }, label)),
          ),
        ]

        // 冷却状态放在标签栏下面，五个子页都能看到，不用来回切
        children.push(React.createElement(CooldownPanel, {
          key: 'cooldowns',
          labels: BILI_ACTION_LABELS,
          cooldowns,
          onSkip: skipCooldown,
        }))

        for (const [field, label, hint] of BILI_BOOL_FIELDS) {
          if (biliGroupOf(field) !== activeTab) continue
          children.push(React.createElement(BoolRow, {
            key: field, form, field, label, hint, pending, setPending,
            checked: Boolean(v[field]),
            disabled: !snap.writable,
          }))
        }

        for (const [field, label, action] of BILI_NUM_FIELDS) {
          if (biliGroupOf(field) !== activeTab) continue
          children.push(
            React.createElement(NumberRow, {
              key: field,
              form,
              field,
              label,
              action,
              cooldowns,
              onSkip: skipCooldown,
              value: Number(v[field] ?? 0),
              disabled: !snap.writable,
            }),
          )
        }

        for (const [field, label, hint] of BILI_LIST_FIELDS) {
          children.push(
            React.createElement(ListRow, {
              key: field, form, field, label, hint,
              value: v[field] ?? '',
              disabled: !snap.writable,
            }),
          )
        }

        for (const [field, label, hint] of BILI_TEXT_FIELDS) {
          if (biliGroupOf(field) !== activeTab) continue
          children.push(
            React.createElement(TextRow, {
              key: field, form, field, label, hint,
              value: v[field] ?? '',
              disabled: !snap.writable,
            }),
          )
        }

        for (const [field, label, hint] of BILI_TEXTAREA_FIELDS) {
          if (biliGroupOf(field) !== activeTab) continue
          children.push(
            React.createElement(TextAreaRow, {
              key: field, form, field, label, hint,
              value: v[field] ?? '',
              disabled: !snap.writable,
            }),
          )
        }

        return React.createElement('div', { style: { padding: '8px 0' } }, ...children)
      }
    }

    // ================================================================== QQ模块
    const QQ_GROUPS = [
      ['conn', '连接'],
      ['login', '登录'],
      ['reply', '回复'],
      ['poke', '搓一搓'],
      ['group', '群聊'],
      ['media', '媒体'],
      ['voice', '语音'],
      ['share', '分享视频'],
      ['proactive', '主动'],
      ['task', '任务/搜索'],
      ['memory', '记忆'],
      ['balance', '余额'],
      ['system', '系统'],
      ['logs', '日志'],
    ]

    /** 日志页：插件日志 / NapCat 日志 / 聊天记录，点开看尾部内容。 */
    function LogsPanel() {
      const [data, setData] = React.useState({ groups: [] })
      const [sel, setSel] = React.useState('')
      const [view, setView] = React.useState({ text: '', error: '', note: '' })
      const [lines, setLines] = React.useState(300)
      const [busy, setBusy] = React.useState(false)

      const loadList = React.useCallback(async () => {
        setBusy(true)
        try {
          const r = await fetch(`${QQ_STATUS_URL}/logs`, { cache: 'no-store' })
          const d = await r.json()
          setData(d && d.groups ? d : { groups: [] })
        } catch {
          setData({ groups: [] })
        } finally {
          setBusy(false)
        }
      }, [])

      const loadView = React.useCallback(async (id, n) => {
        try {
          const r = await fetch(`${QQ_STATUS_URL}/logs/view?id=${encodeURIComponent(id)}&lines=${n}`, { cache: 'no-store' })
          const d = await r.json()
          if (d && d.ok) {
            setView({ text: d.text || '', error: '', note: d.truncated ? '（文件太大，只读了最后 2MB）' : '' })
          } else {
            setView({ text: '', error: (d && d.error) || '读取失败', note: '' })
          }
        } catch (e) {
          setView({ text: '', error: String(e && e.message ? e.message : e), note: '' })
        }
      }, [])

      React.useEffect(() => { loadList() }, [loadList])
      React.useEffect(() => { if (sel) loadView(sel, lines) }, [sel, lines, loadView])

      const btn = (label, onClick, active) => React.createElement('button', {
        type: 'button',
        onClick,
        style: {
          padding: '4px 10px',
          marginRight: '6px',
          marginBottom: '6px',
          borderRadius: '6px',
          border: '1px solid rgba(128,128,128,0.3)',
          background: active ? 'rgba(128,128,128,0.18)' : 'transparent',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: '12px',
        },
      }, label)

      return React.createElement(
        'div',
        { style: { padding: '8px 0' } },
        React.createElement(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' } },
          React.createElement('button', {
            type: 'button',
            onClick: () => { loadList(); if (sel) loadView(sel, lines) },
            disabled: busy,
            style: {
              padding: '5px 14px',
              borderRadius: '6px',
              border: '1px solid rgba(128,128,128,0.3)',
              background: 'transparent',
              color: 'inherit',
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.6 : 1,
            },
          }, busy ? '刷新中…' : '刷新'),
          React.createElement('span', { style: { fontSize: '12px', opacity: 0.7 } }, '显示行数'),
          React.createElement('select', {
            value: String(lines),
            onChange: (e) => setLines(Number(e.target.value) || 300),
            style: { padding: '3px 6px', borderRadius: '6px', background: 'transparent', color: 'inherit', border: '1px solid rgba(128,128,128,0.3)' },
          }, [100, 300, 800, 2000].map((n) => React.createElement('option', { key: n, value: String(n) }, String(n)))),
        ),
        React.createElement('div', { style: { marginBottom: '8px' } },
          data.groups.length
            ? data.groups.map((g) => React.createElement('div', { key: g.name, style: { marginBottom: '6px' } },
                React.createElement('div', { style: { fontSize: '12px', fontWeight: 600, opacity: 0.75, marginBottom: '4px' } },
                  `${g.name}（${g.files.length}）`),
                React.createElement('div', null, g.files.map((f) => btn(f.label, () => setSel(f.id), sel === f.id))),
              ))
            : React.createElement('div', { style: { fontSize: '12px', opacity: 0.6 } },
                '还没找到日志。NapCat 的日志要它自己写过（logs 目录），插件日志要触发过对应动作。'),
        ),
        sel
          ? React.createElement('div', null,
              React.createElement('div', { style: { fontSize: '12px', opacity: 0.6, marginBottom: '4px' } },
                sel + (view.note ? ' ' + view.note : '')),
              view.error
                ? React.createElement('div', { style: { fontSize: '12px', color: '#c62828' } }, view.error)
                : React.createElement('pre', {
                    style: {
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      fontSize: '12px',
                      lineHeight: 1.5,
                      maxHeight: '420px',
                      overflow: 'auto',
                      margin: 0,
                      padding: '8px',
                      borderRadius: '8px',
                      background: 'rgba(128,128,128,0.08)',
                    },
                  }, view.text || '（空文件）'),
            )
          : null,
      )
    }

    /** 登录子页面：状态 + 二维码 + 启动按钮，全在模块页里操作，不弹独立网页。 */
    function LoginPanel() {
      const [st, setSt] = React.useState({ phase: 'loading' })
      const [busy, setBusy] = React.useState(false)
      const [stopping, setStopping] = React.useState(false)
      const [confirmStop, setConfirmStop] = React.useState(false)
      const [note, setNote] = React.useState('')
      React.useEffect(() => {
        let alive = true
        const poll = async () => {
          try {
            const r = await fetch(`${QQ_STATUS_URL}/login`, { cache: 'no-store' })
            const d = await r.json()
            if (alive) setSt(d)
          } catch {
            if (alive) setSt({ phase: 'error' })
          }
        }
        poll()
        const t = setInterval(poll, 3000)
        return () => { alive = false; clearInterval(t) }
      }, [])
      const start = () => {
        setBusy(true)
        fetch(`${QQ_STATUS_URL}/login/start`, { method: 'POST' })
          .catch(() => {})
          .finally(() => setTimeout(() => setBusy(false), 4000))
      }
      const openDir = () => {
        fetch(`${QQ_STATUS_URL}/login/open`, { method: 'POST' })
          .then((r) => r.json())
          .then((d) => { if (d && d.dir) setSt((s) => ({ ...s, dir: d.dir })) })
          .catch(() => {})
      }
      /** 退出登录 = 让插件把 NapCat 进程杀掉。两次点击确认，防手滑。 */
      const stopLogin = () => {
        if (!confirmStop) {
          setConfirmStop(true)
          setNote('再点一次「确认退出」，NapCat 会被直接关掉')
          setTimeout(() => setConfirmStop(false), 5000)
          return
        }
        setConfirmStop(false)
        setStopping(true)
        setNote('正在关闭 NapCat…（会弹管理员授权，点「是」）')
        fetch(`${QQ_STATUS_URL}/login/stop`, { method: 'POST' })
          .then((r) => r.json())
          .then((d) => {
            if (d && d.ok) {
              setNote(`已退出登录${d.pid ? `（PID ${d.pid}）` : ''}。要重新登录就点「启动登录服务」。`)
              setSt((s) => ({ ...s, loggedIn: false, loggedOut: true, phase: 'offline' }))
            } else {
              setNote(`没退成：${(d && d.error) || '未知原因'}`)
            }
          })
          .catch((e) => setNote(`请求失败：${e && e.message ? e.message : e}`))
          .finally(() => setStopping(false))
      }
      const phase = st.phase || 'loading'
      const loggedOut = Boolean(st.loggedOut) && phase !== 'ready'
      const pkgBusy = Boolean(st.pkgBusy)
      const pkgError = String(st.pkgError || '')
      const color = pkgBusy ? '#e6a23c'
        : pkgError ? '#c62828'
          : phase === 'ready' ? '#2e7d32'
            : phase === 'waiting_qrcode' ? '#e6a23c'
              : loggedOut ? '#999'
                : phase === 'loading' ? '#999' : '#c62828'
      const text = pkgBusy ? '正在解压 NapCat（首次约 1 分钟）…'
        : pkgError ? 'NapCat 初始化失败'
          : phase === 'ready' ? '已登录，二维码已清理'
            : phase === 'waiting_qrcode' ? '等待扫码'
              : loggedOut ? '已退出登录（点「启动登录服务」重新登录）'
                : phase === 'loading' ? '正在读取状态…'
                  : '登录服务没在运行'
      // 已登录时同一个按钮变「退出登录」，点了走退出那套
      const loggedIn = phase === 'ready'
      return React.createElement(
        'div',
        { style: { padding: '8px 0' } },
        React.createElement(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' } },
          React.createElement('span', {
            style: { width: '8px', height: '8px', borderRadius: '50%', background: color, display: 'inline-block' },
          }),
          React.createElement('span', { style: { fontWeight: 600 } }, text),
        ),
        pkgError
          ? React.createElement('div', { style: { fontSize: '12px', color: '#c62828', marginBottom: '8px' } }, pkgError)
          : null,
        st.pid
          ? React.createElement('div', { style: { fontSize: '12px', opacity: 0.6, marginBottom: '8px' } },
              `NapCat PID ${st.pid}（「退出登录」就是把它杀掉）`)
          : null,
        phase === 'waiting_qrcode'
          ? React.createElement(
              'div',
              { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px' } },
              React.createElement('img', {
                src: `${QQ_STATUS_URL}/qr/png?t=${st.qrAt || 0}`,
                alt: 'QQ 登录二维码',
                style: { width: '260px', height: '260px', background: '#fff', borderRadius: '8px', padding: '6px' },
              }),
              React.createElement('div', { style: { opacity: 0.65, fontSize: '12px' } },
                '用手机 QQ 扫码，扫完在手机上点「确认」。登录成功后这张二维码会自动删掉。'),
            )
          : null,
        React.createElement(
          'div',
          { style: { marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
          React.createElement('button', {
            type: 'button',
            onClick: () => { if (loggedIn || confirmStop) stopLogin(); else start() },
            disabled: busy || stopping,
            title: loggedIn ? '关掉 NapCat 进程，相当于在手机上退出登录' : '',
            style: {
              padding: '5px 14px',
              borderRadius: '6px',
              border: (loggedIn || confirmStop) ? '1px solid #f56c6c' : '1px solid rgba(128,128,128,0.3)',
              background: 'transparent',
              color: (loggedIn || confirmStop) ? '#f56c6c' : 'inherit',
              cursor: busy || stopping ? 'default' : 'pointer',
              opacity: busy || stopping ? 0.6 : 1,
            },
          }, stopping ? '正在退出…' : (busy ? '正在拉起…' : (confirmStop ? '确认退出' : (loggedIn ? '退出登录' : '启动登录服务')))),
          React.createElement('button', {
            type: 'button',
            onClick: openDir,
            style: {
              padding: '5px 14px',
              borderRadius: '6px',
              border: '1px solid rgba(128,128,128,0.3)',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
            },
          }, '打开 NapCat 目录'),
        ),
        note
          ? React.createElement('div', {
              style: {
                marginTop: '8px',
                fontSize: '12px',
                lineHeight: 1.6,
                color: /没退成|失败/.test(note) ? '#c62828' : 'inherit',
                opacity: /没退成|失败/.test(note) ? 1 : 0.75,
              },
            }, note)
          : null,
        React.createElement(
          'div',
          { style: { marginTop: '10px', fontSize: '12px', lineHeight: 1.7, opacity: 0.75 } },
          React.createElement('div', null, '启动需要管理员权限，任选一种：'),
          React.createElement('div', null, '① 点上面的按钮（已登录时是「退出登录」），在弹出 UAC 窗口点「是」'),
          React.createElement('div', null, '② 点「打开 NapCat 目录」，右键 launcher.bat → 以管理员身份运行'),
          React.createElement('div', { style: { marginTop: '4px', opacity: 0.8 } },
            'NapCat 目录：', React.createElement('code', null, st.dir || '<DSH_HOME>/napcat/napcat')),
        ),
      )
    }

    /** QQ 侧在冷却的功能（和 /cooldowns 返回的字段对应）。 */
    const QQ_COOLDOWN_LABELS = {
      proactive: '主动搭话',
      videoShare: '视频分享',
      webSearch: '联网搜索',
      ruleSync: '群规同步',
      balance: '余额检查',
      replyGap: '回复间隔',
      quiet: '反思中',
      poke: '搓一搓',
    }

    /** QQ 字段归到哪个分类页，按名字前缀判断。 */
    function qqGroupOf(field) {
      if (/^(enabled|napcatHttp|napcatWs|onebotToken|autoStartNapCat|napcatHiddenLaunch|napcatDir|napcatLauncher|napcatQrPath|napcatQuickLogin|ownerLabel|takeoverLabel|selfLabel)$/.test(field)) return 'conn'
      if (/^(autoReply|onlyReplyOwner|replyDelay|replyGapSec|groupReplyChance|groupHistoryLimit|groupQuoteChance|groupSplitReply|privateQuoteChance|faceReply|rant|swear|retort|relay)/.test(field)) return 'reply'
      if (/^poke/.test(field)) return 'poke'
      if (/^(rule|neighbor|quiet)/.test(field)) return 'group'
      if (/^videoShare/.test(field)) return 'share'
      if (/^voice/.test(field)) return 'voice'
      if (/^(image|sticker|live|shareCard)/.test(field)) return 'media'
      if (/^(proactive|focusChat)/.test(field)) return 'proactive'
      if (/^(webSearch|searchDelegate|task)/.test(field)) return 'task'
      if (/^balance/.test(field)) return 'balance'
      if (/^(isolateHostQq|isolateGroupPrivate|sharedMemory)/.test(field)) return 'memory'
      return 'system'
    }

    const QQ_BOOL_FIELDS = [
      ['enabled', 'QQ模块启用', '关掉后不连 NapCat、不注册 qq 工具，自动回复/主动搭话/群规/余额全停；登录页的「启动登录服务」「退出登录」仍然可用'],
      ['autoReplyEnabled', '自动回复总开关', '私聊和群聊一起管；群里接话频率看下面的概率'],
      ['onlyReplyOwner', '只回复主人', '打开后其他人的消息一律不理'],
      ['proactiveEnabled', '主动搭话', '按随机间隔主动发消息'],
      ['ruleSyncEnabled', '主动记群规', '定时看群公告和群介绍，记成群规'],
      ['ruleInject', '群规注入', '在群里说话时让模型参考该群群规'],
      ['liveEnabled', '直播挂起', '启用后才会要帧和读速记，关掉完全不碰'],
      ['liveRequestEnabled', '聊到直播时向 DSH 要一帧', '画面由 DSH 侧看，插件不看'],
      ['webSearchEnabled', '联网搜索（总开关）', '关掉就一句都不查'],
      ['webSearchPrivate', '私聊搜索', '私聊里带搜索意图时联网查'],
      ['webSearchInGroup', '群聊里也搜索', '被 @ 和随机接话共用；频率由「搜索最短间隔」控制'],
      ['searchDelegateEnabled', '搜索转交 DSH', '只写请求，由 DSH 侧搜（主人到电脑前再开）'],
      ['webSearchReport', '搜到后说出来', '关掉就只拿来自查，回复里不提「我查了一下」'],
      ['taskDelegateEnabled', '任务转交 DSH', '主人私聊派活时交给 DSH 侧开工会话'],
      ['balanceWarnEnabled', '余额预警', '低于阈值时私聊提醒主人'],
      ['balanceStopGroupOnLow', '低余额停群聊', '低于阈值就只回主人私聊，不主动搭话'],
      ['autoStartNapCat', '自动拉起 NapCat', '启动/用到 QQ 时没开就拉起并弹二维码'],
      ['napcatHiddenLaunch', '隐藏窗口启动', '用 VBS 静默启动 NapCat；关掉会弹 cmd 窗口，方便看日志'],
      ['isolateHostQq', '前后端记忆隔离', '打开后 DS 侧（DSH）和大肥鱼各用各的记忆，互不读取；关着就是两边共用一份'],
      ['sharedMemorySummary', '共享记忆超长时留头留尾', '保留开头（身份/锚点）+ 结尾（最新），中间省略；关掉只读前面那截'],
      ['isolateGroupPrivate', '群与个人记忆隔离', '打开后群里聊的不带进私聊、私聊的不带进群，不同 QQ 之间也各记各的'],
      ['sharedMemoryPrivate', '私聊读共享记忆', '关掉就只用插件自己的记忆'],
      ['chatLogEnabled', '聊天日志', '按会话分文件记在 qq/chat，关掉就完全不记'],
      ['logSelfMessages', '记录自己发的', '插件自己发的消息也记一条 DS'],
      ['takeoverEnabled', '识别接管发言', '主人用 DS 账号在客户端发的话记成 Admin'],
      ['relayEnabled', '跟着接龙', '群里多人刷同一句时跟着复读一两次；一个人纯刷屏不跟，30 秒没人接就重置'],
      ['imageVisionEnabled', '自动识图', '收到图时用 DSH 的多模态模型自己看，不再说看不到'],
      ['videoShareEnabled', '自动分享视频', '每隔一段时间，从刷过的 B站 视频里挑一条没分享过的发出去'],
      ['shareCardWatch', '打开分享卡片看内容', '别人发 B站 链接/小程序卡片时，顺着跳转点进去看标题、UP、简介、字幕、热评再回话；关掉就只按卡片标题接'],
      ['stickerEnabled', '表情包库', '收图时顺手收进表情库，群里按话题随机发'],
      ['stickerFavorEnabled', '收进 QQ 我的表情', '收到的图顺手加进账号收藏表情（NapCat add_custom_face）'],
      ['swearEnabled', '脏话与谐音', '群规没禁时可以偶尔带脏话、用谐音梗接'],
      ['rantEnabled', '主动吐槽', '看到离谱或好笑的事主动吐槽一句'],
      ['retortEnabled', '被骂时还嘴', '关掉就不还嘴（当没看见或轻描淡写带过）；方案在下面「还嘴方案设置」里编'],
      ['pokeBackEnabled', '被搓一搓就搓回去', '别人戳一戳/搓一搓你时，回搓一下'],
      ['pokeReplyEnabled', '搓完再想想要不要接一句', '搓回去以后交给模型判断：想接就接一句，不想接就只回搓一下'],
      ['faceReplyEnabled', '允许用 QQ 表情回话', '回复里写 [微笑] 这类会变成真表情'],
      ['groupSplitReply', '群回复分段发', '一句话拆成两三条短消息，像人一段一段打'],
      ['shortReplySplitChance', '短回复拆条概率（0-100）', '80 字以内的短回复拆成两条发的概率，0 = 永远整条发；30 = 大约三成会拆'],
      ['queueStaleSec', '排队消息过期（秒）', '同一会话正在回时后来的消息会排队；排太久的直接不回，免得回一句跟当前聊天对不上号。0 = 不限制'],
    ]

    const QQ_NUM_FIELDS = [
      ['replyDelayMinSec', '回复最短等待（秒）', ''],
      ['replyDelayMaxSec', '回复最长等待（秒）', ''],
      ['neighborReplyChance', '跟隔壁家搭话的概率（0-100）', ''],
      ['replyGapSec', '自动回复最短间隔（秒，0＝不限）', '每回一条后就等这么久再回下一条；自己主动发的不受这个限制'],
      ['proactiveMinGapSec', '主动最短间隔（秒）', 'proactive'],
      ['proactiveMaxGapSec', '主动最长间隔（秒）', ''],
      ['proactiveDailyLimit', '每天最多主动几次', ''],
      ['proactiveQuietStart', '免打扰开始（小时）', ''],
      ['proactiveQuietEnd', '免打扰结束（小时）', ''],
      ['proactiveGroupMinGapSec', '群聊接话最短间隔（秒）', ''],
      ['groupReplyChance', '群聊随机接话概率（0-100）', ''],
      ['quietAfterComplaintSec', '被说吵后安静多少秒', '被群友说吵/刷屏后，这段时间内只回 @ 和点名；0 关闭'],
      ['ruleSyncHours', '群规多久重看一次（小时）', 'ruleSync'],
      ['ruleMaxChars', '注入群规字数上限', ''],
      ['liveMaxAgeSec', '直播速记有效期（秒，1200＝20 分钟）', ''],
      ['liveRequestCooldownSec', '要帧最短间隔（秒）', ''],
      ['videoShareIntervalSec', '分享间隔（秒，最小 60）', 'videoShare'],
      ['videoShareDelaySec', '分享前倒计时（秒）', ''],
      ['videoShareMaxAgeHours', '只分享几小时内看过的（0 不限）', ''],
      ['groupHistoryLimit', '群聊参考最近几条消息', ''],
      ['webSearchCooldownSec', '搜索最短间隔（秒）', 'webSearch'],
      ['balanceWarnThreshold', '余额预警阈值（元）', 'balance'],
      ['balanceCheckHours', '余额多久查一次（小时）', 'balance'],
      ['contextRotateRounds', '多少轮提醒归档/换会话', '0 关闭'],
      ['chatLogMaxKB', '单会话日志上限（KB）', '超了归档到 chat/old'],
      ['stickerChance', '群里发表情包概率（0-100）', '回完话后附一张的概率'],
      ['voiceChance', '主动发语音概率（0-100）', '闲聊时把这条文字换成语音的概率；0＝只在被要求时发，长回复仍走文字'],
      ['stickerSendMinGapSec', '同群两次表情包最短间隔（秒）', ''],
      ['stickerMax', '表情包库最多保留张数', '超了删最旧的'],
      ['stickerResizeMaxPx', '发表情包缩到几像素', '默认 240，接近 QQ 表情尺寸；0 不缩'],
      ['swearBanSec', '被说别骂人后禁说多久（秒）', ''],
      ['groupAtBackThreshold', '群里被 @ 几次后 @ 回去', '被同一个人 @ 这么多次才回一次 @，然后清零'],
      ['sharedMemoryMaxChars', '共享记忆最多读多少字（0＝无上限）', ''],
      ['pokeGapSec', '同一个人两次搓一搓最少隔几秒', 'poke'],
      ['pokeReplyChance', '搓回去后接一句的几率（0-100）', '剩下只回搓、不说话'],
      ['groupQuoteChance', '群里引用回复概率（0-100）', '被 @ 时一定引用，平时按这个概率混合'],
      ['privateQuoteChance', '私聊引用回复概率（0-100）', '问句和请求类更容易引用，闲聊偶尔引'],
    ]

    const QQ_LIST_FIELDS = [
      ['proactiveTargets', '主动搭话对象列表', '留空用主人'],
      ['proactiveGroups', '主动接话的群号列表', '留空不在群里说话'],
      ['ruleGroups', '要记群规的群号', '留空表示所有群'],
      ['neighborBots', '隔壁家的 AI QQ 号', '这些号显示成「隔壁家的<名字>」，不跟它的人设'],
      ['neighborNameKeywords', '按名字认隔壁家（可选）', '留空就别按名字猜，昵称带「肥鱼」的真人不少'],
      ['sharedMemoryGroups', '读共享记忆的群号', '* 全部，none 都不读'],
    ]

    const QQ_TEXT_FIELDS = [
      ['napcatHttp', 'NapCat HTTP 地址', 'http://127.0.0.1:3000'],
      ['napcatWs', 'NapCat WebSocket 地址', 'ws://127.0.0.1:3011，留空关闭自动回复'],
      ['ownerQQ', '主人 QQ 号', '必填：不填就认不出主人（没人叫得上「主人」、也不会 @ 主人）。留空时插件会把第一条私聊它的人自动当主人，之后在这儿改；多个号用逗号分隔'],
      ['liveUrl', '直播间链接', ''],
      ['liveFramePath', '抓图路径覆盖', ''],
      ['videoShareTarget', '分享视频的目标', '留空＝发主人私聊；*＝当前聚焦的 QQ 会话；也可以填群号或 QQ 号'],
      ['focusChatTarget', '聚焦聊天（手动指定）', '填群号或 QQ 号就只盯这一个会话：主动搭话不去别处、这个窗口的消息都跟上。留空＝按活跃度自动挑（大肥鱼自己的玩法，别的用户不用动）'],
      ['videoShareCardStyle', '分享样式', 'text＝封面图+标题+b23 短链（手机端样式）；link＝纯文本+标题+完整 bilibili.com 链接（电脑端样式）'],
      ['taskSessionName', 'DSH 会话名', '主人派活时新会话叫什么'],
      ['taskDefaultModel', '派活默认模型', 'flash 或 pro'],
      ['taskDefaultEffort', '派活默认强度', 'high / medium / low'],

      ['napcatLauncher', 'launcher.bat 路径', '留空用 <napcatDir>/napcat/launcher.bat'],
      ['napcatQrPath', '登录二维码路径', '留空用 <napcatDir>/napcat/cache/qrcode.png'],
      ['napcatQuickLogin', '快速登录 QQ 号', '填了启动时带这个号免扫码；留空扫码登录'],
      ['taskKeywords', '额外任务关键词', '逗号分隔，留空用内置'],
      ['taskResultNotify', '任务完成通知', '干完私聊告诉主人'],
      ['taskMaxPerDay', '每天任务上限', '0 不限'],
      ['llmBaseUrl', '模型接口地址', 'OpenAI 兼容，留空只用短句池'],
      ['llmModel', '模型名', 'deepseek-chat'],
      ['selfLabel', '自己发的标签', '日志里插件自己发消息的身份，默认 DS'],
      ['ownerLabel', '主人号标签', '主人号（配置里的 ownerQQ）发言时日志里显示成什么，默认 主人'],
      ['takeoverLabel', '接管发言标签', '主人在 QQ 客户端用 DS 号发言时显示成什么，默认 Admin'],
      ['imageProvider', '识图模型路由', 'DSH 的 llm provider，默认 deepseek-account'],
      ['imageModel', '识图模型名', '默认 deepseek-flash（需要支持图片输入）'],
      ['apiKeyFile', 'API Key 文件路径', '留空用 <DSH_HOME>/qq/api-key.txt'],
    ]

    const QQ_SECRET_FIELDS = [
      ['deepseekApiKey', 'DeepSeek API Key', '留空保持原值；填了才覆盖'],
      ['onebotToken', 'OneBot 访问 token', 'NapCat 没设就留空；留空保持原值'],
    ]

    function DailyQuotaRow(props) {
      const { form, used, limit, disabled } = props
      const [editing, setEditing] = React.useState(false)
      const [limitEditing, setLimitEditing] = React.useState(false)
      const [draft, setDraft] = React.useState(String(used))
      const [limitDraft, setLimitDraft] = React.useState(String(limit))
      React.useEffect(() => { if (!editing) setDraft(String(used)) }, [used, editing])
      React.useEffect(() => { setLimitDraft(String(limit)) }, [limit])
      const commitUsed = () => {
        const n = Number(draft)
        if (Number.isFinite(n) && n >= 0) {
          fetch(`${QQ_STATUS_URL}/set_used?n=${encodeURIComponent(Math.trunc(n))}`, { method: 'POST' })
            .catch(() => {})
        } else {
          setDraft(String(used))
        }
        setEditing(false)
      }
      const commitLimit = () => {
        const n = Number(limitDraft)
        if (Number.isFinite(n) && n >= 0) form.set('proactiveDailyLimit', Math.trunc(n))
        else setLimitDraft(String(limit))
        setLimitEditing(false)
      }
      const cellStyle = {
        cursor: disabled ? 'default' : 'pointer',
        padding: '2px 10px',
        border: '1px solid rgba(128,128,128,0.35)',
        borderRadius: '4px',
        fontVariantNumeric: 'tabular-nums',
      }
      return React.createElement(
        'div',
        { style: rowStyle },
        React.createElement('span', { style: labelStyle }, '今日已发'),
        editing
          ? React.createElement('input', {
              type: 'number',
              min: 0,
              autoFocus: true,
              className: 'versatileds-num',
              value: draft,
              onChange: (e) => setDraft(e.target.value),
              onBlur: commitUsed,
              onKeyDown: (e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setEditing(false)
              },
              style: { width: '70px', padding: '2px 6px' },
            })
          : React.createElement('span', {
              onClick: () => { if (!disabled) setEditing(true) },
              title: disabled ? '' : '点击修改已发次数',
              style: cellStyle,
            }, String(used)),
        React.createElement('span', { style: hintStyle }, '/'),
        limitEditing
          ? React.createElement('input', {
              type: 'number',
              min: 0,
              autoFocus: true,
              className: 'versatileds-num',
              value: limitDraft,
              onChange: (e) => setLimitDraft(e.target.value),
              onBlur: commitLimit,
              onKeyDown: (e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setLimitEditing(false)
              },
              style: { width: '70px', padding: '2px 6px' },
            })
          : React.createElement('span', {
              onClick: () => { if (!disabled) setLimitEditing(true) },
              title: disabled ? '' : '点击修改每日上限，0 表示不限',
              style: cellStyle,
            }, limit > 0 ? String(limit) : '不限'),
      )
    }

    /**
     * QQ 配置页。`onlyGroups` 传了就只显示那几个分类：
     * 「通用模块」就是用它把「记忆 / 余额」单独展示，代码完全复用这一页。
     */
    function createQqPage(form, onlyGroups) {
      const groups = Array.isArray(onlyGroups) && onlyGroups.length
        ? QQ_GROUPS.filter(([key]) => onlyGroups.includes(key))
        : QQ_GROUPS
      return function QQConfig() {
        const snap = useSnapshot(form)
        const [pending, setPending] = React.useState({})
        const [cleared, setCleared] = React.useState('')
        const [paths, setPaths] = React.useState(null)
        const [cooldowns, setCooldowns] = useCooldowns(QQ_STATUS_URL, { proactive: 0, exhausted: false, used: 0, limit: 0 })
        // 初始分类取第一个可见分组：通用模块只显示「记忆/余额」时不至于落在不存在的页上
        const [activeTab, setActiveTab] = React.useState(groups[0][0])
        const [stickers, setStickers] = React.useState([])
        const [stickerMsg, setStickerMsg] = React.useState('')
        const [stickerOpen, setStickerOpen] = React.useState(false)
        const [stickerSelected, setStickerSelected] = React.useState(new Set())
        const [balMsg, setBalMsg] = React.useState('')
        // 人设文件状态：没有就提示生成模板（主人 2026-10-25 要求）
        const [personaInfo, setPersonaInfo] = React.useState(null)
        const [personaMsg, setPersonaMsg] = React.useState('')
        const loadPersona = () => {
          fetch(`${QQ_STATUS_URL}/persona`, { cache: 'no-store' })
            .then((r) => r.json())
            .then(setPersonaInfo)
            .catch(() => {})
        }
        React.useEffect(() => { loadPersona() }, [])
        // 全局偏好（AGENTS.md）：不存在就生成含语言设置的模板
        const [agentsInfo, setAgentsInfo] = React.useState(null)
        const [agentsMsg, setAgentsMsg] = React.useState('')
        const loadAgents = () => {
          fetch(`${QQ_STATUS_URL}/agents`, { cache: 'no-store' })
            .then((r) => r.json())
            .then(setAgentsInfo)
            .catch(() => {})
        }
        React.useEffect(() => { loadAgents() }, [])
        const doMakeAgents = async () => {
          try {
            const r = await fetch(`${QQ_STATUS_URL}/agents`, { method: 'POST' })
            const d = await r.json()
            setAgentsMsg(d && d.created ? '已生成模板，去填语言吧' : '文件已存在，没覆盖')
            loadAgents()
          } catch {
            setAgentsMsg('接口没响应')
          }
          setTimeout(() => setAgentsMsg(''), 5000)
        }
        const doMakePersona = async () => {
          try {
            const r = await fetch(`${QQ_STATUS_URL}/persona`, { method: 'POST' })
            const d = await r.json()
            setPersonaMsg(d && d.created ? '已生成模板，去填吧' : '人设文件已存在，没覆盖')
            loadPersona()
          } catch {
            setPersonaMsg('接口没响应')
          }
          setTimeout(() => setPersonaMsg(''), 5000)
        }
        const doBalanceCheck = async () => {
          setBalMsg('同步中…')
          try {
            const r = await fetch(`${QQ_STATUS_URL}/balance_check`, { cache: 'no-store' })
            const d = await r.json()
            setBalMsg(d && d.ok
              ? `已同步：${Number(d.total).toFixed(2)} ${d.currency || ''}`
              : `失败：${(d && d.error) || '未知'}`)
          } catch {
            setBalMsg('接口没响应')
          }
          setTimeout(() => setBalMsg(''), 6000)
        }
        // 倒计时归零就自动同步一次（从「还有剩余」变成 0 的那一刻）。
        // 但用户主动点「跳过」时不能同步——否则跳过刚把倒计时清零，自动同步就立刻
        // 又写回新的检查时间，表现成「跳过按钮不管用」（2026-10-25 主人反馈）。
        const lastBalLeft = React.useRef(null)
        const skipBalanceGuard = React.useRef(false)
        React.useEffect(() => {
          const cur = Number(cooldowns.balance || 0)
          const prev = lastBalLeft.current
          if (prev !== null && prev > 0 && cur === 0) {
            if (skipBalanceGuard.current) skipBalanceGuard.current = false
            else doBalanceCheck()
          }
          lastBalLeft.current = cur
        }, [cooldowns.balance])
        const [memMsg, setMemMsg] = React.useState('')
        const doMemorySync = async () => {
          try {
            const r = await fetch(`${QQ_STATUS_URL}/memory_sync`, { cache: 'no-store' })
            const d = await r.json()
            setMemMsg(d && d.ok ? (d.note || '已同步') : `失败：${(d && d.error) || '未知'}`)
          } catch (e) {
            setMemMsg('接口没响应')
          }
          setTimeout(() => setMemMsg(''), 4000)
        }
        const [pokeList, setPokeList] = React.useState([])
        const [pokeMsg, setPokeMsg] = React.useState('')
        const [retortOpen, setRetortOpen] = React.useState(false)
        const [retortList, setRetortList] = React.useState([])
        const [retortMsg, setRetortMsg] = React.useState('')
        const [dragActive, setDragActive] = React.useState(false)
        const stickerFileRef = React.useRef(null)
        const RETORT_FALLBACK = [
          { text: '直接怼回去：短、硬、对等，一两句', weight: 70, on: true },
          { text: '学贴吧老哥对线：嘴臭拱火带梗', weight: 10, on: true },
          { text: '有理有据地怼：不带脏字，点出他哪儿不对', weight: 10, on: true },
          { text: '阴阳怪气：反讽、夸张附和，表面顺着实际在损', weight: 10, on: true },
        ]
        // 每行给一个稳定 id：删除中间那行时后面的输入框不会串内容
        // 搓一搓方案：第一项「模型思考」固定不可改，其余是用户自己编的固定话术
        const POKE_MODEL_TEXT = '模型思考（默认，不可修改）：看当下上下文自己决定要不要接、接什么；不想接就不说话'
        const pokeId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
        const parsePokeCfg = (raw) => {
          try {
            const arr = JSON.parse(String(raw || '') || '[]')
            if (Array.isArray(arr)) {
              return arr
                .filter((x) => x && String(x.text || '').trim() && x.fixed !== true && String(x.id || '') !== 'model')
                .map((x) => ({ id: pokeId(), text: String(x.text).trim(), weight: x.weight ?? 10, on: x.on !== false }))
            }
          } catch { /* 坏了就当没自定义 */ }
          return []
        }
        React.useEffect(() => {
          if (activeTab === 'poke') setPokeList(parsePokeCfg(v.pokeStyles ?? ''))
        }, [activeTab])
        const savePoke = () => {
          const clean = pokeList
            .map((x) => ({ text: String(x.text || '').trim(), weight: Math.max(0, Number(x.weight) || 0), on: x.on !== false }))
            .filter((x) => x.text)
          form.set('pokeStyles', JSON.stringify(clean))
          setPokeMsg('已保存')
          setTimeout(() => setPokeMsg(''), 1500)
          setPokeList(parsePokeCfg(JSON.stringify(clean)))
        }
        const retortId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
        const parseRetortCfg = (raw) => {
          try {
            const arr = JSON.parse(String(raw || '') || '[]')
            if (Array.isArray(arr)) {
              const list = arr
                .filter((x) => x && String(x.text || '').trim())
                .map((x) => ({
                  id: retortId(),
                  text: String(x.text).trim(),
                  weight: x.weight ?? 10,
                  on: x.on !== false,
                }))
              if (list.length) return list
            }
          } catch { /* 解析失败用兜底 */ }
          return RETORT_FALLBACK.map((x) => ({ ...x, id: retortId() }))
        }
        const openRetort = () => {
          setRetortList(parseRetortCfg(v.retortStyles ?? ''))
          setRetortMsg('')
          setRetortOpen(true)
        }
        const saveRetort = () => {
          const clean = retortList
            .map((x) => ({
              text: String(x.text || '').trim(),
              weight: Math.max(0, Number(x.weight) || 0),
              on: x.on !== false,
            }))
            .filter((x) => x.text)
          form.set('retortStyles', JSON.stringify(clean))
          setRetortMsg('已保存')
          setTimeout(() => { setRetortOpen(false); setRetortMsg('') }, 400)
        }
        const loadStickers = () => {
          fetch(`${QQ_STATUS_URL}/stickers`)
            .then((r) => r.json())
            .then((d) => setStickers(Array.isArray(d.list) ? d.list : []))
            .catch(() => {})
        }
        React.useEffect(() => { loadStickers() }, [])
        const toggleStickerFav = (name, favorite) => {
          fetch(`${QQ_STATUS_URL}/sticker_fav?name=${encodeURIComponent(name)}&on=${favorite ? 1 : 0}`, { method: 'POST' })
            .then(() => loadStickers())
            .catch(() => {})
        }
        const removeSticker = (name) => {
          fetch(`${QQ_STATUS_URL}/sticker_del?name=${encodeURIComponent(name)}`, { method: 'POST' })
            .then(() => loadStickers())
            .catch(() => {})
        }
        const uploadSticker = (file) => {
          const reader = new FileReader()
          reader.onload = () => {
            fetch(`${QQ_STATUS_URL}/sticker_add`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ data: String(reader.result), desc: '手动添加的表情包' }),
            })
              .then((r) => r.json())
              .then((d) => {
                setStickerMsg(d.ok ? '已加入表情包' : `失败：${d.error || ''}`)
                setTimeout(() => setStickerMsg(''), 2500)
                loadStickers()
              })
              .catch(() => setStickerMsg('上传失败'))
          }
          reader.readAsDataURL(file)
        }
        const loadPaths = () => {
          fetch(`${QQ_STATUS_URL}/chat_paths`)
            .then((r) => r.json())
            .then((d) => setPaths(d))
            .catch(() => {})
        }
        React.useEffect(() => { loadPaths() }, [])
        const openFolder = (target) => {
          fetch(`${QQ_STATUS_URL}/open_folder?target=${target}`, { method: 'POST' }).catch(() => {})
        }
        const clearCache = (target) => {
          fetch(`${QQ_STATUS_URL}/clear_cache?target=${target}`, { method: 'POST' })
            .then((r) => r.json())
            .then((d) => {
              setCleared(`${target === 'logs' ? '日志' : '直播'}清了 ${d.removed?.length ?? 0} 个文件`)
              setTimeout(() => setCleared(''), 2500)
              loadPaths()
            })
            .catch(() => setCleared('清理失败'))
        }
        const skipCooldown = (action) => {
          // 余额的跳过是「这次别查」，不是「马上查」，所以别让它触发自动同步
          if (action === 'balance') skipBalanceGuard.current = true
          fetch(`${QQ_STATUS_URL}/skip?action=${encodeURIComponent(action)}`, { method: 'POST' })
            .then(() => setCooldowns((s) => ({ ...s, [action]: 0, exhausted: false })))
            .catch(() => {})
        }
        if (snap.status !== 'ready' || !snap.value) {
          return React.createElement(
            'div',
            { style: { padding: '12px 0', opacity: 0.7 } },
            snap.status === 'unavailable' ? '这个配置项当前不可用。' : '正在读取配置…',
          )
        }
        const v = snap.value
        const children = [
          React.createElement(
            'p',
            { key: 'hint', style: { opacity: 0.7, marginBottom: '8px' } },
            '改完立即生效。自动回复需要 NapCat 开 WebSocket，地址填对才会连。',
          ),
          React.createElement(
            'div',
            { key: 'persona', style: rowStyle },
            React.createElement('span', { style: labelStyle }, '人设文件'),
            React.createElement('button', {
              type: 'button', style: skipStyle, onClick: doMakePersona,
            }, personaInfo && personaInfo.exists ? '重新生成模板' : '生成模板'),
            React.createElement('span', { style: hintStyle },
              personaInfo
                ? (personaInfo.exists
                  ? `已有（${personaInfo.chars} 字）· ${personaInfo.path}`
                  : '还没有 —— 点「生成模板」，照着骨架改成你自己的')
                : '读取中…'),
            personaMsg ? React.createElement('span', { style: { ...hintStyle, color: '#2e7d32' } }, personaMsg) : null,
          ),
          React.createElement(
            'div',
            { key: 'agents', style: rowStyle },
            React.createElement('span', { style: labelStyle }, '全局偏好'),
            React.createElement('button', {
              type: 'button', style: skipStyle, onClick: doMakeAgents,
            }, agentsInfo && agentsInfo.exists ? '查看模板说明' : '生成模板'),
            React.createElement('span', { style: hintStyle },
              agentsInfo
                ? (agentsInfo.exists
                  ? `AGENTS.md 已有（${agentsInfo.chars} 字）· ${agentsInfo.path}`
                  : '还没有 AGENTS.md —— 生成后填「回复语言」，再勾聊天/思考/分析')
                : '读取中…'),
            agentsMsg ? React.createElement('span', { style: { ...hintStyle, color: '#2e7d32' } }, agentsMsg) : null,
          ),
          React.createElement(
            'div',
            { key: 'tabs', style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' } },
            ...groups.map(([key, label]) => React.createElement('button', {
              key,
              type: 'button',
              onClick: () => setActiveTab(key),
              style: tabStyle(activeTab === key),
            }, label)),
          ),
        ]

        // 和 B站 页一样：冷却状态放标签栏下面，八个子页都能看到
        children.push(React.createElement(CooldownPanel, {
          key: 'cooldowns',
          labels: QQ_COOLDOWN_LABELS,
          cooldowns,
          onSkip: skipCooldown,
        }))

        // 登录子页面：只显示状态和二维码，不渲染普通字段
        if (activeTab === 'login') {
          children.push(React.createElement(LoginPanel, { key: 'login-panel' }))
        }

        // 日志子页面：插件日志 + NapCat 日志 + 聊天记录
        if (activeTab === 'logs') {
          children.push(React.createElement(LogsPanel, { key: 'logs-panel' }))
        }

        for (const [field, label, hint] of QQ_BOOL_FIELDS) {
          if (qqGroupOf(field) !== activeTab) continue
          children.push(React.createElement(BoolRow, {
            key: field, form, field, label, hint, pending, setPending,
            checked: Boolean(v[field]),
            disabled: !snap.writable,
          }))
        }

        for (const [field, label, action] of QQ_NUM_FIELDS) {
          if (qqGroupOf(field) !== activeTab) continue
          if (field === 'proactiveDailyLimit') {
            children.push(
              React.createElement(DailyQuotaRow, {
                key: 'daily-quota',
                form,
                used: cooldowns.used ?? 0,
                limit: Number(v.proactiveDailyLimit ?? 0),
                disabled: !snap.writable,
              }),
            )
            continue
          }
          children.push(
            React.createElement(NumberRow, {
              key: field, form, field, label, action,
              cooldowns,
              onSkip: skipCooldown,
              value: Number(v[field] ?? 0),
              disabled: !snap.writable,
            }),
          )
        }

        for (const [field, label, hint] of QQ_LIST_FIELDS) {
          if (qqGroupOf(field) !== activeTab) continue
          children.push(
            React.createElement(ListRow, {
              key: field, form, field, label, hint,
              value: v[field] ?? '',
              disabled: !snap.writable,
            }),
          )
        }

        for (const [field, label, hint] of QQ_TEXT_FIELDS) {
          if (qqGroupOf(field) !== activeTab) continue
          children.push(
            React.createElement(TextRow, {
              key: field, form, field, label, hint,
              value: v[field] ?? '',
              disabled: !snap.writable,
            }),
          )
          // 「聚焦聊天」下面挂一行实时状态：当前实际聚焦的是谁（手动 or 自动挑的），可一键填
          if (field === 'focusChatTarget') {
            children.push(React.createElement(FocusStatusRow, { key: 'focus-status', form, disabled: !snap.writable }))
          }
        }

        for (const [field, label, hint] of QQ_SECRET_FIELDS) {
          if (qqGroupOf(field) !== activeTab) continue
          children.push(
            React.createElement(SecretRow, {
              key: field, form, field, label, hint,
              disabled: !snap.writable,
            }),
          )
        }

        if (activeTab === 'voice') {
          // 先选方案，下面的字段跟着换：QQ 官方只要挑音色；GPT-SoVITS 要填一堆本地参数
          children.push(
            React.createElement(VoiceBackendRow, {
              key: 'voice-backend',
              form,
              value: v.voiceBackend,
              disabled: !snap.writable,
            }),
          )
          if (String(v.voiceBackend || 'qq') === 'gpt-sovits') {
            // 版本选择放最前：v4 稳但慢，v2 快但飘
            children.push(
              React.createElement(VoiceVersionRow, {
                key: 'gsv-version',
                form,
                value: v.gsvVersion,
                disabled: !snap.writable,
              }),
            )
            for (const [field, label, hint] of VOICE_GSV_FIELDS) {
              children.push(
                React.createElement(TextRow, {
                  key: field, form, field, label, hint,
                  value: v[field] ?? '',
                  disabled: !snap.writable,
                }),
              )
            }
            children.push(
              React.createElement(NumberRow, {
                key: 'gsvSpeed', form, field: 'gsvSpeed', label: '语速（0.8-1.2）', action: '',
                value: Number(v.gsvSpeed ?? 1),
                disabled: !snap.writable,
              }),
            )
            // 测试按钮放最后：改完参数直接听效果，不用去群里发
            children.push(React.createElement(VoiceTestRow, { key: 'voice-test' }))
          } else {
            children.push(
              React.createElement(VoiceRow, {
                key: 'voice-character',
                form,
                value: v.voiceCharacter,
                disabled: !snap.writable,
              }),
            )
          }
        }

        if (activeTab === 'media') children.push(
          React.createElement(
            'div',
            { key: 'stickers-head', style: rowStyle },
            React.createElement('span', { style: labelStyle }, '表情包'),
            React.createElement('button', {
              type: 'button',
              style: skipStyle,
              onClick: () => { setStickerOpen(true); loadStickers() },
            }, '表情包设置'),
            React.createElement('span', { style: hintStyle }, `${stickers.length} 张 · ★ 常用会优先发`),
            stickerMsg ? React.createElement('span', { style: hintStyle }, stickerMsg) : null,
          ),
        )

        if (activeTab === 'balance') {
          const balLeft = Number(cooldowns.balance || 0)
          children.push(React.createElement(
            'div',
            { key: 'bal-sync', style: rowStyle },
            React.createElement('span', { style: labelStyle }, '余额同步'),
            React.createElement('button', { type: 'button', style: skipStyle, onClick: doBalanceCheck }, '立即同步'),
            React.createElement('span', { style: hintStyle },
              `上次：${cooldowns.lastBalance != null ? `${Number(cooldowns.lastBalance).toFixed(2)}` : '—'} · `
              + (balLeft > 0 ? `${fmtLeft(balLeft)} 后自动同步` : '现在可以同步')),
            balMsg ? React.createElement('span', { style: hintStyle }, balMsg) : null,
          ))
        }

        if (activeTab === 'memory') {
          children.push(React.createElement(
            'div',
            { key: 'mem-intro', style: { ...rowStyle, flexDirection: 'column', alignItems: 'flex-start', gap: '3px' } },
            React.createElement('strong', { style: { fontSize: '13px' } }, '记忆布局'),
            React.createElement('span', { style: hintStyle },
              '底座＝共享：DS 侧和大肥鱼共用一份记忆（shared-memory.md 双向）。下面两个隔离开关都能叠在底座上：一个管前后端，一个管群与个人。'),
            React.createElement('span', { style: hintStyle },
              '两个都不开＝全共享；打开前后端隔离，两边各记各的；打开群与个人隔离，群里和私聊各记各的。'),
          ))
          children.push(React.createElement(
            'div',
            { key: 'mem-sync', style: rowStyle },
            React.createElement('span', { style: labelStyle }, '立即同步'),
            React.createElement('button', { type: 'button', style: skipStyle, onClick: doMemorySync }, '对齐一次（只去重）'),
            React.createElement('span', { style: hintStyle }, memMsg || '把两边重复的事实去掉，不新增内容；A 打开时会跳过'),
          ))
        }

        if (activeTab === 'poke') {
          const miniInput = {
            flex: 1, padding: '5px 8px', borderRadius: '6px',
            border: '1px solid rgba(128,128,128,0.35)',
            background: 'transparent', color: 'inherit', fontSize: '13px',
          }
          const numInput = {
            width: '72px', padding: '5px 6px', borderRadius: '6px',
            border: '1px solid rgba(128,128,128,0.35)',
            background: 'transparent', color: 'inherit', fontSize: '13px',
          }
          children.push(React.createElement(
            'div',
            { key: 'poke-styles-head', style: rowStyle },
            React.createElement('span', { style: labelStyle }, '搓一搓回复方案'),
            React.createElement('span', { style: hintStyle }, '按权重随机选一个；「模型思考」固定不可改，其余自己编'),
          ))
          children.push(React.createElement(
            'div',
            { key: 'poke-styles-body', style: { padding: '4px 0 8px' } },
            React.createElement(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' } },
              React.createElement('input', { type: 'checkbox', checked: true, disabled: true, title: '固定启用' }),
              React.createElement('input', { type: 'text', value: POKE_MODEL_TEXT, disabled: true, style: miniInput }),
              React.createElement('input', { type: 'number', value: 100, disabled: true, style: numInput }),
              React.createElement('span', { style: { ...hintStyle, width: '32px' } }, '固定'),
            ),
            ...pokeList.map((item, i) => React.createElement(
              'div',
              { key: item.id, style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' } },
              React.createElement('input', {
                type: 'checkbox',
                checked: item.on !== false,
                title: '启用这个方案',
                onChange: (e) => setPokeList(pokeList.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x))),
              }),
              React.createElement('input', {
                type: 'text',
                value: item.text,
                placeholder: '固定话术，比如：再搓就把你炖了',
                onChange: (e) => setPokeList(pokeList.map((x, j) => (j === i ? { ...x, text: e.target.value } : x))),
                style: miniInput,
              }),
              React.createElement('input', {
                type: 'number',
                value: item.weight === '' ? '' : item.weight,
                min: 0,
                step: 1,
                title: '权重',
                onChange: (e) => setPokeList(pokeList.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x))),
                style: numInput,
              }),
              React.createElement('button', {
                type: 'button',
                style: skipStyle,
                onClick: () => setPokeList(pokeList.filter((_, j) => j !== i)),
              }, '删'),
            )),
            React.createElement(
              'div',
              { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' } },
              React.createElement('button', {
                type: 'button',
                style: skipStyle,
                onClick: () => setPokeList([...pokeList, { id: pokeId(), text: '', weight: 10, on: true }]),
              }, '+ 添加方案'),
              React.createElement('span', { style: { flex: 1 } }),
              pokeMsg ? React.createElement('span', { style: { ...hintStyle, color: '#2e7d32' } }, pokeMsg) : null,
              React.createElement('button', {
                type: 'button',
                style: skipStyle,
                disabled: !snap.writable,
                onClick: savePoke,
              }, '保存方案'),
            ),
          ))
        }

        if (activeTab === 'reply') {
          const retortCount = parseRetortCfg(v.retortStyles ?? '').length
          children.push(
            React.createElement(
              'div',
              { key: 'retort-head', style: rowStyle },
              React.createElement('span', { style: labelStyle }, '还嘴方案'),
              React.createElement('button', {
                type: 'button',
                style: skipStyle,
                onClick: openRetort,
              }, '还嘴方案设置'),
              React.createElement('span', { style: hintStyle }, `${retortCount} 个方案 · 被骂时按权重随机选一个`),
            ),
          )
        }

        // 还嘴方案弹窗：列表编辑，能加能删，每项一个权重
        if (retortOpen) {
          children.push(React.createElement(
            'div',
            {
              key: 'retort-modal',
              style: {
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.55)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              },
              onClick: (e) => { if (e.target === e.currentTarget) setRetortOpen(false) },
            },
            React.createElement(
              'div',
              {
                style: {
                  width: 'min(760px, 94vw)', maxHeight: '86vh', overflow: 'auto',
                  background: 'Canvas', color: 'CanvasText',
                  border: '1px solid rgba(128,128,128,0.35)', borderRadius: '12px',
                  padding: '14px', boxShadow: '0 12px 48px rgba(0,0,0,0.45)',
                },
              },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' } },
                React.createElement('strong', { style: { fontSize: '15px' } }, '还嘴方案'),
                React.createElement('span', { style: hintStyle }, '被骂时按权重随机抽一个，权重越大概率越高'),
                React.createElement('span', { style: { flex: 1 } }),
                React.createElement('button', { type: 'button', style: skipStyle, onClick: () => setRetortOpen(false) }, '关闭'),
              ),
              retortList.length
                ? retortList.map((item, i) => React.createElement(
                    'div',
                    { key: item.id, style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' } },
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: item.on !== false,
                      title: '启用这个方案',
                      onChange: (e) => setRetortList(retortList.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x))),
                    }),
                    React.createElement('input', {
                      type: 'text',
                      value: item.text,
                      placeholder: '方案内容，比如：直接怼回去，短硬对等',
                      onChange: (e) => setRetortList(retortList.map((x, j) => (j === i ? { ...x, text: e.target.value } : x))),
                      style: {
                        flex: 1, padding: '5px 8px', borderRadius: '6px',
                        border: '1px solid rgba(128,128,128,0.35)',
                        background: 'transparent', color: 'inherit', fontSize: '13px',
                      },
                    }),
                    React.createElement('input', {
                      type: 'number',
                      value: item.weight === '' ? '' : item.weight,
                      min: 0,
                      step: 1,
                      title: '权重',
                      onChange: (e) => setRetortList(retortList.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x))),
                      style: {
                        width: '72px', padding: '5px 6px', borderRadius: '6px',
                        border: '1px solid rgba(128,128,128,0.35)',
                        background: 'transparent', color: 'inherit', fontSize: '13px',
                      },
                    }),
                    React.createElement('button', {
                      type: 'button',
                      style: skipStyle,
                      onClick: () => setRetortList(retortList.filter((_, j) => j !== i)),
                    }, '删'),
                  ))
                : React.createElement('div', { style: { ...hintStyle, marginBottom: '8px' } }, '还没有方案，点下面「+ 添加方案」加一个'),
              React.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px' } },
                React.createElement('button', {
                  type: 'button',
                  style: skipStyle,
                  onClick: () => setRetortList([...retortList, { id: retortId(), text: '', weight: 10, on: true }]),
                }, '+ 添加方案'),
                React.createElement('span', { style: { flex: 1 } }),
                retortMsg ? React.createElement('span', { style: { ...hintStyle, color: '#2e7d32' } }, retortMsg) : null,
                React.createElement('button', { type: 'button', style: skipStyle, onClick: saveRetort }, '保存'),
              ),
            ),
          ))
        }

        // 表情包弹窗：拖进来就能加，支持多选删除/设常用
        if (stickerOpen) {
          children.push(React.createElement(
            'div',
            {
              key: 'sticker-modal',
              style: {
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.55)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              },
              onClick: (e) => { if (e.target === e.currentTarget) setStickerOpen(false) },
            },
            React.createElement(
              'div',
              {
                style: {
                  width: 'min(780px, 94vw)', maxHeight: '88vh', overflow: 'auto',
                  background: 'Canvas', color: 'CanvasText',
                  border: '1px solid rgba(128,128,128,0.35)', borderRadius: '12px',
                  padding: '14px', boxShadow: '0 12px 48px rgba(0,0,0,0.45)',
                },
              },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' } },
                React.createElement('strong', { style: { fontSize: '15px' } }, '表情包'),
                React.createElement('span', { style: hintStyle }, `${stickers.length} 张 · ★ 常用优先发`),
                React.createElement('span', { style: { flex: 1 } }),
                React.createElement('button', { type: 'button', style: skipStyle, onClick: () => setStickerOpen(false) }, '关闭'),
              ),
              React.createElement(
                'div',
                {
                  onDragOver: (e) => { e.preventDefault(); setDragActive(true) },
                  onDragLeave: () => setDragActive(false),
                  onDrop: (e) => {
                    e.preventDefault()
                    setDragActive(false)
                    const files = Array.from(e.dataTransfer?.files || []).filter((f) => String(f.type).startsWith('image/'))
                    files.forEach((f) => uploadSticker(f))
                  },
                  onClick: () => { if (stickerFileRef.current) stickerFileRef.current.click() },
                  style: {
                    border: `2px dashed ${dragActive ? '#7aa2f7' : 'rgba(128,128,128,0.5)'}`,
                    borderRadius: '10px', padding: '16px', textAlign: 'center',
                    marginBottom: '10px', cursor: 'pointer',
                    background: dragActive ? 'rgba(122,162,247,0.12)' : 'transparent',
                  },
                },
                React.createElement('div', { style: { fontSize: '13px', opacity: 0.8 } }, '把图片拖到这里，或者点一下选文件（可以一次拖多张）'),
                React.createElement('input', {
                  type: 'file', accept: 'image/*', multiple: true, ref: stickerFileRef,
                  style: { display: 'none' },
                  onChange: (e) => {
                    const files = Array.from(e.target.files || [])
                    files.forEach((f) => uploadSticker(f))
                    e.target.value = ''
                  },
                }),
              ),
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' } },
                React.createElement('button', { type: 'button', style: skipStyle, onClick: () => setStickerSelected(new Set(stickers.map((s) => s.name))) }, '全选'),
                React.createElement('button', { type: 'button', style: skipStyle, onClick: () => setStickerSelected(new Set()) }, '取消选择'),
                React.createElement('span', { style: hintStyle }, `已选 ${stickerSelected.size} 张`),
                React.createElement('span', { style: { flex: 1 } }),
                React.createElement('button', {
                  type: 'button', style: skipStyle,
                  disabled: !stickerSelected.size,
                  onClick: () => {
                    Array.from(stickerSelected).forEach((n) => {
                      const s = stickers.find((x) => x.name === n)
                      if (s) toggleStickerFav(n, true)
                    })
                  },
                }, '设为常用'),
                React.createElement('button', {
                  type: 'button', style: skipStyle,
                  disabled: !stickerSelected.size,
                  onClick: () => {
                    Array.from(stickerSelected).forEach((n) => {
                      const s = stickers.find((x) => x.name === n)
                      if (s) toggleStickerFav(n, false)
                    })
                  },
                }, '设为普通'),
                React.createElement('button', {
                  type: 'button', style: { ...skipStyle, color: '#e5484d' },
                  disabled: !stickerSelected.size,
                  onClick: () => {
                    const names = Array.from(stickerSelected)
                    setStickerSelected(new Set())
                    names.forEach((n) => removeSticker(n))
                  },
                }, '删除选中'),
                stickerMsg ? React.createElement('span', { style: hintStyle }, stickerMsg) : null,
              ),
              React.createElement(
                'div',
                { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } },
                ...(stickers.length
                  ? stickers.map((s) => {
                    const picked = stickerSelected.has(s.name)
                    return React.createElement(
                      'div',
                      {
                        key: s.name,
                        onClick: () => setStickerSelected((prev) => {
                          const next = new Set(prev)
                          if (next.has(s.name)) next.delete(s.name)
                          else next.add(s.name)
                          return next
                        }),
                        style: {
                          width: '108px', padding: '4px', cursor: 'pointer',
                          border: `2px solid ${picked ? '#7aa2f7' : 'rgba(128,128,128,0.3)'}`,
                          borderRadius: '8px',
                          background: picked ? 'rgba(122,162,247,0.12)' : 'transparent',
                        },
                      },
                      React.createElement('img', {
                        src: `${QQ_STATUS_URL}${s.url}`,
                        alt: s.desc || s.name,
                        style: { width: '96px', height: '96px', objectFit: 'contain', borderRadius: '6px', background: 'rgba(0,0,0,0.06)', display: 'block', margin: '0 auto' },
                      }),
                      React.createElement('div', {
                        style: { fontSize: '11px', opacity: 0.7, marginTop: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' },
                        title: s.desc || s.name,
                      }, s.desc || s.name),
                      React.createElement('div', { style: { textAlign: 'center', fontSize: '11px', opacity: 0.85 } }, s.favorite ? '★ 常用' : '普通'),
                    )
                  })
                  : [React.createElement('span', { key: 'empty', style: hintStyle }, '还没有表情包：收到表情包图会自动收进来，也可以拖图片进来')]),
              ),
            ),
          ))
        }

        if (activeTab === 'system') children.push(
          React.createElement(
            'div',
            { key: 'cache-folder', style: rowStyle },
            React.createElement('span', { style: labelStyle }, '缓存文件夹'),
            React.createElement('span', {
              style: { ...hintStyle, flex: 1, wordBreak: 'break-all' },
              title: paths?.cacheDir || '',
            }, paths ? `${paths.cacheDir}` : '…'),
            React.createElement('button', {
              type: 'button',
              style: skipStyle,
              onClick: () => openFolder('cache'),
            }, '打开'),
            React.createElement('button', {
              type: 'button',
              style: skipStyle,
              onClick: () => clearCache('live'),
            }, '清直播缓存'),
          ),
          React.createElement(
            'div',
            { key: 'log-folder', style: rowStyle },
            React.createElement('span', { style: labelStyle }, '日志文件夹'),
            React.createElement('span', {
              style: { ...hintStyle, flex: 1, wordBreak: 'break-all' },
              title: paths?.logDir || '',
            }, paths ? `${paths.logDir}（${paths.logFiles ?? 0} 个文件 / ${paths.lines ?? 0} 条）` : '…'),
            React.createElement('button', {
              type: 'button',
              style: skipStyle,
              onClick: () => openFolder('logs'),
            }, '打开'),
            React.createElement('button', {
              type: 'button',
              style: skipStyle,
              onClick: () => clearCache('logs'),
            }, '清聊天日志'),
          ),
          React.createElement(
            'div',
            { key: 'clear-cache', style: rowStyle },
            React.createElement('span', { style: labelStyle }, '清理缓存'),
            cleared ? React.createElement('span', { style: hintStyle }, cleared) : null,
          ),
        )

        return React.createElement('div', { style: { padding: '8px 0' } }, ...children)
      }
    }

    // ============================================================== 外壳与入口
    const MODULES = [
      ['bili', 'B站模块'],
      ['qq', 'QQ模块'],
      ['common', '通用模块'],
    ]

    /** 多功能DS插件主面板：上面切模块，下面就是那个模块原来的设置页。 */
    function createPanel(baseForm, options) {
      const header = !options || options.header !== false
      const BiliPage = createBiliPage(scopeForm(baseForm, 'bili'))
      const qqForm = scopeForm(baseForm, 'qq')
      // 记忆和余额已经搬到「通用模块」，QQ 页不再重复显示这两组
      const qqMainGroups = QQ_GROUPS.map(([key]) => key).filter((key) => key !== 'memory' && key !== 'balance')
      const QqPage = createQqPage(qqForm, qqMainGroups)
      // 通用模块 = 同一套页面，只显示「记忆 / 余额」两组
      const CommonPage = createQqPage(qqForm, ['memory', 'balance'])
      return function VersatiledsPanel() {
        const [mod, setMod] = React.useState('bili')
        const children = []

        if (header) {
          children.push(React.createElement(
            'div',
            { key: 'head', style: { marginBottom: '12px' } },
            React.createElement('div', { style: { fontSize: '15px', fontWeight: 600 } }, '多功能DS插件'),
            React.createElement('div', { style: { ...hintStyle, marginTop: '2px' } },
              'B站 与 QQ 合成了一个插件：上面切模块，下面就是原来那套设置，改完立即生效。'),
          ))
        }

        children.push(React.createElement(
          'div',
          {
            key: 'tabs',
            style: {
              display: 'flex', gap: '6px', marginBottom: '12px',
              paddingBottom: '10px', borderBottom: '1px solid rgba(128,128,128,0.25)',
            },
          },
          ...MODULES.map(([key, label]) => React.createElement('button', {
            key,
            type: 'button',
            onClick: () => setMod(key),
            style: {
              ...skipStyle,
              fontSize: '14px',
              padding: '8px 18px',
              borderRadius: '6px',
              border: mod === key ? '1px solid rgba(122,162,247,0.9)' : '1px solid rgba(128,128,128,0.35)',
              background: mod === key ? 'rgba(122,162,247,0.2)' : 'transparent',
              fontWeight: mod === key ? 600 : 400,
            },
          }, label)),
        ))

        // 两个页面都挂着，切回来时原来的分类标签和滚动位置都还在
        children.push(React.createElement('div', { key: 'bili', style: { display: mod === 'bili' ? 'block' : 'none' } },
          React.createElement(BiliPage, null)))
        children.push(React.createElement('div', { key: 'qq', style: { display: mod === 'qq' ? 'block' : 'none' } },
          React.createElement(QqPage, null)))
        children.push(React.createElement('div', { key: 'common', style: { display: mod === 'common' ? 'block' : 'none' } },
          React.createElement(CommonPage, null)))

        return React.createElement(
          'div',
          {
            style: header
              ? { padding: '18px 22px 24px', height: '100%', overflow: 'auto', boxSizing: 'border-box' }
              : { padding: '8px 0' },
          },
          ...children,
        )
      }
    }

    /** 侧栏图标：一条 Q 版大肥鱼（圆身子、尾巴、一只眼）。 */
    const VersatiledsPanelIcon = ({ size }) => React.createElement(
      'svg',
      {
        width: size || 16,
        height: size || 16,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
      },
      React.createElement('path', {
        d: 'M2.6 8.2c0-2.3 2.2-4.1 5-4.1s5 1.8 5 4.1-2.2 4.1-5 4.1-5-1.8-5-4.1z',
        stroke: 'currentColor',
        strokeWidth: 1.3,
        strokeLinejoin: 'round',
      }),
      React.createElement('path', {
        d: 'M12.2 6.3 14.6 8l-2.4 1.7z',
        stroke: 'currentColor',
        strokeWidth: 1.2,
        strokeLinejoin: 'round',
      }),
      React.createElement('circle', { cx: 5.4, cy: 7.6, r: 0.8, fill: 'currentColor' }),
    )

    function apply(ctx) {
      ctx.effect(() => {
        const style = document.createElement('style')
        style.setAttribute('data-dsh-versatileds-plugin', 'number-input')
        style.textContent = [
          'input.versatileds-num::-webkit-inner-spin-button,',
          'input.versatileds-num::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }',
          'input.versatileds-num:focus::-webkit-inner-spin-button,',
          'input.versatileds-num:focus::-webkit-outer-spin-button { -webkit-appearance: auto; }',
        ].join('\n')
        document.head.appendChild(style)
        return () => style.remove()
      }, 'dsh-versatileds-plugin: number input spinners')

      let form
      try {
        form = ctx.configForms.get('versatileds')
      } catch (err) {
        console.error('[dsh-versatileds-plugin] 读取配置表单失败:', err)
        return
      }
      if (!form) {
        console.error('[dsh-versatileds-plugin] 配置表单为空，namespace 可能不匹配')
        return
      }
      const Panel = createPanel(form)
      // 插件管理页里那一行已经有自己的标题和面包屑，这里不再重复画标题
      const RowPanel = createPanel(form, { header: false })

      ctx.slots.inject('plugins.row.config', () =>
        ctx.slots.register(
          { name: 'plugins.row.config', key: 'dsh-versatileds-plugin#versatileds' },
          RowPanel,
        ),
      )

      // 左侧栏入口：sidebar.panellist 出图标行，main 用同一个 id 出面板正文
      const PANEL_ID = 'versatileds'
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          { name: 'sidebar.panellist', id: PANEL_ID, order: 20, label: '多功能DS插件' },
          VersatiledsPanelIcon,
        ),
      )
      ctx.slots.inject('main', () =>
        ctx.slots.register({ name: 'main', key: PANEL_ID }, Panel),
      )
    }

    exports.apply = apply
    exports.inject = ['slots', 'configForms']
    return module.exports
  },
})
