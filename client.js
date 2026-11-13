window.__ModuleLoader__.load({
  id: 'dsh-experience',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const API = '/dsh-experience'
    const VERSION = '0.1.0'

    /* ------------------------------------------------------------------ */
    /* 基础                                                                */
    /* ------------------------------------------------------------------ */

    function clone(value) {
      if (typeof structuredClone === 'function') {
        try {
          return structuredClone(value)
        } catch {
          // 退回 JSON 拷贝
        }
      }
      return JSON.parse(JSON.stringify(value))
    }

    async function request(path, body) {
      const options = body === undefined ? { method: 'GET' } : {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }
      options.headers = Object.assign({ 'x-dsh-experience': '1' }, options.headers || {})
      const response = await fetch(API + path, options)
      const raw = await response.text()
      let data
      try {
        data = raw ? JSON.parse(raw) : {}
      } catch {
        throw new Error('服务返回了无法解析的内容')
      }
      if (!response.ok || data.ok === false) {
        const error = new Error((data.error && data.error.message) || '请求失败（' + response.status + '）')
        error.code = (data.error && data.error.code) || 'HTTP_' + response.status
        error.current = data.current
        error.status = response.status
        throw error
      }
      return data
    }

    function fmtDate(iso) {
      if (!iso) return ''
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return String(iso).slice(0, 10)
      return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    }

    function fmtTime(iso) {
      if (!iso) return ''
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return ''
      return date.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    }

    function todayKey() {
      const date = new Date()
      const pad = (n) => String(n).padStart(2, '0')
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    }

    function todayLabel() {
      const date = new Date()
      return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    }

    function weekdayLabel(day) {
      const date = new Date(day + 'T12:00:00')
      if (Number.isNaN(date.getTime())) return ''
      return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
    }

    function pad2(value) {
      return String(value).padStart(2, '0')
    }

    function uniqueId(prefix) {
      return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
    }

    function countsLine(counts) {
      if (!counts) return ''
      const parts = []
      if (counts.planSteps) parts.push(counts.planSteps + ' 步计划')
      if (counts.executionSteps) parts.push(counts.executionSteps + ' 条执行')
      if (counts.questions) parts.push(counts.questions + ' 问')
      if (!parts.length) parts.push('还没记录')
      return parts.join(' · ')
    }

    async function copyText(text) {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch {
        // 退回 execCommand
      }
      try {
        const area = document.createElement('textarea')
        area.value = text
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        const ok = document.execCommand('copy')
        area.remove()
        return ok
      } catch {
        return false
      }
    }

    function statusLabel(status) {
      // 想法三态：未完成 / 进行中 / 已完成；经验仍用 active / done。
      // ready / converted 是老想法的状态，只在显示时兜底，不再产新数据。
      if (status === 'draft') return '未完成'
      if (status === 'doing') return '进行中'
      if (status === 'done') return '已完成'
      if (status === 'ready') return '进行中'
      if (status === 'converted') return '已完成'
      if (status === 'active') return '进行中'
      return status || ''
    }

    /* 把点击元素在面板内的中心位置换算成百分比，作为弹出动画的原点 */
    function popOrigin(element) {
      if (!element || typeof element.getBoundingClientRect !== 'function') return null
      const root = element.closest ? element.closest('.xp-root') : null
      if (!root) return null
      const a = element.getBoundingClientRect()
      const b = root.getBoundingClientRect()
      if (!b.width || !b.height) return null
      return {
        '--ox': (((a.left + a.width / 2 - b.left) / b.width) * 100).toFixed(2) + '%',
        '--oy': (((a.top + a.height / 2 - b.top) / b.height) * 100).toFixed(2) + '%',
      }
    }

    /* 进场转场：把整页从点击卡片的位置/大小放大到全屏（FLIP）
       rect 是被点元素的矩形，rootRect 是整个面板的矩形 */
    function growVars(rect, rootRect) {
      if (!rect || !rootRect || !rootRect.width || !rootRect.height) return null
      return {
        '--fx': (rect.left - rootRect.left) + 'px',
        '--fy': (rect.top - rootRect.top) + 'px',
        '--fsx': String(rect.width / rootRect.width),
        '--fsy': String(rect.height / rootRect.height),
      }
    }

    /* 退场转场：把整页缩回目标卡片的位置/大小；没有目标时缩向面板中心 */
    function shrinkVars(rect, rootRect) {
      if (!rootRect || !rootRect.width || !rootRect.height) return {}
      const target = rect && rect.width ? rect : {
        left: rootRect.width / 2 - 30,
        top: rootRect.height / 2 - 30,
        width: 60,
        height: 60,
      }
      return {
        '--tx': (target.left - rootRect.left) + 'px',
        '--ty': (target.top - rootRect.top) + 'px',
        '--tsx': String(target.width / rootRect.width),
        '--tsy': String(target.height / rootRect.height),
      }
    }

    function useOverlayClose() {
      const [closing, setClosing] = React.useState(false)
      const closingRef = React.useRef(false)
      const run = React.useCallback((fn) => {
        if (closingRef.current) return
        closingRef.current = true
        setClosing(true)
        setTimeout(() => {
          if (typeof fn === 'function') fn()
        }, 160)
      }, [])
      return [closing, run]
    }

    /* ------------------------------------------------------------------ */
    /* 图标                                                                */
    /* ------------------------------------------------------------------ */

    function LayersIcon({ size = 18 }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 20 20', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M10 2.6 2.9 6.2 10 9.8l7.1-3.6L10 2.6Z', stroke: 'currentColor', strokeWidth: 1.35, strokeLinejoin: 'round' }),
        h('path', { d: 'M2.9 10 10 13.6 17.1 10', stroke: 'currentColor', strokeWidth: 1.35, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.72 }),
        h('path', { d: 'M2.9 13.8 10 17.4l7.1-3.6', stroke: 'currentColor', strokeWidth: 1.35, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.42 }),
      )
    }

    function SparkIcon({ size = 18 }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 20 20', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M10 2.5c.35 3.75 2.2 5.6 5.95 5.95-3.75.35-5.6 2.2-5.95 5.95-.35-3.75-2.2-5.6-5.95-5.95C7.8 8.1 9.65 6.25 10 2.5Z', stroke: 'currentColor', strokeWidth: 1.35, strokeLinejoin: 'round' }),
        h('path', { d: 'M15.4 13.2c.16 1.55.95 2.34 2.5 2.5-1.55.16-2.34.95-2.5 2.5-.16-1.55-.95-2.34-2.5-2.5 1.55-.16 2.34-.95 2.5-2.5Z', fill: 'currentColor', opacity: 0.55 }),
      )
    }

    function NoteIcon({ size = 18 }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 20 20', fill: 'none', 'aria-hidden': true },
        h('rect', { x: 3.4, y: 2.9, width: 13.2, height: 14.2, rx: 2.4, stroke: 'currentColor', strokeWidth: 1.35 }),
        h('path', { d: 'M6.8 7.2h6.4M6.8 10.4h6.4M6.8 13.6h4.2', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', opacity: 0.8 }),
      )
    }

    function DocIcon({ size = 18 }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 20 20', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M5.2 2.8h6.1l3.6 3.6v10.8H5.2V2.8Z', stroke: 'currentColor', strokeWidth: 1.35, strokeLinejoin: 'round' }),
        h('path', { d: 'M11.2 2.8v3.8h3.7M7.6 10h5M7.6 13h5', stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round', opacity: 0.78 }),
      )
    }

    function CloseIcon({ size = 14 }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 14 14', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'm3.2 3.2 7.6 7.6M10.8 3.2l-7.6 7.6', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
      )
    }

    function BackIcon({ size = 16 }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 20 20', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M12.5 3.8 6.3 10l6.2 6.2', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      )
    }

    function SearchIcon({ size = 16 }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 20 20', fill: 'none', 'aria-hidden': true },
        h('circle', { cx: 9, cy: 9, r: 5.2, stroke: 'currentColor', strokeWidth: 1.4 }),
        h('path', { d: 'm13.1 13.1 3.4 3.4', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
      )
    }

    function PlusIcon({ size = 15 }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 20 20', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M10 4.2v11.6M4.2 10h11.6', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
      )
    }

    /* ------------------------------------------------------------------ */
    /* 可编辑文本与小组件                                                  */
    /* ------------------------------------------------------------------ */

    function InlineText({ value, onChange, placeholder, multiline, className, inputClassName, rows }) {
      const [editing, setEditing] = React.useState(false)
      const [draft, setDraft] = React.useState(value || '')
      const cancelledRef = React.useRef(false)

      React.useEffect(() => {
        if (!editing) setDraft(value || '')
      }, [value, editing])

      const cancel = () => {
        cancelledRef.current = true
        setEditing(false)
        setDraft(value || '')
      }

      const commit = () => {
        if (cancelledRef.current) {
          cancelledRef.current = false
          return
        }
        setEditing(false)
        const next = String(draft == null ? '' : draft).trim()
        if (next !== String(value || '')) onChange(next)
      }

      if (editing) {
        const shared = {
          className: 'xp-input ' + (inputClassName || ''),
          autoFocus: true,
          value: draft,
          onClick: (event) => event.stopPropagation(),
          onChange: (event) => setDraft(event.target.value),
          onBlur: commit,
          onKeyDown: (event) => {
            event.stopPropagation()
            if (event.key === 'Escape') {
              event.preventDefault()
              cancel()
            }
            if (event.key === 'Enter' && !multiline) {
              event.preventDefault()
              commit()
            }
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              commit()
            }
          },
        }
        if (multiline) {
          return h('textarea', Object.assign({}, shared, { rows: rows || 3 }))
        }
        return h('input', Object.assign({}, shared, { type: 'text' }))
      }

      return h(
        'div',
        {
          className: 'xp-inline ' + (className || ''),
          onClick: (event) => {
            event.stopPropagation()
            cancelledRef.current = false
            setEditing(true)
          },
          title: '点击编辑',
          role: 'button',
          tabIndex: 0,
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              cancelledRef.current = false
              setEditing(true)
            }
          },
        },
        value ? value : h('span', { className: 'xp-inline-empty' }, placeholder || '点击填写'),
      )
    }

    function Field({ label, children }) {
      return h('div', { className: 'xp-field' }, h('div', { className: 'xp-field-label' }, label), children)
    }

    function MiniButton({ children, onClick, danger, title, disabled }) {
      return h(
        'button',
        {
          type: 'button',
          className: 'xp-mini',
          'data-danger': danger ? 'true' : undefined,
          title: title || undefined,
          disabled: Boolean(disabled),
          onClick: (event) => {
            event.stopPropagation()
            if (onClick) onClick(event)
          },
        },
        children,
      )
    }

    function RailSep({ title, count, onAdd, addLabel }) {
      return h(
        'div',
        { className: 'xp-rail-sep' },
        h('span', { className: 'xp-rail-sep-title' }, title, count != null ? h('em', null, ' · ' + count) : null),
        onAdd ? h('button', { type: 'button', className: 'xp-add', onClick: onAdd }, addLabel || '+ 添加') : null,
      )
    }

    function SearchBox({ value, onChange, placeholder }) {
      return h(
        'div',
        { className: 'xp-search' },
        h(SearchIcon, { size: 15 }),
        h('input', {
          type: 'text',
          value: value,
          placeholder: placeholder || '搜索',
          onChange: (event) => onChange(event.target.value),
        }),
      )
    }

    /* ------------------------------------------------------------------ */
    /* 弹出层骨架                                                          */
    /* ------------------------------------------------------------------ */

    function OverlayFrame({ closing, origin, className, onBackdrop, children }) {
      return h(
        'div',
        {
          className: 'xp-overlay',
          'data-closing': closing ? 'true' : undefined,
          role: 'dialog',
          'aria-modal': 'true',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget && onBackdrop) onBackdrop()
          },
        },
        h('div', { className: 'xp-overlay-card ' + (className || ''), style: origin || undefined }, children),
      )
    }

    /* ------------------------------------------------------------------ */
    /* AGENTSKILL.md 弹窗                                                  */
    /* ------------------------------------------------------------------ */

    function GuideOverlay({ origin, onClose, onSaved }) {
      const [phase, setPhase] = React.useState('loading')
      const [doc, setDoc] = React.useState(null)
      const [text, setText] = React.useState('')
      const [notice, setNotice] = React.useState(null)
      const [dirty, setDirty] = React.useState(false)
      const [confirmClose, setConfirmClose] = React.useState(false)
      const [saving, setSaving] = React.useState(false)
      const [inserting, setInserting] = React.useState(false)
      const docRef = React.useRef(null)
      const dirtyRef = React.useRef(false)
      const textRef = React.useRef('')
      const revRef = React.useRef(0)
      const [closing, closeWith] = useOverlayClose()

      const load = React.useCallback(async () => {
        setPhase('loading')
        try {
          const data = await request('/guide')
          docRef.current = data
          setDoc(data)
          setText(data.content || '')
          textRef.current = data.content || ''
          setDirty(false)
          dirtyRef.current = false
          setPhase('ready')
        } catch (error) {
          setNotice({ kind: 'error', text: error.message })
          setPhase('error')
        }
      }, [])

      React.useEffect(() => {
        load()
      }, [load])

      const save = React.useCallback(async (force) => {
        if (!dirtyRef.current && !force) {
          return
        }
        const rev = revRef.current
        setSaving(true)
        try {
          const data = await request('/guide/save', {
            content: textRef.current,
            baseMtimeMs: force ? undefined : docRef.current && docRef.current.mtimeMs,
          })
          docRef.current = data
          setDoc(data)
          if (revRef.current === rev) {
            setDirty(false)
            dirtyRef.current = false
          } else {
            setDirty(true)
            dirtyRef.current = true
          }
          setNotice(null)
          onSaved()
        } catch (error) {
          setNotice({
            kind: 'error',
            text: error.message,
            conflict: error.code === 'CONFLICT',
          })
        } finally {
          setSaving(false)
        }
      }, [onSaved])

      const insertRule = async () => {
        setInserting(true)
        try {
          const data = await request('/agents')
          const doc = data.doc
          const marker = '## 全局经验（dsh-experience）'
          if (String(doc.content || '').includes(marker)) {
            setNotice({ kind: 'info', text: 'AGENTS.md 里已经有这一段了，不用重复插。' })
            return
          }
          const snippet = [
            marker,
            '',
            '完成一项用户交代的任务后，用 `experience_record` 记一条经验；写之前先 `experience_guide` 读规矩（AGENTSKILL.md）。',
            '执行部分由实际执行者写，最多 8 步，动作+结果+证据；纯问答/闲聊不记。',
            '用户说「看想法 / 按想法做」时，用 `experience_list({ kind: "idea" })` 找到并 `experience_read` 读正文。',
          ].join('\n')
          const base = String(doc.content || '').replace(/\s*$/, '')
          const next = (base ? base + '\n\n' : '') + snippet + '\n'
          await request('/agents/save', { content: next, baseMtimeMs: doc.mtimeMs })
          setNotice({ kind: 'info', text: '已插入全局 AGENTS.md（旧版留在 .bak）。' })
        } catch (error) {
          setNotice({ kind: 'error', text: error.message })
        } finally {
          setInserting(false)
        }
      }

      const requestClose = () => {
        if (dirtyRef.current) {
          setConfirmClose(true)
          return
        }
        closeWith(onClose)
      }

      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            requestClose()
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault()
            save(false)
          }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      })

      const update = (value) => {
        revRef.current += 1
        setText(value)
        textRef.current = value
        setDirty(true)
        dirtyRef.current = true
        setNotice(null)
      }

      return h(
        OverlayFrame,
        { closing, origin, className: 'xp-doc-card', onBackdrop: requestClose },
        h(
          'div',
          { className: 'xp-overlay-head' },
          h(
            'div',
            { className: 'xp-overlay-title-wrap' },
            h('div', { className: 'xp-eyebrow' }, 'AGENTSKILL.md'),
            h('div', { className: 'xp-overlay-title' }, '写技能的规矩'),
            h('div', { className: 'xp-overlay-sub' }, doc && doc.path ? doc.path : '数据目录里的 AGENTSKILL.md'),
          ),
          h(
            'div',
            { className: 'xp-overlay-head-actions' },
            h('span', { className: 'xp-save-state' }, dirty ? '未保存' : '已保存'),
            h(
              'button',
              { type: 'button', className: 'xp-icon-btn', onClick: requestClose, title: '关闭' },
              h(CloseIcon, null),
            ),
          ),
        ),
        notice
          ? h(
              'div',
              { className: 'xp-banner', 'data-kind': notice.kind || 'info' },
              h('span', null, notice.text),
              notice.conflict
                ? h(
                    'span',
                    { className: 'xp-banner-actions' },
                    h('button', { type: 'button', onClick: load }, '重新载入'),
                    h('button', { type: 'button', onClick: () => save(true) }, '仍然覆盖'),
                  )
                : null,
            )
          : null,
        h(
          'div',
          { className: 'xp-overlay-body' },
          phase === 'loading'
            ? h('div', { className: 'xp-loading' }, '正在读规矩…')
            : h('textarea', {
                className: 'xp-doc-editor',
                value: text,
                spellCheck: false,
                onChange: (event) => update(event.target.value),
              }),
        ),
        h(
          'div',
          { className: 'xp-overlay-foot' },
          h('span', { className: 'xp-hint' }, '这是所有 agent 写经验前都会读的文件。改完点保存；旧版会自动留一份 .bak。'),
          h(
            'div',
            { className: 'xp-overlay-foot-actions' },
            h(
              'button',
              { type: 'button', className: 'xp-btn', onClick: insertRule, disabled: saving || inserting },
              inserting ? '插入中…' : '插到 AGENTS.md',
            ),
            h('button', { type: 'button', className: 'xp-btn', onClick: load, disabled: saving }, '重新载入'),
            h('button', { type: 'button', className: 'xp-btn xp-btn-primary', onClick: () => save(false), disabled: saving, title: 'Ctrl/Cmd + S' }, saving ? '保存中…' : '保存'),
          ),
        ),
        confirmClose
          ? h(
              'div',
              { className: 'xp-confirm' },
              h('div', { className: 'xp-confirm-text' }, '规矩还有没保存的修改。'),
              h(
                'div',
                { className: 'xp-confirm-actions' },
                h('button', { type: 'button', onClick: () => setConfirmClose(false) }, '继续编辑'),
                h('button', { type: 'button', onClick: () => closeWith(onClose) }, '放弃修改'),
              ),
            )
          : null,
      )
    }

    /* ------------------------------------------------------------------ */
    /* 全局 AGENTS.md 弹窗                                                 */
    /* ------------------------------------------------------------------ */

    function AgentsOverlay({ origin, onClose }) {
      const [phase, setPhase] = React.useState('loading')
      const [doc, setDoc] = React.useState(null)
      const [text, setText] = React.useState('')
      const [dirty, setDirty] = React.useState(false)
      const [saving, setSaving] = React.useState(false)
      const [notice, setNotice] = React.useState(null)
      const [confirmReload, setConfirmReload] = React.useState(false)
      const docRef = React.useRef(null)
      const dirtyRef = React.useRef(false)
      const textRef = React.useRef('')
      const revRef = React.useRef(0)
      const [closing, closeWith] = useOverlayClose()

      const load = React.useCallback(async () => {
        setPhase('loading')
        try {
          const data = await request('/agents')
          docRef.current = data.doc
          setDoc(data.doc)
          setText(data.doc.content || '')
          textRef.current = data.doc.content || ''
          setDirty(false)
          dirtyRef.current = false
          setPhase('ready')
          setNotice(null)
        } catch (error) {
          setNotice({ kind: 'error', text: error.message })
          setPhase('error')
        }
      }, [])

      React.useEffect(() => {
        load()
      }, [load])

      React.useEffect(() => {
        const beforeUnload = (event) => {
          if (!dirtyRef.current) return
          event.preventDefault()
          event.returnValue = ''
        }
        window.addEventListener('beforeunload', beforeUnload)
        return () => window.removeEventListener('beforeunload', beforeUnload)
      }, [])

      const save = React.useCallback(async (force) => {
        if (!dirtyRef.current && !force) return
        const rev = revRef.current
        setSaving(true)
        try {
          const data = await request('/agents/save', {
            content: textRef.current,
            baseMtimeMs: force ? undefined : docRef.current && docRef.current.mtimeMs,
          })
          docRef.current = data.doc
          setDoc(data.doc)
          if (revRef.current === rev) {
            setDirty(false)
            dirtyRef.current = false
          } else {
            setDirty(true)
            dirtyRef.current = true
          }
          setNotice(null)
          setConfirmReload(false)
        } catch (error) {
          setNotice({
            kind: 'error',
            text: error.message,
            conflict: error.code === 'CONFLICT',
          })
        } finally {
          setSaving(false)
        }
      }, [])

      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            requestClose()
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault()
            save(false)
          }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [save])

      const requestClose = () => {
        if (dirtyRef.current) {
          setConfirmReload(true)
          return
        }
        closeWith(onClose)
      }

      const reload = () => {
        if (dirtyRef.current) {
          setConfirmReload(true)
          return
        }
        load()
      }

      const update = (value) => {
        revRef.current += 1
        setText(value)
        textRef.current = value
        setDirty(true)
        dirtyRef.current = true
        setNotice(null)
      }

      return h(
        OverlayFrame,
        { closing, origin, className: 'xp-doc-card', onBackdrop: requestClose },
        h(
          'div',
          { className: 'xp-overlay-head' },
          h(
            'div',
            { className: 'xp-overlay-title-wrap' },
            h('div', { className: 'xp-eyebrow' }, 'AGENTS.md'),
            h('div', { className: 'xp-overlay-title' }, '全局记忆'),
            h('div', { className: 'xp-overlay-sub' }, doc && doc.path ? doc.path : '所有会话都读的 AGENTS.md'),
          ),
          h(
            'div',
            { className: 'xp-overlay-head-actions' },
            h('span', { className: 'xp-save-state' }, saving ? '保存中…' : dirty ? '未保存' : '已保存'),
            h(
              'button',
              { type: 'button', className: 'xp-icon-btn', onClick: requestClose, title: '关闭' },
              h(CloseIcon, null),
            ),
          ),
        ),
        notice
          ? h(
              'div',
              { className: 'xp-banner', 'data-kind': notice.kind || 'info' },
              h('span', null, notice.text),
              notice.conflict
                ? h(
                    'span',
                    { className: 'xp-banner-actions' },
                    h('button', { type: 'button', onClick: load }, '重新载入'),
                    h('button', { type: 'button', onClick: () => save(true) }, '仍然覆盖'),
                  )
                : null,
            )
          : null,
        confirmReload
          ? h(
              'div',
              { className: 'xp-banner', 'data-kind': 'warn' },
              h('span', null, '有没保存的修改，关掉或重新载入都会丢掉它们。'),
              h(
                'span',
                { className: 'xp-banner-actions' },
                h('button', { type: 'button', onClick: () => setConfirmReload(false) }, '继续编辑'),
                h('button', { type: 'button', onClick: () => { setConfirmReload(false); load() } }, '放弃并载入'),
                h('button', { type: 'button', onClick: () => closeWith(onClose) }, '放弃并关闭'),
              ),
            )
          : null,
        h(
          'div',
          { className: 'xp-overlay-body' },
          phase === 'loading'
            ? h('div', { className: 'xp-loading' }, '正在读 AGENTS.md…')
            : h('textarea', {
                className: 'xp-doc-editor',
                value: text,
                spellCheck: false,
                placeholder: '# 全局 AGENTS.md\n\n这里写的内容，所有会话都会看到。',
                onChange: (event) => update(event.target.value),
              }),
        ),
        h(
          'div',
          { className: 'xp-overlay-foot' },
          h('span', { className: 'xp-hint' }, '保存时保留原换行；覆盖前会自动把上一版留成 AGENTS.md.bak。'),
          h(
            'div',
            { className: 'xp-overlay-foot-actions' },
            h('button', { type: 'button', className: 'xp-btn', onClick: reload, disabled: saving }, '重新载入'),
            h('button', { type: 'button', className: 'xp-btn xp-btn-primary', onClick: () => save(false), disabled: saving }, saving ? '保存中…' : '保存'),
          ),
        ),
      )
    }

    /* ------------------------------------------------------------------ */
    /* 工作区 AGENTS.md 弹窗：顶部标签栏切换各工作区，各自独立保存          */
    /* ------------------------------------------------------------------ */

    function WorkspaceAgentsOverlay({ origin, onClose }) {
      const [phase, setPhase] = React.useState('loading') // loading 载入中 / ready / error
      const [workspaces, setWorkspaces] = React.useState(null)
      const [defaultPath, setDefaultPath] = React.useState('')
      const [selectedId, setSelectedId] = React.useState('')
      const [doc, setDoc] = React.useState(null)
      const [text, setText] = React.useState('')
      const [dirty, setDirty] = React.useState(false)
      const [saving, setSaving] = React.useState(false)
      const [switching, setSwitching] = React.useState(false)
      const [notice, setNotice] = React.useState(null)
      const [confirmReload, setConfirmReload] = React.useState(false)
      const docRef = React.useRef(null)
      const dirtyRef = React.useRef(false)
      const textRef = React.useRef('')
      const revRef = React.useRef(0)
      const selectedRef = React.useRef(null)
      const [closing, closeWith] = useOverlayClose()

      // 读某个工作区的 AGENTS.md：先清空旧内容再请求，切换时不让上一份文档残留
      const loadDoc = React.useCallback(async (id, ws) => {
        setPhase('loading')
        setText('')
        textRef.current = ''
        docRef.current = null
        setDoc(null)
        setDirty(false)
        dirtyRef.current = false
        setNotice(null)
        try {
          const data = await request('/workspace-agents?id=' + encodeURIComponent(String(id)))
          docRef.current = data.doc
          selectedRef.current = data.workspace || ws
          setDoc(data.doc)
          setText(data.doc.content || '')
          textRef.current = data.doc.content || ''
          revRef.current = 0
          setPhase('ready')
        } catch (error) {
          setNotice({ kind: 'error', text: error.message })
          setPhase('error')
        }
      }, [])

      // 挂载：先拿工作区列表让标签栏出来，再载入选中的那份内容（列表不阻塞内容载入）
      React.useEffect(() => {
        let alive = true
        const boot = async () => {
          setPhase('loading')
          try {
            const data = await request('/workspaces')
            if (!alive) return
            const list = (data.workspaces || []).filter((ws) => ws && ws.path)
            setWorkspaces(list)
            setDefaultPath(data.defaultPath || '')
            const first = list.find((ws) => ws.current) || list[0] || null
            if (first) {
              setSelectedId(String(first.id))
              await loadDoc(first.id, first)
            } else {
              setNotice({ kind: 'error', text: '没有可用工作区' })
              setPhase('error')
            }
          } catch (error) {
            if (!alive) return
            setNotice({ kind: 'error', text: error.message })
            setPhase('error')
          }
        }
        boot()
        return () => {
          alive = false
        }
      }, [loadDoc])

      // 有未保存修改时拦截整页刷新/关闭
      React.useEffect(() => {
        const beforeUnload = (event) => {
          if (!dirtyRef.current) return
          event.preventDefault()
          event.returnValue = ''
        }
        window.addEventListener('beforeunload', beforeUnload)
        return () => window.removeEventListener('beforeunload', beforeUnload)
      }, [])

      const save = React.useCallback(async (force) => {
        if (!dirtyRef.current && !force) return true
        const rev = revRef.current
        setSaving(true)
        try {
          const data = await request('/workspace-agents/save', {
            id: selectedRef.current && selectedRef.current.id,
            content: textRef.current,
            baseMtimeMs: force ? undefined : docRef.current && docRef.current.mtimeMs,
          })
          docRef.current = data.doc
          setDoc(data.doc)
          if (revRef.current === rev) {
            setDirty(false)
            dirtyRef.current = false
          } else {
            setDirty(true)
            dirtyRef.current = true
          }
          setNotice(null)
          setConfirmReload(false)
          return true
        } catch (error) {
          setNotice({
            kind: 'error',
            text: error.message,
            conflict: error.code === 'CONFLICT',
          })
          return false
        } finally {
          setSaving(false)
        }
      }, [])

      const requestClose = () => {
        if (dirtyRef.current) {
          setConfirmReload(true)
          return
        }
        closeWith(onClose)
      }

      const reload = () => {
        if (dirtyRef.current) {
          setConfirmReload(true)
          return
        }
        loadDoc(String(selectedId), selectedRef.current)
      }

      const update = (value) => {
        revRef.current += 1
        setText(value)
        textRef.current = value
        setDirty(true)
        dirtyRef.current = true
        setNotice(null)
      }

      // Esc / Ctrl+S
      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            requestClose()
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault()
            save(false)
          }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [save])

      // 切标签：有未保存修改先落盘，保存失败（冲突等）就停在原工作区；成功后载入新工作区
      const switchTo = async (ws) => {
        const id = String(ws && ws.id)
        if (!id || id === String(selectedId)) return
        if (dirtyRef.current) {
          const ok = await save(false)
          if (!ok) return
        }
        selectedRef.current = ws
        setSelectedId(id)
        setSwitching(true)
        try {
          await loadDoc(id, ws)
        } finally {
          setSwitching(false)
        }
      }

      const selected =
        (workspaces && workspaces.find((ws) => String(ws.id) === String(selectedId))) ||
        selectedRef.current ||
        null

      return h(
        OverlayFrame,
        { closing, origin, className: 'xp-doc-card', onBackdrop: requestClose },
        h(
          'div',
          { className: 'xp-overlay-head' },
          h(
            'div',
            { className: 'xp-overlay-title-wrap' },
            h('div', { className: 'xp-eyebrow' }, '工作区 AGENTS.md'),
            h('div', { className: 'xp-overlay-title' }, selected ? selected.title : '工作区记忆'),
            h('div', { className: 'xp-overlay-sub' }, doc && doc.path ? doc.path : selected ? selected.path : defaultPath || '各工作区目录下的 AGENTS.md'),
          ),
          h(
            'div',
            { className: 'xp-overlay-head-actions' },
            h('span', { className: 'xp-save-state' }, saving ? '保存中…' : dirty ? '未保存' : '已保存'),
            h(
              'button',
              { type: 'button', className: 'xp-icon-btn', onClick: requestClose, title: '关闭' },
              h(CloseIcon, null),
            ),
          ),
        ),
        h(
          'div',
          { className: 'xp-ws-tabs' },
          (workspaces || []).map((ws) =>
            h(
              'button',
              {
                type: 'button',
                key: ws.id,
                className: 'xp-ws-tab',
                'data-active': String(selectedId) === String(ws.id) ? 'true' : undefined,
                disabled: Boolean(switching || saving),
                title: ws.path,
                onClick: () => switchTo(ws),
              },
              h('span', { className: 'xp-ws-tab-title' }, ws.title),
              ws.current ? h('span', { className: 'xp-ws-badge' }, '当前') : null,
            ),
          ),
        ),
        notice
          ? h(
              'div',
              { className: 'xp-banner', 'data-kind': notice.kind || 'info' },
              h('span', null, notice.text),
              notice.conflict
                ? h(
                    'span',
                    { className: 'xp-banner-actions' },
                    h('button', { type: 'button', onClick: () => loadDoc(String(selectedId), selectedRef.current) }, '重新载入'),
                    h('button', { type: 'button', onClick: () => save(true) }, '仍然覆盖'),
                  )
                : null,
            )
          : null,
        confirmReload
          ? h(
              'div',
              { className: 'xp-banner', 'data-kind': 'warn' },
              h('span', null, '有没保存的修改，关掉或重新载入都会丢掉它们。'),
              h(
                'span',
                { className: 'xp-banner-actions' },
                h('button', { type: 'button', onClick: () => setConfirmReload(false) }, '继续编辑'),
                h('button', { type: 'button', onClick: () => { setConfirmReload(false); loadDoc(String(selectedId), selectedRef.current) } }, '放弃并载入'),
                h('button', { type: 'button', onClick: () => closeWith(onClose) }, '放弃并关闭'),
              ),
            )
          : null,
        h(
          'div',
          { className: 'xp-overlay-body' },
          phase === 'loading'
            ? h('div', { className: 'xp-loading' }, workspaces === null ? '正在读工作区…' : '正在读工作区 AGENTS.md…')
            : phase === 'error'
              ? h('div', { className: 'xp-loading' }, '载入失败，点上方标签或「重新载入」再试')
              : h('textarea', {
                  className: 'xp-doc-editor',
                  value: text,
                  spellCheck: false,
                  placeholder: '# 工作区 AGENTS.md\n\n这里写的内容，只对这个工作区生效。',
                  onChange: (event) => update(event.target.value),
                }),
        ),
        h(
          'div',
          { className: 'xp-overlay-foot' },
          h('span', { className: 'xp-hint' }, '保存时保留原换行；覆盖前会自动把上一版留成 AGENTS.md.bak。'),
          h(
            'div',
            { className: 'xp-overlay-foot-actions' },
            h('button', { type: 'button', className: 'xp-btn', onClick: reload, disabled: Boolean(saving || !selectedId) }, '重新载入'),
            h('button', { type: 'button', className: 'xp-btn xp-btn-primary', onClick: () => save(false), disabled: Boolean(saving || !selectedId), title: 'Ctrl/Cmd + S' }, saving ? '保存中…' : '保存'),
          ),
        ),
      )
    }

    /* ------------------------------------------------------------------ */
    /* 插件信息弹窗                                                        */
    /* ------------------------------------------------------------------ */

    function InfoOverlay({ state, origin, onClose }) {
      const [closing, closeWith] = useOverlayClose()
      const close = () => closeWith(onClose)

      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            close()
          }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      })

      const guide = (state && state.guide) || null
      const rows = [
        { key: '版本', value: 'v' + VERSION },
        { key: '数据目录', value: state && state.dir ? state.dir : '未知', mono: true },
        { key: '经验', value: ((state && state.skills) || []).length + ' 条' },
        { key: '想法', value: ((state && state.ideas) || []).length + ' 个' },
        { key: '记事', value: ((state && state.notes) || []).length + ' 条' },
        { key: '规矩', value: guide && guide.chars ? 'AGENTSKILL.md · ' + guide.chars + ' 字' : 'AGENTSKILL.md 还没有内容' },
        { key: '记录工具', value: 'experience_guide · experience_list · experience_read · experience_record · experience_update', mono: true },
      ]

      return h(
        OverlayFrame,
        { closing, origin, className: 'xp-info-card', onBackdrop: close },
        h(
          'div',
          { className: 'xp-overlay-head' },
          h(
            'div',
            { className: 'xp-overlay-title-wrap' },
            h('div', { className: 'xp-eyebrow' }, 'dsh-experience'),
            h('div', { className: 'xp-overlay-title' }, '插件信息'),
          ),
          h(
            'div',
            { className: 'xp-overlay-head-actions' },
            h('button', { type: 'button', className: 'xp-icon-btn', onClick: close, title: '关闭' }, h(CloseIcon, null)),
          ),
        ),
        h(
          'div',
          { className: 'xp-overlay-body xp-info-body' },
          rows.map((row) =>
            h(
              'div',
              { className: 'xp-info-row', key: row.key },
              h('div', { className: 'xp-info-key' }, row.key),
              h('div', { className: 'xp-info-val' }, row.mono ? h('code', null, row.value) : row.value),
            ),
          ),
        ),
        h(
          'div',
          { className: 'xp-overlay-foot' },
          h('span', { className: 'xp-hint' }, '所有数据都是这个目录里的本地文件，随时可以整体备份或搬走。'),
          h(
            'div',
            { className: 'xp-overlay-foot-actions' },
            h('button', { type: 'button', className: 'xp-btn xp-btn-primary', onClick: close }, '关闭'),
          ),
        ),
      )
    }

    /* ------------------------------------------------------------------ */
    /* 记事编辑弹窗                                                        */
    /* ------------------------------------------------------------------ */

    const SWATCHES = [0, 1, 2, 3, 4, 5]

    function NoteEditor({ note, isNew, origin, onSave, onDelete, onClose }) {
      const [title, setTitle] = React.useState(note.title || '')
      const [body, setBody] = React.useState(note.body || '')
      const [date, setDate] = React.useState(note.date || todayKey())
      const [color, setColor] = React.useState((note.color || 0) % 6)
      const [confirmDelete, setConfirmDelete] = React.useState(false)
      const bodyRef = React.useRef(null)
      const [closing, closeWith] = useOverlayClose()

      React.useEffect(() => {
        if (isNew && bodyRef.current) bodyRef.current.focus()
      }, [isNew])

      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            closeWith(onClose)
          }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      })

      const save = () => {
        const cleanBody = body.trim()
        const cleanTitle = title.trim()
        if (!cleanBody && !cleanTitle) {
          closeWith(onClose)
          return
        }
        closeWith(() =>
          onSave({
            title: cleanTitle || cleanBody.split('\n')[0].slice(0, 60),
            body: cleanBody,
            date: date || todayKey(),
            color,
          }),
        )
      }

      return h(
        OverlayFrame,
        { closing, origin, className: 'xp-note-card', onBackdrop: () => closeWith(onClose) },
        h(
          'div',
          { className: 'xp-overlay-head' },
          h(
            'div',
            { className: 'xp-overlay-title-wrap' },
            h('div', { className: 'xp-eyebrow' }, 'book'),
            h('div', { className: 'xp-overlay-title' }, isNew ? '记一条' : '改这一条'),
            h('div', { className: 'xp-overlay-sub' }, '保存后弹回日期里，和别的卡片排在一起'),
          ),
          h(
            'div',
            { className: 'xp-overlay-head-actions xp-swatches' },
            SWATCHES.map((item) =>
              h('button', {
                type: 'button',
                key: item,
                className: 'xp-swatch',
                'data-active': color === item ? 'true' : undefined,
                style: { background: 'var(--xp-note-' + item + ')' },
                title: '颜色',
                onClick: () => setColor(item),
              }),
            ),
            h('button', { type: 'button', className: 'xp-icon-btn', onClick: () => closeWith(onClose), title: '关闭' }, h(CloseIcon, null)),
          ),
        ),
        h(
          'div',
          { className: 'xp-overlay-body xp-note-body' },
          h('input', { className: 'xp-input xp-note-title-input', value: title, placeholder: '标题（可选）', onChange: (event) => setTitle(event.target.value) }),
          h('textarea', {
            className: 'xp-note-textarea',
            ref: bodyRef,
            value: body,
            placeholder: '记点什么…',
            spellCheck: false,
            onChange: (event) => setBody(event.target.value),
          }),
          h(
            'label',
            { className: 'xp-date-row' },
            h('span', null, '日期'),
            h('input', { type: 'date', className: 'xp-input xp-date-input', value: date, onChange: (event) => setDate(event.target.value) }),
          ),
        ),
        h(
          'div',
          { className: 'xp-overlay-foot' },
          isNew
            ? h('span', { className: 'xp-hint' }, '标题留空就用第一行做标题。')
            : h('button', { type: 'button', className: 'xp-btn xp-btn-danger-ghost', onClick: () => { if (confirmDelete) { closeWith(onDelete) } else setConfirmDelete(true) } }, confirmDelete ? '确认删除' : '删除'),
          h(
            'div',
            { className: 'xp-overlay-foot-actions' },
            h('button', { type: 'button', className: 'xp-btn', onClick: () => closeWith(onClose) }, '取消'),
            h('button', { type: 'button', className: 'xp-btn xp-btn-primary', onClick: save }, '保存'),
          ),
        ),
      )
    }

    /* ------------------------------------------------------------------ */
    /* 经验：三阶段卡片                                                    */
    /* ------------------------------------------------------------------ */

    function GoalDetail({ record, update }) {
      const goal = record.goal || { text: '', questions: [], adjustments: [] }
      const questions = goal.questions || []
      const adjustments = goal.adjustments || []

      return h(
        'div',
        { className: 'xp-nodes' },
        h(
          'div',
          { className: 'xp-node xp-node-lead' },
          h('div', { className: 'xp-node-head' }, h('span', { className: 'xp-node-label' }, '任务')),
          h(InlineText, {
            value: goal.text,
            multiline: true,
            rows: 4,
            placeholder: '用户交代了什么？尽量保留原话。',
            className: 'xp-node-title',
            onChange: (value) => update((draft) => { draft.goal.text = value }),
          }),
        ),
        h(RailSep, {
          title: '提问',
          count: questions.length,
          onAdd: () => update((draft) => { draft.goal.questions.push({ question: '', answer: '' }) }),
          addLabel: '+ 加一条',
        }),
        questions.length === 0
          ? h('div', { className: 'xp-rail-empty' }, '只记真正改变方向的提问；没有就留空。')
          : questions.map((item, index) =>
              h(
                'div',
                { className: 'xp-node', key: 'q' + index },
                h(
                  'div',
                  { className: 'xp-node-head' },
                  h('span', { className: 'xp-node-label' }, '提问 ' + (index + 1)),
                  h(
                    'span',
                    { className: 'xp-node-actions' },
                    h(MiniButton, {
                      title: '删除',
                      danger: true,
                      onClick: () => update((draft) => { draft.goal.questions.splice(index, 1) }),
                    }, '×'),
                  ),
                ),
                h(InlineText, {
                  value: item.question,
                  placeholder: '我问的',
                  className: 'xp-node-title',
                  onChange: (value) => update((draft) => { draft.goal.questions[index].question = value }),
                }),
                h(InlineText, {
                  value: item.answer,
                  multiline: true,
                  rows: 2,
                  placeholder: '用户答的',
                  className: 'xp-node-text',
                  onChange: (value) => update((draft) => { draft.goal.questions[index].answer = value }),
                }),
              ),
            ),
        h(RailSep, {
          title: '调整',
          count: adjustments.length,
          onAdd: () => update((draft) => { draft.goal.adjustments.push({ reason: '', from: '', to: '' }) }),
          addLabel: '+ 加一条',
        }),
        adjustments.length === 0
          ? h('div', { className: 'xp-rail-empty' }, '策略没改过就留空；改过的话，原因一定要写。')
          : adjustments.map((item, index) =>
              h(
                'div',
                { className: 'xp-node', key: 'a' + index },
                h(
                  'div',
                  { className: 'xp-node-head' },
                  h('span', { className: 'xp-node-label' }, '调整 ' + (index + 1)),
                  h(
                    'span',
                    { className: 'xp-node-actions' },
                    h(MiniButton, {
                      title: '删除',
                      danger: true,
                      onClick: () => update((draft) => { draft.goal.adjustments.splice(index, 1) }),
                    }, '×'),
                  ),
                ),
                h(Field, { label: '原因' }, h(InlineText, {
                  value: item.reason,
                  placeholder: '为什么改',
                  className: 'xp-node-text',
                  onChange: (value) => update((draft) => { draft.goal.adjustments[index].reason = value }),
                })),
                h(Field, { label: '原来' }, h(InlineText, {
                  value: item.from,
                  placeholder: '原方案',
                  className: 'xp-node-text',
                  onChange: (value) => update((draft) => { draft.goal.adjustments[index].from = value }),
                })),
                h(Field, { label: '改成' }, h(InlineText, {
                  value: item.to,
                  placeholder: '新方案',
                  className: 'xp-node-text',
                  onChange: (value) => update((draft) => { draft.goal.adjustments[index].to = value }),
                })),
              ),
            ),
      )
    }

    function PlanDetail({ record, update }) {
      const plan = record.plan || { steps: [], adjustments: [] }
      const steps = plan.steps || []
      const adjustments = plan.adjustments || []

      return h(
        'div',
        { className: 'xp-nodes' },
        h(RailSep, {
          title: '步骤',
          count: steps.length,
          onAdd: () => update((draft) => { draft.plan.steps.push('') }),
          addLabel: '+ 加一步',
        }),
        steps.length === 0
          ? h('div', { className: 'xp-rail-empty' }, '按执行顺序写；一条一个动作。')
          : steps.map((step, index) =>
              h(
                'div',
                { className: 'xp-node', key: 's' + index },
                h(
                  'div',
                  { className: 'xp-node-head' },
                  h('span', { className: 'xp-node-label' }, '步骤 ' + (index + 1)),
                  h(
                    'span',
                    { className: 'xp-node-actions' },
                    h(MiniButton, {
                      title: '上移',
                      disabled: index === 0,
                      onClick: () => update((draft) => {
                        const [item] = draft.plan.steps.splice(index, 1)
                        draft.plan.steps.splice(index - 1, 0, item)
                      }),
                    }, '↑'),
                    h(MiniButton, {
                      title: '下移',
                      disabled: index === steps.length - 1,
                      onClick: () => update((draft) => {
                        const [item] = draft.plan.steps.splice(index, 1)
                        draft.plan.steps.splice(index + 1, 0, item)
                      }),
                    }, '↓'),
                    h(MiniButton, {
                      title: '删除',
                      danger: true,
                      onClick: () => update((draft) => { draft.plan.steps.splice(index, 1) }),
                    }, '×'),
                  ),
                ),
                h(InlineText, {
                  value: step,
                  multiline: true,
                  rows: 2,
                  placeholder: '这一步做什么',
                  className: 'xp-node-text',
                  onChange: (value) => update((draft) => { draft.plan.steps[index] = value }),
                }),
              ),
            ),
        h(RailSep, {
          title: '计划调整',
          count: adjustments.length,
          onAdd: () => update((draft) => { draft.plan.adjustments.push({ reason: '', change: '' }) }),
          addLabel: '+ 加一条',
        }),
        adjustments.length === 0
          ? h('div', { className: 'xp-rail-empty' }, '计划没变过就留空。')
          : adjustments.map((item, index) =>
              h(
                'div',
                { className: 'xp-node', key: 'p' + index },
                h(
                  'div',
                  { className: 'xp-node-head' },
                  h('span', { className: 'xp-node-label' }, '调整 ' + (index + 1)),
                  h(
                    'span',
                    { className: 'xp-node-actions' },
                    h(MiniButton, {
                      title: '删除',
                      danger: true,
                      onClick: () => update((draft) => { draft.plan.adjustments.splice(index, 1) }),
                    }, '×'),
                  ),
                ),
                h(Field, { label: '原因' }, h(InlineText, {
                  value: item.reason,
                  placeholder: '为什么改计划',
                  className: 'xp-node-text',
                  onChange: (value) => update((draft) => { draft.plan.adjustments[index].reason = value }),
                })),
                h(Field, { label: '改成' }, h(InlineText, {
                  value: item.change,
                  multiline: true,
                  rows: 2,
                  placeholder: '改成了什么',
                  className: 'xp-node-text',
                  onChange: (value) => update((draft) => { draft.plan.adjustments[index].change = value }),
                })),
              ),
            ),
      )
    }

    function ExecutionDetail({ record, update }) {
      const execution = record.execution || { steps: [] }
      const steps = execution.steps || []

      return h(
        'div',
        { className: 'xp-nodes' },
        h('div', { className: 'xp-detail-note' }, '这一块由实际执行任务的 agent 写；最多 8 步，每步都要有证据。'),
        h(RailSep, {
          title: '执行步骤',
          count: steps.length,
          onAdd: () => update((draft) => { draft.execution.steps.push({ action: '', result: '', evidence: '' }) }),
          addLabel: '+ 加一步',
        }),
        steps.length === 0
          ? h('div', { className: 'xp-rail-empty' }, '还没有执行记录。')
          : steps.map((step, index) =>
              h(
                'div',
                { className: 'xp-node', key: 'e' + index },
                h(
                  'div',
                  { className: 'xp-node-head' },
                  h('span', { className: 'xp-node-label' }, '步骤 ' + (index + 1)),
                  h(
                    'span',
                    { className: 'xp-node-actions' },
                    h(MiniButton, {
                      title: '上移',
                      disabled: index === 0,
                      onClick: () => update((draft) => {
                        const [item] = draft.execution.steps.splice(index, 1)
                        draft.execution.steps.splice(index - 1, 0, item)
                      }),
                    }, '↑'),
                    h(MiniButton, {
                      title: '下移',
                      disabled: index === steps.length - 1,
                      onClick: () => update((draft) => {
                        const [item] = draft.execution.steps.splice(index, 1)
                        draft.execution.steps.splice(index + 1, 0, item)
                      }),
                    }, '↓'),
                    h(MiniButton, {
                      title: '删除',
                      danger: true,
                      onClick: () => update((draft) => { draft.execution.steps.splice(index, 1) }),
                    }, '×'),
                  ),
                ),
                h(Field, { label: '动作' }, h(InlineText, {
                  value: step.action,
                  multiline: true,
                  rows: 2,
                  placeholder: '具体做了什么（动词开头）',
                  className: 'xp-node-text',
                  onChange: (value) => update((draft) => { draft.execution.steps[index].action = value }),
                })),
                h(Field, { label: '结果' }, h(InlineText, {
                  value: step.result,
                  placeholder: '成功 / 失败 / 部分完成',
                  className: 'xp-node-text',
                  onChange: (value) => update((draft) => { draft.execution.steps[index].result = value }),
                })),
                h(Field, { label: '证据' }, h(InlineText, {
                  value: step.evidence,
                  placeholder: '文件路径、命令、链接或「无」',
                  className: 'xp-node-evidence',
                  onChange: (value) => update((draft) => { draft.execution.steps[index].evidence = value }),
                })),
              ),
            ),
      )
    }

    function SkillFlow({ record, stage, update, onStage }) {
      const goal = record.goal || {}
      const plan = record.plan || {}
      const execution = record.execution || {}
      const cards = [
        {
          id: 'goal',
          index: '01',
          name: '目标',
          meta: (goal.questions || []).length + ' 问 · ' + (goal.adjustments || []).length + ' 次调整',
          preview: goal.text || '还没写目标',
          body: h(GoalDetail, { record, update }),
        },
        {
          id: 'plan',
          index: '02',
          name: '计划',
          meta: (plan.steps || []).length + ' 步 · ' + (plan.adjustments || []).length + ' 次调整',
          preview: (plan.steps || []).length ? (plan.steps || []).join(' → ') : '还没写计划',
          body: h(PlanDetail, { record, update }),
        },
        {
          id: 'execution',
          index: '03',
          name: '执行',
          meta: (execution.steps || []).length + ' 步',
          preview: (execution.steps || []).length
            ? (execution.steps || []).map((step) => step.action).filter(Boolean).join(' → ')
            : '还没写执行',
          body: h(ExecutionDetail, { record, update }),
        },
      ]

      return h(
        'div',
        { className: 'xp-flow' },
        cards.map((card, index) =>
          h(
            React.Fragment,
            { key: card.id },
            h(
              'div',
              { className: 'xp-stage', 'data-open': stage === card.id ? 'true' : undefined },
              h(
                'button',
                {
                  type: 'button',
                  className: 'xp-stage-head',
                  onClick: () => onStage(stage === card.id ? null : card.id),
                },
                h('span', { className: 'xp-stage-num' }, card.index),
                h('span', { className: 'xp-stage-name' }, card.name),
                h('span', { className: 'xp-stage-meta' }, card.meta),
                h('span', { className: 'xp-stage-chevron' }, stage === card.id ? '−' : '+'),
              ),
              stage === card.id
                ? h('div', { className: 'xp-stage-body' }, card.body)
                : h('div', { className: 'xp-stage-preview' }, card.preview),
            ),
            index < cards.length - 1 ? h('div', { className: 'xp-flow-link', 'aria-hidden': true }, h('span', null, '↓')) : null,
          ),
        ),
      )
    }

    /* ------------------------------------------------------------------ */
    /* 首页                                                                */
    /* ------------------------------------------------------------------ */

    function Home({ state, error, onRetry, onOpen, onDoc, onInfo }) {
      const skills = (state && state.skills) || []
      const ideas = (state && state.ideas) || []
      const notes = (state && state.notes) || []
      const guide = (state && state.guide) || null
      const dateText = todayLabel()
      const week = weekdayLabel(todayKey())

      // 两张 AGENTS 卡要做成正方形：高度由第一行决定，宽度得等布局出来才知道。
      // 量出这一组卡片的高度写进 --xp-pair-h，卡宽 = 行高；行高变了会重新量。
      const pairRef = React.useRef(null)
      React.useLayoutEffect(() => {
        const el = pairRef.current
        if (!el) return undefined
        const sync = () => {
          const height = el.clientHeight
          if (height > 0 && el.style.getPropertyValue('--xp-pair-h') !== height + 'px') {
            el.style.setProperty('--xp-pair-h', height + 'px')
          }
        }
        sync()
        if (typeof ResizeObserver === 'undefined') return undefined
        const observer = new ResizeObserver(sync)
        observer.observe(el)
        return () => observer.disconnect()
      }, [])

      return h(
        'div',
        { className: 'xp-home' },
        h(
          'div',
          { className: 'xp-home-head' },
          h(
            'div',
            { className: 'xp-date-block' },
            h('div', { className: 'xp-date' }, dateText),
            h('div', { className: 'xp-date-sub' }, week + ' · 全局经验'),
          ),
          h(
            'button',
            { type: 'button', className: 'xp-info-btn', onClick: onInfo },
            h('span', { className: 'xp-info-dot' }),
            '插件信息',
          ),
        ),
        error
          ? h(
              'div',
              { className: 'xp-banner', 'data-kind': 'error' },
              h('span', null, error),
              h('span', { className: 'xp-banner-actions' }, h('button', { type: 'button', onClick: onRetry }, '重试')),
            )
          : null,
        h(
          'div',
          { className: 'xp-grid' },
          h(
            'button',
            { type: 'button', className: 'xp-tile xp-tile-ideas', 'data-tile': 'ideas', onClick: (event) => onOpen({ name: 'ideas' }, event) },
            h('span', { className: 'xp-tile-eyebrow' }, 'ideas'),
            h('span', { className: 'xp-tile-title' }, '想法'),
            h('span', { className: 'xp-tile-sub' }, ideas.length ? ideas.length + ' 个 · 最新「' + (ideas[0].title || '未命名') + '」' : '还没写想法 · 进去写一条'),
            h('span', { className: 'xp-tile-count' }, pad2(ideas.length)),
          ),
          h(
            'button',
            { type: 'button', className: 'xp-tile xp-tile-guide xp-tile-dark', 'data-tile': 'guide', onClick: (event) => onDoc('guide', event) },
            h('span', { className: 'xp-tile-eyebrow' }, 'agentskill.md'),
            h('span', { className: 'xp-tile-title' }, '写技能的规矩'),
            h('span', { className: 'xp-tile-sub' }, guide && guide.chars ? guide.chars + ' 字 · 写经验前所有 agent 都会读' : '写经验前所有 agent 都会读'),
          ),
          h(
            'div',
            { className: 'xp-grid-pair', ref: pairRef },
            h(
              'button',
              { type: 'button', className: 'xp-tile xp-tile-agents xp-tile-dark', 'data-tile': 'agents', onClick: (event) => onDoc('agents', event) },
              h('span', { className: 'xp-tile-eyebrow' }, 'agents.md'),
              h('span', { className: 'xp-tile-title' }, '全局记忆'),
              h('span', { className: 'xp-tile-sub' }, '所有会话共用'),
            ),
            h(
              'button',
              { type: 'button', className: 'xp-tile xp-tile-ws-agents xp-tile-dark', 'data-tile': 'ws-agents', onClick: (event) => onDoc('ws-agents', event) },
              h('span', { className: 'xp-tile-eyebrow' }, 'workspace'),
              h('span', { className: 'xp-tile-title' }, '工作区记忆'),
              h('span', { className: 'xp-tile-sub' }, '各工作区各自一份'),
            ),
          ),
          h(
            'button',
            { type: 'button', className: 'xp-tile xp-tile-skills', 'data-tile': 'skills', onClick: (event) => onOpen({ name: 'skills' }, event) },
            h(
              'span',
              { className: 'xp-tile-head' },
              h('span', { className: 'xp-tile-eyebrow' }, 'skills'),
              h('span', { className: 'xp-tile-badge' }, skills.length + ' 条'),
            ),
            h('span', { className: 'xp-tile-title' }, '经验'),
            h(
              'span',
              { className: 'xp-mini-rows' },
              skills.length
                ? skills.slice(0, 6).map((item) =>
                    h(
                      'span',
                      { className: 'xp-mini-row', key: item.id },
                      h('span', { className: 'xp-mini-dot', 'data-status': item.status }),
                      h('span', { className: 'xp-mini-title' }, item.title || '未命名经验'),
                      h('span', { className: 'xp-mini-date' }, fmtDate(item.updatedAt)),
                    ),
                  )
                : h('span', { className: 'xp-mini-empty' }, '还没有经验 · 做成一件事后 agent 会记在这里'),
            ),
            skills.length > 6 ? h('span', { className: 'xp-mini-more' }, '还有 ' + (skills.length - 6) + ' 条 → 点开看全部') : null,
          ),
          h(
            'button',
            { type: 'button', className: 'xp-tile xp-tile-book', 'data-tile': 'book', onClick: (event) => onOpen({ name: 'book' }, event) },
            h(
              'span',
              { className: 'xp-tile-head' },
              h('span', { className: 'xp-tile-eyebrow' }, 'book'),
              h('span', { className: 'xp-tile-badge' }, notes.length + ' 条'),
            ),
            h('span', { className: 'xp-tile-title' }, '记事本'),
            h(
              'span',
              { className: 'xp-mini-note-grid' },
              notes.length
                ? notes.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 8).map((note) =>
                    h(
                      'span',
                      {
                        className: 'xp-mini-note-swatch xp-note-c' + ((note.color || 0) % 6),
                        key: note.id,
                      },
                      h('span', { className: 'xp-mini-note-label' }, note.title || '无标题'),
                    ),
                  )
                : h('span', { className: 'xp-mini-empty' }, '还没有记事 · 点开记一条'),
            ),
            notes.length > 8 ? h('span', { className: 'xp-mini-more' }, '还有 ' + (notes.length - 8) + ' 条 → 点开看全部') : null,
            notes.length ? null : h('span', { className: 'xp-tile-sub' }, '记一条试试'),
          ),
        ),
        h(
          'div',
          { className: 'xp-home-foot' },
          h('span', null, skills.length + ' 条经验 · ' + ideas.length + ' 个想法 · ' + notes.length + ' 条记事'),
          h('span', { className: 'xp-home-foot-dir', title: state && state.dir ? state.dir : '' }, state && state.dir ? state.dir : '数据目录'),
        ),
      )
    }

    /* ------------------------------------------------------------------ */
    /* 经验列表                                                            */
    /* ------------------------------------------------------------------ */

    const SKILL_FILTERS = [
      { id: 'all', label: '全部' },
      { id: 'active', label: '进行中' },
      { id: 'done', label: '完成' },
    ]

    function SkillsPage({ skills, onBack, onOpen, onCreated, onRefresh }) {
      const [query, setQuery] = React.useState('')
      const [filter, setFilter] = React.useState('all')
      const [notice, setNotice] = React.useState(null)
      const [creating, setCreating] = React.useState(false)

      const filtered = React.useMemo(() => {
        const keyword = query.trim().toLowerCase()
        return skills.filter((item) => {
          if (filter !== 'all' && item.status !== filter) return false
          if (!keyword) return true
          const hay = ((item.title || '') + ' ' + (item.preview || '') + ' ' + ((item.tags || []).join(' '))).toLowerCase()
          return hay.includes(keyword)
        })
      }, [skills, query, filter])

      const create = async () => {
        if (creating) return
        setCreating(true)
        try {
          const data = await request('/skill/create', {
            title: '未命名经验',
            status: 'active',
            goal: { text: '' },
            plan: { steps: [] },
            execution: { steps: [] },
          })
          await onRefresh()
          onCreated(data.record.id)
        } catch (error) {
          setNotice({ kind: 'error', text: error.message })
          setCreating(false)
        }
      }

      return h(
        'div',
        { className: 'xp-page' },
        h(
          'div',
          { className: 'xp-page-head' },
          h('button', { type: 'button', className: 'xp-back', onClick: onBack, title: '返回' }, h(BackIcon, null)),
          h(
            'div',
            { className: 'xp-page-title-wrap' },
            h('div', { className: 'xp-page-title' }, 'skills'),
            h('div', { className: 'xp-page-sub' }, '经验 · 每条都是一次做完的事'),
          ),
          h(
            'div',
            { className: 'xp-head-actions' },
            h('button', { type: 'button', className: 'xp-btn xp-btn-primary', onClick: create, disabled: creating }, creating ? '新建中…' : '+ 新建'),
          ),
        ),
        h(SearchBox, { value: query, onChange: setQuery, placeholder: '搜标题、目标、标签' }),
        h(
          'div',
          { className: 'xp-chips' },
          SKILL_FILTERS.map((item) =>
            h(
              'button',
              {
                type: 'button',
                key: item.id,
                className: 'xp-chip',
                'data-active': filter === item.id ? 'true' : undefined,
                onClick: () => setFilter(item.id),
              },
              item.label,
            ),
          ),
        ),
        notice ? h('div', { className: 'xp-banner', 'data-kind': notice.kind || 'error' }, h('span', null, notice.text)) : null,
        h(
          'div',
          { className: 'xp-list' },
          filtered.length === 0
            ? h(
                'div',
                { className: 'xp-empty' },
                h('div', { className: 'xp-empty-mark' }, h(LayersIcon, { size: 20 })),
                h('div', { className: 'xp-empty-title' }, query || filter !== 'all' ? '没有匹配的' : '还没有经验'),
                h('div', { className: 'xp-empty-sub' }, query || filter !== 'all' ? '换个关键词，或切回全部。' : '做成一件事后，agent 会按 AGENTSKILL.md 记一条在这里。'),
              )
            : filtered.map((item, index) =>
                h(
                  'button',
                  {
                    type: 'button',
                    key: item.id,
                    className: 'xp-row',
                    style: { '--i': String(index) },
                    onClick: (event) => onOpen(item.id, event),
                  },
                  h('span', { className: 'xp-row-num' }, pad2(index + 1)),
                  h(
                    'span',
                    { className: 'xp-row-main' },
                    h('span', { className: 'xp-row-title' }, item.title || '未命名经验'),
                    h('span', { className: 'xp-row-sub' }, item.preview || '目标还没写'),
                    item.tags && item.tags.length
                      ? h('span', { className: 'xp-row-tags' }, item.tags.slice(0, 4).map((tag) => h('span', { className: 'xp-tag', key: tag }, tag)))
                      : null,
                  ),
                  h(
                    'span',
                    { className: 'xp-row-side' },
                    h('span', { className: 'xp-status', 'data-status': item.status }, statusLabel(item.status)),
                    h('span', { className: 'xp-row-date' }, fmtDate(item.updatedAt)),
                    h('span', { className: 'xp-row-count' }, countsLine(item.counts)),
                  ),
                ),
              ),
        ),
      )
    }

    /* ------------------------------------------------------------------ */
    /* 经验详情                                                            */
    /* ------------------------------------------------------------------ */

    function SkillDetailPage({ id, skills, onBack, onOpenSkill, onRefresh }) {
      const [record, setRecord] = React.useState(null)
      const [phase, setPhase] = React.useState('loading')
      const [stage, setStage] = React.useState('goal')
      const [query, setQuery] = React.useState('')
      const [dirty, setDirty] = React.useState(false)
      const [saveState, setSaveState] = React.useState('idle')
      const [notice, setNotice] = React.useState(null)
      const [confirmDelete, setConfirmDelete] = React.useState(false)
      const recordRef = React.useRef(null)
      const baseRef = React.useRef('')
      const dirtyRef = React.useRef(false)
      const revRef = React.useRef(0)
      const timerRef = React.useRef(null)

      const saveNow = React.useCallback(async (force) => {
        const current = recordRef.current
        if (!current) return true
        if (!dirtyRef.current && !force) return true
        const rev = revRef.current
        clearTimeout(timerRef.current)
        setSaveState('saving')
        try {
          const data = await request('/skill/update', {
            id: current.id,
            patch: {
              title: current.title,
              status: current.status,
              tags: current.tags,
              goal: current.goal,
              plan: current.plan,
              execution: current.execution,
            },
            baseUpdatedAt: force ? undefined : baseRef.current,
          })
          baseRef.current = data.record.updatedAt
          if (revRef.current === rev) {
            dirtyRef.current = false
            setDirty(false)
            setSaveState('saved')
          } else {
            dirtyRef.current = true
            setDirty(true)
            setSaveState('idle')
          }
          setNotice(null)
          onRefresh()
          return true
        } catch (error) {
          setSaveState('error')
          setNotice({ kind: 'error', text: error.message, conflict: error.code === 'CONFLICT' })
          return false
        }
      }, [onRefresh])

      const load = React.useCallback(async (skillId) => {
        setPhase('loading')
        try {
          const data = await request('/skill?id=' + encodeURIComponent(skillId))
          setRecord(data.record)
          recordRef.current = data.record
          baseRef.current = data.record.updatedAt
          dirtyRef.current = false
          setDirty(false)
          setSaveState('idle')
          setNotice(null)
          setConfirmDelete(false)
          setStage('goal')
          setPhase('ready')
        } catch (error) {
          setNotice({ kind: 'error', text: error.message })
          setPhase('error')
        }
      }, [])

      React.useEffect(() => {
        load(id)
      }, [id, load])

      React.useEffect(() => {
        if (!dirty || !record) return undefined
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => saveNow(false), 800)
        return () => clearTimeout(timerRef.current)
      }, [dirty, record, saveNow])

      const update = React.useCallback((mutator) => {
        revRef.current += 1
        setRecord((previous) => {
          if (!previous) return previous
          const next = clone(previous)
          mutator(next)
          recordRef.current = next
          return next
        })
        dirtyRef.current = true
        setDirty(true)
        setSaveState('idle')
        setNotice(null)
      }, [])

      const pick = async (nextId) => {
        if (nextId === id) return
        if (dirtyRef.current) {
          const saved = await saveNow(false)
          if (!saved) return
        }
        onOpenSkill(nextId)
      }

      const handleBack = async (event) => {
        if (dirtyRef.current) {
          const saved = await saveNow(false)
          if (!saved) return
        }
        onBack(event)
      }

      const cycleStatus = () => {
        update((draft) => { draft.status = draft.status === 'done' ? 'active' : 'done' })
      }

      const remove = async () => {
        if (!record) return
        if (!confirmDelete) {
          setConfirmDelete(true)
          return
        }
        try {
          await request('/skill/delete', { id: record.id })
          onRefresh()
          onBack()
        } catch (error) {
          setNotice({ kind: 'error', text: error.message })
        }
      }

      const indexOf = (itemId) => {
        for (let index = 0; index < skills.length; index += 1) {
          if (skills[index].id === itemId) return index + 1
        }
        return skills.length
      }

      const rail = React.useMemo(() => {
        const keyword = query.trim().toLowerCase()
        return skills.filter((item) => {
          if (!keyword) return true
          return ((item.title || '') + ' ' + (item.preview || '')).toLowerCase().includes(keyword)
        })
      }, [skills, query])

      return h(
        'div',
        { className: 'xp-page' },
        h(
          'div',
          { className: 'xp-page-head' },
          h('button', { type: 'button', className: 'xp-back', onClick: handleBack, title: '返回' }, h(BackIcon, null)),
          h('input', {
            className: 'xp-title-input',
            value: record ? record.title || '' : '',
            placeholder: '经验标题',
            disabled: !record,
            onChange: (event) => update((draft) => { draft.title = event.target.value }),
          }),
          h(
            'div',
            { className: 'xp-head-meta' },
            record ? h('button', {
              type: 'button',
              className: 'xp-status',
              'data-status': record.status,
              onClick: cycleStatus,
              title: '点一下切换 进行中 / 完成',
            }, statusLabel(record.status)) : null,
            record ? h('span', { className: 'xp-head-updated' }, '更新 ' + fmtTime(record.updatedAt)) : null,
            h('span', { className: 'xp-save-state', 'data-state': saveState }, saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '已保存' : dirty ? '未保存' : ''),
            record ? h('button', { type: 'button', className: 'xp-btn xp-btn-danger-ghost', onClick: remove }, confirmDelete ? '确认删除' : '删除') : null,
          ),
        ),
        h(SearchBox, { value: query, onChange: setQuery, placeholder: '在左侧列表里找一条经验' }),
        notice
          ? h(
              'div',
              { className: 'xp-banner', 'data-kind': notice.kind || 'error' },
              h('span', null, notice.text),
              notice.conflict
                ? h(
                    'span',
                    { className: 'xp-banner-actions' },
                    h('button', { type: 'button', onClick: () => load(id) }, '重新载入'),
                    h('button', { type: 'button', onClick: () => saveNow(true) }, '仍然覆盖'),
                  )
                : null,
            )
          : null,
        h(
          'div',
          { className: 'xp-split' },
          h(
            'div',
            { className: 'xp-rail' },
            rail.map((item) =>
              h(
                'button',
                {
                  type: 'button',
                  key: item.id,
                  className: 'xp-rail-item',
                  'data-active': item.id === id ? 'true' : undefined,
                  onClick: () => pick(item.id),
                },
                h('span', { className: 'xp-rail-num' }, pad2(indexOf(item.id))),
                h('span', { className: 'xp-rail-title' }, item.title || '未命名经验'),
              ),
            ),
            rail.length === 0 ? h('div', { className: 'xp-rail-empty' }, '没有匹配') : null,
          ),
          phase === 'loading'
            ? h('div', { className: 'xp-canvas' }, h('div', { className: 'xp-loading' }, '正在读经验…'))
            : !record
              ? h(
                  'div',
                  { className: 'xp-canvas' },
                  h(
                    'div',
                    { className: 'xp-empty' },
                    h('div', { className: 'xp-empty-mark' }, h(LayersIcon, { size: 20 })),
                    h('div', { className: 'xp-empty-title' }, '这条经验读不出来'),
                    h('div', { className: 'xp-empty-sub' }, phase === 'error' && notice ? notice.text : '到列表里换一条看看。'),
                  ),
                )
              : h(
                  'div',
                  { className: 'xp-canvas', 'data-flow': 'true' },
                  h(SkillFlow, { record, stage, update, onStage: setStage }),
                  h('div', { className: 'xp-canvas-hint' }, '点一张卡展开，再点另一张切换；所有文字都能直接改，改完自动保存。'),
                ),
        ),
      )
    }

    /* ------------------------------------------------------------------ */
    /* 想法列表                                                            */
    /* ------------------------------------------------------------------ */

    function IdeasPage({ ideas, onBack, onOpen, onCreated, onRefresh }) {
      const [query, setQuery] = React.useState('')
      const [notice, setNotice] = React.useState(null)
      const [creating, setCreating] = React.useState(false)

      const filtered = React.useMemo(() => {
        const keyword = query.trim().toLowerCase()
        return ideas.filter((item) => {
          if (!keyword) return true
          return ((item.title || '') + ' ' + (item.preview || '')).toLowerCase().includes(keyword)
        })
      }, [ideas, query])

      const create = async () => {
        if (creating) return
        setCreating(true)
        try {
          const data = await request('/idea/create', { title: '新的想法', body: '', status: 'draft' })
          await onRefresh()
          onCreated(data.record.id)
        } catch (error) {
          setNotice({ kind: 'error', text: error.message })
          setCreating(false)
        }
      }

      return h(
        'div',
        { className: 'xp-page' },
        h(
          'div',
          { className: 'xp-page-head' },
          h('button', { type: 'button', className: 'xp-back', onClick: onBack, title: '返回' }, h(BackIcon, null)),
          h(
            'div',
            { className: 'xp-page-title-wrap' },
            h('div', { className: 'xp-page-title' }, 'ideas'),
            h('div', { className: 'xp-page-sub' }, '想法 · 在这里起草，我来做'),
          ),
          h(
            'div',
            { className: 'xp-head-actions' },
            h('button', { type: 'button', className: 'xp-btn xp-btn-primary', onClick: create, disabled: creating }, creating ? '新建中…' : '+ 新想法'),
          ),
        ),
        h(SearchBox, { value: query, onChange: setQuery, placeholder: '搜想法标题和正文' }),
        notice ? h('div', { className: 'xp-banner', 'data-kind': notice.kind || 'error' }, h('span', null, notice.text)) : null,
        h(
          'div',
          { className: 'xp-list' },
          filtered.length === 0
            ? h(
                'div',
                { className: 'xp-empty' },
                h('div', { className: 'xp-empty-mark' }, h(SparkIcon, { size: 20 })),
                h('div', { className: 'xp-empty-title' }, query ? '没有匹配的' : '还没有想法'),
                h('div', { className: 'xp-empty-sub' }, query ? '换个关键词试试。' : '把想做的事写下来；说「看想法 / 按想法做」，我会读它去做。'),
              )
            : filtered.map((item, index) =>
                h(
                  'button',
                  {
                    type: 'button',
                    key: item.id,
                    className: 'xp-row',
                    style: { '--i': String(index) },
                    onClick: (event) => onOpen(item.id, event),
                  },
                  h('span', { className: 'xp-row-num' }, pad2(index + 1)),
                  h(
                    'span',
                    { className: 'xp-row-main' },
                    h('span', { className: 'xp-row-title' }, item.title || '未命名想法'),
                    h('span', { className: 'xp-row-sub' }, item.preview || '还是空的'),
                  ),
                  h(
                    'span',
                    { className: 'xp-row-side' },
                    h('span', { className: 'xp-status', 'data-status': item.status }, statusLabel(item.status)),
                    h('span', { className: 'xp-row-date' }, fmtDate(item.updatedAt)),
                    h('span', { className: 'xp-row-count' }, item.length ? item.length + ' 字' : ''),
                  ),
                ),
              ),
        ),
      )
    }

    /* ------------------------------------------------------------------ */
    /* 想法详情                                                            */
    /* ------------------------------------------------------------------ */

    function IdeaDetailPage({ id, ideas, onBack, onOpenIdea, onRefresh, onOpenSkill }) {
      const [record, setRecord] = React.useState(null)
      const [phase, setPhase] = React.useState('loading')
      const [query, setQuery] = React.useState('')
      const [dirty, setDirty] = React.useState(false)
      const [saving, setSaving] = React.useState(false)
      const [copied, setCopied] = React.useState(false)
      const [notice, setNotice] = React.useState(null)
      const [confirmDelete, setConfirmDelete] = React.useState(false)
      const [statusMenu, setStatusMenu] = React.useState(false)
      const statusBoxRef = React.useRef(null)
      const recordRef = React.useRef(null)
      const baseRef = React.useRef('')
      const dirtyRef = React.useRef(false)
      const revRef = React.useRef(0)
      const timerRef = React.useRef(null)

      React.useEffect(() => {
        let alive = true
        setPhase('loading')
        request('/idea?id=' + encodeURIComponent(id))
          .then((data) => {
            if (!alive) return
            setRecord(data.record)
            recordRef.current = data.record
            baseRef.current = data.record.updatedAt
            setDirty(false)
            dirtyRef.current = false
            setSaving(false)
            setNotice(null)
            setConfirmDelete(false)
            setPhase('ready')
          })
          .catch((error) => {
            if (!alive) return
            setNotice({ kind: 'error', text: error.message })
            setPhase('error')
          })
        return () => { alive = false }
      }, [id])

      /* 状态胶囊菜单：展开后点菜单外任意处收起；点按钮本身的切换由按钮 onClick 处理，
         因为按钮也在 statusBox 里，外点监听不会先把菜单关掉 */
      React.useEffect(() => {
        if (!statusMenu) return undefined
        const onDocClick = (event) => {
          if (statusBoxRef.current && statusBoxRef.current.contains(event.target)) return
          setStatusMenu(false)
        }
        document.addEventListener('click', onDocClick)
        return () => document.removeEventListener('click', onDocClick)
      }, [statusMenu])

      const update = React.useCallback((patch) => {
        revRef.current += 1
        setRecord((previous) => {
          if (!previous) return previous
          const next = Object.assign({}, previous, patch)
          recordRef.current = next
          return next
        })
        dirtyRef.current = true
        setDirty(true)
        setNotice(null)
      }, [])

      const saveNow = React.useCallback(async (force) => {
        const current = recordRef.current
        if (!current || !current.id) return true
        if (!dirtyRef.current && !force) return true
        const rev = revRef.current
        const title = String(current.title || '').trim() || '未命名想法'
        const body = String(current.body || '')
        setSaving(true)
        try {
          const data = await request('/idea/update', {
            id: current.id,
            patch: { title, body, status: current.status },
            baseUpdatedAt: force ? undefined : baseRef.current,
          })
          baseRef.current = data.record.updatedAt
          const merged = Object.assign({}, recordRef.current, {
            createdAt: recordRef.current.createdAt || data.record.createdAt,
            updatedAt: data.record.updatedAt,
          })
          recordRef.current = merged
          setRecord(merged)
          if (revRef.current === rev) {
            setDirty(false)
            dirtyRef.current = false
          } else {
            setDirty(true)
            dirtyRef.current = true
          }
          setNotice(null)
          onRefresh()
          return true
        } catch (error) {
          setNotice({
            kind: 'error',
            text: error.message,
            conflict: error.code === 'CONFLICT',
          })
          return false
        } finally {
          setSaving(false)
        }
      }, [onRefresh])

      React.useEffect(() => {
        if (!dirty || !record) return undefined
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => saveNow(false), 900)
        return () => clearTimeout(timerRef.current)
      }, [dirty, record, saveNow])

      const pick = async (nextId) => {
        if (nextId === id) return
        if (dirtyRef.current) {
          const saved = await saveNow(false)
          if (!saved) return
        }
        onOpenIdea(nextId)
      }

      const handleBack = async (event) => {
        if (dirtyRef.current) {
          const saved = await saveNow(false)
          if (!saved) return
        }
        onBack(event)
      }

      /* 点状态菜单里的某一项：立即写回这个状态，并把服务端返回的记录作为最新本地状态 */
      const chooseStatus = async (nextStatus) => {
        setStatusMenu(false)
        const current = recordRef.current
        if (!current || !current.id) return
        if (current.status === nextStatus) return
        try {
          const data = await request('/idea/update', { id: current.id, status: nextStatus })
          baseRef.current = data.record.updatedAt
          const merged = Object.assign({}, recordRef.current, data.record)
          recordRef.current = merged
          setRecord(merged)
          setNotice(null)
          onRefresh()
        } catch (error) {
          setNotice({ kind: 'error', text: error.message })
        }
      }

      /* 复制给 agent：先保存没保存的正文，再把不是「已完成」的想法标成「进行中」，最后复制指令文本 */
      const copy = async () => {
        const current = recordRef.current
        if (!current || !current.id) return
        if (dirtyRef.current) {
          const saved = await saveNow(false)
          if (!saved) return
        }
        if (recordRef.current && recordRef.current.status !== 'done') {
          try {
            const data = await request('/idea/update', { id: recordRef.current.id, status: 'doing' })
            baseRef.current = data.record.updatedAt
            const merged = Object.assign({}, recordRef.current, data.record)
            recordRef.current = merged
            setRecord(merged)
            onRefresh()
          } catch (error) {
            setNotice({ kind: 'error', text: error.message })
          }
        }
        const text = [
          '请读取「全局经验」面板里的想法「' + (current.title || '未命名想法') + '」（id: ' + current.id + '）。',
          '按 AGENTSKILL.md 的规矩执行；用户验收通过后再用 experience_record 记经验，sourceIdeaId 填 ' +
            current.id +
            '（面板会自动把这条想法标成已完成）。验收之前不要记经验。',
        ].join('\n')
        const ok = await copyText(text)
        setCopied(ok)
        setTimeout(() => setCopied(false), 1800)
      }

      const remove = async () => {
        if (!record || !record.id) return
        if (!confirmDelete) {
          setConfirmDelete(true)
          return
        }
        try {
          await request('/idea/delete', { id: record.id })
          onRefresh()
          onBack()
        } catch (error) {
          setNotice({ kind: 'error', text: error.message })
        }
      }

      const indexOf = (itemId) => {
        for (let index = 0; index < ideas.length; index += 1) {
          if (ideas[index].id === itemId) return index + 1
        }
        return ideas.length
      }

      const rail = React.useMemo(() => {
        const keyword = query.trim().toLowerCase()
        return ideas.filter((item) => {
          if (!keyword) return true
          return ((item.title || '') + ' ' + (item.preview || '')).toLowerCase().includes(keyword)
        })
      }, [ideas, query])

      return h(
        'div',
        { className: 'xp-page' },
        h(
          'div',
          { className: 'xp-page-head' },
          h('button', { type: 'button', className: 'xp-back', onClick: handleBack, title: '返回' }, h(BackIcon, null)),
          h('div', { className: 'xp-page-title' }, 'idea'),
          h(
            'div',
            { className: 'xp-head-actions' },
            h('span', { className: 'xp-save-state' }, saving ? '保存中…' : dirty ? '未保存' : '已保存'),
            record ? h('button', { type: 'button', className: 'xp-btn xp-btn-danger-ghost', onClick: remove }, confirmDelete ? '确认删除' : '删除') : null,
          ),
        ),
        h(SearchBox, { value: query, onChange: setQuery, placeholder: '在左侧列表里找一条想法' }),
        notice
          ? h(
              'div',
              { className: 'xp-banner', 'data-kind': notice.kind || 'error' },
              h('span', null, notice.text),
              notice.conflict
                ? h(
                    'span',
                    { className: 'xp-banner-actions' },
                    h('button', { type: 'button', onClick: () => saveNow(true) }, '仍然覆盖'),
                  )
                : null,
            )
          : null,
        h(
          'div',
          { className: 'xp-split' },
          h(
            'div',
            { className: 'xp-rail' },
            rail.map((item) =>
              h(
                'button',
                {
                  type: 'button',
                  key: item.id,
                  className: 'xp-rail-item',
                  'data-active': item.id === id ? 'true' : undefined,
                  onClick: () => pick(item.id),
                },
                h('span', { className: 'xp-rail-num' }, pad2(indexOf(item.id))),
                h('span', { className: 'xp-rail-title' }, item.title || '未命名想法'),
              ),
            ),
            rail.length === 0 ? h('div', { className: 'xp-rail-empty' }, '没有匹配') : null,
          ),
          phase === 'loading'
            ? h('div', { className: 'xp-canvas' }, h('div', { className: 'xp-loading' }, '正在读想法…'))
            : !record
              ? h(
                  'div',
                  { className: 'xp-canvas' },
                  h(
                    'div',
                    { className: 'xp-empty' },
                    h('div', { className: 'xp-empty-mark' }, h(SparkIcon, { size: 20 })),
                    h('div', { className: 'xp-empty-title' }, '这条想法读不出来'),
                    h('div', { className: 'xp-empty-sub' }, phase === 'error' && notice ? notice.text : '到列表里换一条看看。'),
                  ),
                )
              : h(
                  'div',
                  { className: 'xp-canvas' },
                  h(
                    'div',
                    { className: 'xp-idea-head' },
                    h('span', { className: 'xp-idea-badge' }, pad2(indexOf(record.id))),
                    h('input', {
                      className: 'xp-title-input xp-title-lg',
                      value: record.title || '',
                      placeholder: '想法标题',
                      onChange: (event) => update({ title: event.target.value }),
                    }),
                  ),
                  h(
                    'div',
                    { className: 'xp-idea-meta' },
                    h(
                      'div',
                      { className: 'xp-idea-status', ref: statusBoxRef },
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'xp-status',
                          'data-status': record.status || 'draft',
                          title: '点开改状态',
                          onClick: () => setStatusMenu((open) => !open),
                        },
                        statusLabel(record.status),
                      ),
                      statusMenu
                        ? h(
                            'div',
                            { className: 'xp-status-menu' },
                            [
                              { value: 'draft', label: '未完成' },
                              { value: 'doing', label: '进行中' },
                              { value: 'done', label: '已完成' },
                            ].map((item) =>
                              h(
                                'button',
                                {
                                  type: 'button',
                                  key: item.value,
                                  className: 'xp-status-option',
                                  'data-active': (record.status || 'draft') === item.value ? 'true' : undefined,
                                  onClick: () => chooseStatus(item.value),
                                },
                                item.label,
                              ),
                            ),
                          )
                        : null,
                    ),
                    h('span', null, '更新 ' + fmtTime(record.updatedAt)),
                  ),
                  h('textarea', {
                    className: 'xp-editor',
                    value: record.body || '',
                    placeholder: '想做什么、为什么、什么算做完…\n\n我读到这里的内容后会照着做。',
                    spellCheck: false,
                    onChange: (event) => update({ body: event.target.value }),
                  }),
                  h(
                    'div',
                    { className: 'xp-idea-tools' },
                    h('button', { type: 'button', className: 'xp-btn', onClick: copy }, copied ? '已复制 ✓' : '复制给 agent'),
                    h('span', { className: 'xp-hint' }, '改完自动保存'),
                  ),
                ),
        ),
      )
    }

    /* ------------------------------------------------------------------ */
    /* 记事本                                                              */
    /* ------------------------------------------------------------------ */

    function BookPage({ notes, mtimeMs, onRefresh, onBack }) {
      const [local, setLocal] = React.useState(notes || [])
      const [editor, setEditor] = React.useState(null)
      const [notice, setNotice] = React.useState(null)
      const [query, setQuery] = React.useState('')
      const dirtyRef = React.useRef(false)
      const revRef = React.useRef(0)
      const saveTimer = React.useRef(null)
      const savingRef = React.useRef(false)
      const pendingRef = React.useRef(null)
      const baseRef = React.useRef(mtimeMs || 0)

      React.useEffect(() => {
        if (!dirtyRef.current) {
          setLocal(notes || [])
          baseRef.current = mtimeMs || 0
        }
      }, [notes, mtimeMs])

      const flush = async (items) => {
        if (savingRef.current) {
          pendingRef.current = items
          return
        }
        const rev = revRef.current
        savingRef.current = true
        try {
          const data = await request('/notes/save', { items, baseMtimeMs: baseRef.current })
          baseRef.current = data.mtimeMs || 0
          dirtyRef.current = revRef.current !== rev
          setNotice(null)
          onRefresh()
        } catch (error) {
          if (error.code === 'CONFLICT') {
            pendingRef.current = null
            setNotice({ kind: 'error', text: '记事本在别处改过了。点「重新载入」拉最新版。', conflict: true })
          } else {
            setNotice({ kind: 'error', text: error.message })
          }
        } finally {
          savingRef.current = false
          const pending = pendingRef.current
          pendingRef.current = null
          if (pending) flush(pending)
        }
      }

      const commit = (next, immediate) => {
        revRef.current += 1
        setLocal(next)
        dirtyRef.current = true
        clearTimeout(saveTimer.current)
        if (immediate) {
          flush(next)
        } else {
          saveTimer.current = setTimeout(() => flush(next), 600)
        }
      }

      const openNew = (event) => {
        setEditor({
          note: { id: '', title: '', body: '', date: todayKey(), color: local.length % 6 },
          isNew: true,
          origin: popOrigin(event.currentTarget),
        })
      }

      const openNote = (note, event) => {
        setEditor({ note, isNew: false, origin: popOrigin(event.currentTarget) })
      }

      const saveNote = (patch) => {
        const current = editor
        if (!current) return
        if (current.isNew) {
          const note = Object.assign({ id: uniqueId('note'), createdAt: new Date().toISOString() }, current.note, patch)
          commit([note].concat(local), true)
        } else {
          commit(local.map((item) => (item.id === current.note.id ? Object.assign({}, item, patch) : item)), true)
        }
        setEditor(null)
      }

      const deleteNote = () => {
        const current = editor
        if (!current) return
        setEditor(null)
        if (!current.note.id) return
        commit(local.filter((item) => item.id !== current.note.id), true)
      }

      const keyword = query.trim().toLowerCase()
      const shown = keyword
        ? local.filter((note) =>
            ((note.title || '') + ' ' + (note.body || '') + ' ' + (note.date || '')).toLowerCase().includes(keyword),
          )
        : local

      return h(
        'div',
        { className: 'xp-page' },
        h(
          'div',
          { className: 'xp-page-head' },
          h('button', { type: 'button', className: 'xp-back', onClick: onBack, title: '返回' }, h(BackIcon, null)),
          h(
            'div',
            { className: 'xp-page-title-wrap' },
            h('div', { className: 'xp-page-title' }, 'book'),
            h('div', { className: 'xp-page-sub' }, '记事本 · 一条一条记，按日期排'),
          ),
          h(
            'div',
            { className: 'xp-head-actions' },
            h('button', { type: 'button', className: 'xp-book-add', onClick: openNew, title: '记一条' }, h(PlusIcon, null)),
          ),
        ),
        local.length ? h(SearchBox, { value: query, onChange: setQuery, placeholder: '搜标题、内容或日期' }) : null,
        notice
          ? h(
              'div',
              { className: 'xp-banner', 'data-kind': notice.kind || 'error' },
              h('span', null, notice.text),
              notice.conflict
                ? h(
                    'span',
                    { className: 'xp-banner-actions' },
                    h('button', { type: 'button', onClick: () => { dirtyRef.current = false; onRefresh() } }, '重新载入'),
                  )
                : null,
            )
          : null,
        local.length === 0
          ? h(
              'div',
              { className: 'xp-empty' },
              h('div', { className: 'xp-empty-mark' }, h(NoteIcon, { size: 20 })),
              h('div', { className: 'xp-empty-title' }, '还没有记事'),
              h('div', { className: 'xp-empty-sub' }, '点右上角的 ＋，记下一条；完成的事会留在这里。'),
            )
          : shown.length === 0
            ? h(
                'div',
                { className: 'xp-empty' },
                h('div', { className: 'xp-empty-mark' }, h(SearchIcon, { size: 20 })),
                h('div', { className: 'xp-empty-title' }, '没有匹配的记事'),
                h('div', { className: 'xp-empty-sub' }, '换个关键词试试，或者清空搜索框。'),
              )
            : h(
              'div',
              { className: 'xp-book-grid' },
              shown.map((note, index) =>
                h(
                  'button',
                  {
                    type: 'button',
                    key: note.id,
                    className: 'xp-book-card xp-note-c' + ((note.color || 0) % 6),
                    style: { '--i': String(index) },
                    onClick: (event) => openNote(note, event),
                    title: '点开编辑',
                  },
                  h('span', { className: 'xp-book-date' }, note.date),
                  h('span', { className: 'xp-book-title' }, note.title || '无标题'),
                  h('span', { className: 'xp-book-text' }, note.body),
                ),
              ),
            ),
        editor
          ? h(NoteEditor, {
              note: editor.note,
              isNew: editor.isNew,
              origin: editor.origin,
              onSave: saveNote,
              onDelete: deleteNote,
              onClose: () => setEditor(null),
            })
          : null,
      )
    }

    /* ------------------------------------------------------------------ */
    /* 面板路由                                                            */
    /* ------------------------------------------------------------------ */

    function Panel() {
      const [route, setRoute] = React.useState({ name: 'home' })
      const [overlay, setOverlay] = React.useState(null)
      const [state, setState] = React.useState(null)
      const [error, setError] = React.useState('')
      const [loaded, setLoaded] = React.useState(false)
      const [refreshing, setRefreshing] = React.useState(false)
      const [opening, setOpening] = React.useState(null)
      const [closing, setClosing] = React.useState(null)
      const rootRef = React.useRef(null)
      const navRef = React.useRef(null)
      const closingRef = React.useRef(false)
      const openingRef = React.useRef(false)
      const zoomTimerRef = React.useRef(null)
      const zoomStampRef = React.useRef(true)
      const openHomeRef = React.useRef(null)
      const closeHomeRef = React.useRef(null)

      const refresh = React.useCallback(async () => {
        setRefreshing(true)
        try {
          const data = await request('/state')
          setState(data)
          setError('')
          return data
        } catch (requestError) {
          setError(requestError.message)
          return null
        } finally {
          setLoaded(true)
          setRefreshing(false)
        }
      }, [])

      React.useEffect(() => {
        refresh()
      }, [refresh])

      const go = React.useCallback((next, event) => {
        if (closingRef.current) return
        const element = event && event.currentTarget
        const root = rootRef.current
        let rect = null
        let rootRect = null
        let tileId = null
        if (element && root) {
          rect = element.getBoundingClientRect()
          rootRect = root.getBoundingClientRect()
          tileId = element.getAttribute ? element.getAttribute('data-tile') : null
        }
        if (tileId) {
          // 从首页卡片进入：卡片原位膨胀成页面，其余卡片被「挤开」
          navRef.current = { tileId, rect, rootRect, tile: element }
          openingRef.current = true
          zoomStampRef.current = false
          setOpening({ vars: growVars(rect, rootRect) })
          setRoute(next)
          clearTimeout(zoomTimerRef.current)
          zoomTimerRef.current = setTimeout(() => {
            openingRef.current = false
            setOpening(null)
          }, 520)
        } else if (navRef.current) {
          // 往深处走（列表行/详情切换）：保持初始卡片，页面直接呈现
          navRef.current = { tileId: navRef.current.tileId, rect, rootRect, tile: navRef.current.tile }
          setRoute(next)
        } else {
          navRef.current = { tileId: null, rect, rootRect, tile: null }
          setRoute(next)
        }
      }, [])

      const back = React.useCallback(() => {
        if (closingRef.current || openingRef.current) return
        const nav = navRef.current
        const rootRect = nav && nav.rootRect ? nav.rootRect : (rootRef.current ? rootRef.current.getBoundingClientRect() : null)
        closingRef.current = true
        zoomStampRef.current = false
        setClosing({ vars: shrinkVars(nav && nav.rect, rootRect), tileId: nav ? nav.tileId : null })
        clearTimeout(zoomTimerRef.current)
        zoomTimerRef.current = setTimeout(() => {
          closingRef.current = false
          setClosing(null)
          setRoute({ name: 'home' })
        }, 460)
      }, [])

      // 转场图层就位（绘制前）：给待挤开的卡片算好各自沿「远离被点卡片」方向的位移，
      // 标记源卡片、给待挤开的卡片算好各自沿「远离被点卡片」方向的位移；
      // 返回时顺便量一次卡片实时位置，保证落点严丝合缝。
      React.useLayoutEffect(() => {
        const layer = opening ? openHomeRef.current : closing ? closeHomeRef.current : null
        if (!layer || zoomStampRef.current) return
        zoomStampRef.current = true
        const nav = navRef.current
        const sourceId = nav ? nav.tileId : null
        const rootRect = rootRef.current ? rootRef.current.getBoundingClientRect() : null
        const sourceEl = sourceId ? layer.querySelector('[data-tile="' + sourceId + '"]') : null
        const sourceRect = sourceEl ? sourceEl.getBoundingClientRect() : null
        const cx = sourceRect ? sourceRect.left + sourceRect.width / 2 : (rootRect ? rootRect.width / 2 : 0)
        const cy = sourceRect ? sourceRect.top + sourceRect.height / 2 : (rootRect ? rootRect.height / 2 : 0)
        layer.querySelectorAll('[data-tile]').forEach((tile) => {
          if (tile === sourceEl) {
            tile.setAttribute('data-source', 'true')
            return
          }
          const rect = tile.getBoundingClientRect()
          const dx = rect.left + rect.width / 2 - cx
          const dy = rect.top + rect.height / 2 - cy
          const len = Math.max(Math.hypot(dx, dy), 1)
          const push = 96 + Math.min(len * 0.55, 220)
          tile.style.setProperty('--px', ((dx / len) * push).toFixed(1) + 'px')
          tile.style.setProperty('--py', ((dy / len) * push).toFixed(1) + 'px')
        })
        if (closing && sourceEl && rootRect) {
          const fresh = shrinkVars(sourceEl.getBoundingClientRect(), rootRect)
          setClosing((previous) => (previous && JSON.stringify(previous.vars) !== JSON.stringify(fresh)
            ? { vars: fresh, tileId: previous.tileId }
            : previous))
        }
      }, [opening, closing])

      const openDoc = React.useCallback((name, event) => {
        const element = event && event.currentTarget
        setOverlay({ name, origin: element ? popOrigin(element) : null })
      }, [])

      React.useEffect(() => {
        if (route.name === 'home' || overlay) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            back()
          }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [route.name, overlay, back])

      const skills = (state && state.skills) || []
      const ideas = (state && state.ideas) || []
      const notes = (state && state.notes) || []

      let body = null
      if (!loaded) {
        body = h('div', { className: 'xp-loading' }, '正在读数据目录…')
      } else if (route.name === 'home') {
        body = h(Home, { state, error, onRetry: refresh, onOpen: go, onDoc: openDoc, onInfo: (event) => openDoc('info', event) })
      } else if (route.name === 'skills') {
        body = h(SkillsPage, {
          skills,
          onBack: back,
          onOpen: (id, event) => go({ name: 'skill', id }, event),
          onCreated: (id) => { refresh(); setRoute({ name: 'skill', id }) },
          onRefresh: refresh,
        })
      } else if (route.name === 'skill') {
        body = h(SkillDetailPage, {
          id: route.id,
          skills,
          onBack: back,
          onOpenSkill: (id) => { setRoute({ name: 'skill', id }) },
          onRefresh: refresh,
        })
      } else if (route.name === 'ideas') {
        body = h(IdeasPage, {
          ideas,
          onBack: back,
          onOpen: (id, event) => go({ name: 'idea', id }, event),
          onCreated: (id) => { refresh(); setRoute({ name: 'idea', id }) },
          onRefresh: refresh,
        })
      } else if (route.name === 'idea') {
        body = h(IdeaDetailPage, {
          id: route.id,
          ideas,
          onBack: back,
          onOpenIdea: (id) => { setRoute({ name: 'idea', id }) },
          onRefresh: refresh,
          onOpenSkill: (id) => { refresh(); setRoute({ name: 'skill', id }) },
        })
      } else if (route.name === 'book') {
        body = h(BookPage, { notes, mtimeMs: state ? state.notesMtimeMs : 0, onRefresh: refresh, onBack: back })
      }

      return h(
        'div',
        { className: 'xp-root', ref: rootRef },
        closing
          ? h(
              'div',
              { className: 'xp-screen xp-zoom-home xp-returning', key: 'zoom-home', ref: closeHomeRef },
              h(Home, { state, error, onRetry: refresh, onOpen: go, onDoc: openDoc, onInfo: (event) => openDoc('info', event) }),
            )
          : null,
        opening
          ? h(
              'div',
              { className: 'xp-screen xp-zoom-home xp-pushing', key: 'zoom-home-open', ref: openHomeRef },
              h(Home, { state, error, onRetry: refresh, onOpen: go, onDoc: openDoc, onInfo: (event) => openDoc('info', event) }),
            )
          : null,
        h(
          'div',
          {
            className: 'xp-screen' + (opening ? ' xp-page-zoom' : '') + (closing ? ' xp-page-out' : ''),
            key: route.name,
            style: opening && opening.vars ? opening.vars : undefined,
          },
          body,
          h('span', { className: 'xp-refresh-glow', 'data-on': refreshing ? 'true' : undefined }),
        ),
        closing
          ? h(
              'div',
              {
                className: 'xp-zoom-clone',
                'data-mode': 'close',
                style: closing.vars,
              },
              h('div', { className: 'xp-zoom-inner', 'aria-hidden': true }),
            )
          : null,
        overlay && overlay.name === 'guide' ? h(GuideOverlay, { origin: overlay.origin, onClose: () => setOverlay(null), onSaved: refresh }) : null,
        overlay && overlay.name === 'agents' ? h(AgentsOverlay, { origin: overlay.origin, onClose: () => setOverlay(null) }) : null,
        overlay && overlay.name === 'ws-agents' ? h(WorkspaceAgentsOverlay, { origin: overlay.origin, onClose: () => setOverlay(null) }) : null,
        overlay && overlay.name === 'info' ? h(InfoOverlay, { state, origin: overlay.origin, onClose: () => setOverlay(null) }) : null,
      )
    }

    /* ------------------------------------------------------------------ */
    /* 样式                                                                */
    /* ------------------------------------------------------------------ */

    const CSS = `
.xp-root {
  --xp-bg: #f4f0e9;
  --xp-card: #fffdfa;
  --xp-card-2: #faf6ef;
  --xp-line: #e7dfd2;
  --xp-line-2: #f0e9dd;
  --xp-ink: #332e28;
  --xp-ink-2: #5e564a;
  --xp-ink-3: #8a8072;
  --xp-accent: #dd8a3d;
  --xp-accent-soft: #f4e2cd;
  --xp-note-0: #e9dcc0;
  --xp-note-1: #b9c1d7;
  --xp-note-2: #71764f;
  --xp-note-3: #ece4d0;
  --xp-note-4: #6f5645;
  --xp-note-5: #3b372f;
  color-scheme: light;
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  color: var(--xp-ink);
  background:
    radial-gradient(120% 80% at 8% -10%, #f7f5ef 0%, rgba(247, 245, 239, 0) 60%),
    radial-gradient(90% 70% at 100% 0%, #efede5 0%, rgba(239, 237, 229, 0) 55%),
    linear-gradient(180deg, #efece3 0%, #e3dfd5 100%);
  font-family: inherit;
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
  user-select: none;
}
.xp-root *, .xp-root *::before, .xp-root *::after { box-sizing: border-box; }
.xp-root button { font: inherit; color: inherit; }
.xp-root input, .xp-root textarea { user-select: text; font-family: inherit; }

.xp-screen {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; min-height: 0;
  padding: 16px 20px 14px;
  animation: none;
}
.xp-refresh-glow { display: none; }

.xp-loading { flex: 1; min-height: 0; display: grid; place-items: center; color: var(--xp-ink-3); font-size: 12px; letter-spacing: .05em; }

/* 首页 */
.xp-home { display: flex; flex-direction: column; height: 100%; min-height: 0; gap: 14px; }
.xp-home-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 2px 4px 0; }
.xp-date { font-size: 21px; font-weight: 620; letter-spacing: .02em; font-variant-numeric: tabular-nums; }
.xp-date-sub { margin-top: 3px; font-size: 11.5px; color: var(--xp-ink-3); letter-spacing: .08em; }
.xp-info-btn {
  display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 13px;
  border-radius: 999px; border: 1px solid var(--xp-line); background: rgba(255, 253, 250, .75);
  color: var(--xp-ink-2); font-size: 12px; cursor: pointer; backdrop-filter: blur(6px);
  transition: background .2s, color .2s, border-color .2s;
}
.xp-info-btn:hover { background: #fff; color: var(--xp-ink); border-color: #ded3c0; }
.xp-info-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--xp-accent); box-shadow: 0 0 0 3px rgba(221, 138, 61, .15); }

.xp-grid {
  flex: 1; min-height: 0;
  display: grid;
  container-type: inline-size;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  grid-template-rows: minmax(112px, .72fr) minmax(0, 1.45fr);
  gap: 14px;
  /* --xp-col = 三等分时一格的宽度；--xp-note-step = 记事方块一列（含列间距）的宽度
     第二排：book 比原来宽一格方块，skills 相应窄掉同样一格 —— 方块尺寸保持不变 */
  --xp-col: calc((100cqw - 28px) / 3);
  --xp-note-step: calc((var(--xp-col) - 28px) / 3);
}
.xp-tile {
  position: relative; display: flex; flex-direction: column; gap: 4px; align-items: flex-start;
  padding: 16px 18px; border-radius: 22px; border: 1px solid var(--xp-line);
  background: linear-gradient(180deg, #fffefc 0%, #fbf8f2 100%);
  box-shadow: 0 1px 2px rgba(90, 70, 40, .05), 0 18px 40px -30px rgba(90, 70, 40, .5);
  text-align: left; cursor: pointer; overflow: hidden; min-width: 0;
  transition: transform .28s cubic-bezier(.2, .9, .25, 1), box-shadow .28s, border-color .28s;
}
.xp-tile:hover { transform: translateY(-2px); border-color: #e3d8c6; box-shadow: 0 2px 4px rgba(90, 70, 40, .06), 0 26px 52px -30px rgba(90, 70, 40, .55); }
.xp-tile:active { transform: scale(.988); }
.xp-grid-pair {
  grid-column: 3; grid-row: 1;
  display: flex; gap: 14px;
  /* 宽度 = 两张正方形卡 + 中间间距；--xp-pair-h 由 Home 量出第一行高度后写入 */
  width: calc(var(--xp-pair-h, 150px) * 2 + 14px);
  min-width: 0; min-height: 0;
}
.xp-grid-pair .xp-tile { flex: 0 0 var(--xp-pair-h, 150px); width: var(--xp-pair-h, 150px); height: 100%; padding: 14px; border-radius: 20px; }
.xp-grid-pair .xp-tile-sub { font-size: 11px; }
.xp-tile-ideas { background: #e3d3b1; border-color: #ddcaa6; }
.xp-tile-guide { background: linear-gradient(160deg, #443d34 0%, #332e27 100%); border-color: rgba(255, 255, 255, .08); }
.xp-tile-agents { background: linear-gradient(160deg, #787d54 0%, #666b47 100%); border-color: rgba(255, 255, 255, .1); }
.xp-tile-ws-agents { background: linear-gradient(160deg, #596354 0%, #434c3f 100%); border-color: rgba(255, 255, 255, .1); }
.xp-tile-skills { background: linear-gradient(160deg, #c5ccdf 0%, #b1bacf 100%); border-color: #c8cfe0; }
.xp-tile-book { background: linear-gradient(180deg, #f9f5eb 0%, #efe8d8 100%); border-color: #e7decc; }
.xp-tile-dark:hover { border-color: rgba(255, 255, 255, .2); }
.xp-tile-dark .xp-tile-eyebrow { color: rgba(249, 245, 234, .54); }
.xp-tile-dark .xp-tile-title { color: #faf6ea; }
.xp-tile-dark .xp-tile-sub { color: rgba(249, 245, 234, .72); }
.xp-tile-dark .xp-tile-badge { color: rgba(249, 245, 234, .78); border-color: rgba(249, 245, 234, .26); }
.xp-tile-skills .xp-tile-eyebrow { color: rgba(48, 54, 74, .56); }
.xp-tile-skills .xp-tile-badge { color: rgba(48, 54, 74, .64); border-color: rgba(48, 54, 74, .22); }
.xp-tile-skills .xp-mini-row { background: rgba(255, 255, 255, .64); border-color: rgba(255, 255, 255, .52); }
.xp-tile-skills .xp-mini-more { color: rgba(44, 47, 56, .56); }
.xp-tile-skills { grid-column: 1 / 3; grid-row: 2; justify-self: start; width: calc(var(--xp-col) * 2 + 14px - var(--xp-note-step)); }
.xp-tile-book { grid-column: 2 / 4; grid-row: 2; justify-self: end; width: calc(var(--xp-col) + var(--xp-note-step)); }
.xp-tile-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; width: 100%; }
.xp-tile-eyebrow { font-size: 11px; letter-spacing: .12em; color: var(--xp-ink-3); font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace; }
.xp-tile-title { font-size: 24px; font-weight: 620; letter-spacing: -.01em; color: var(--xp-ink); line-height: 1.15; margin-top: 2px; }
.xp-tile-sub { font-size: 12px; color: var(--xp-ink-2); line-height: 1.5; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.xp-tile-count { position: absolute; right: 16px; top: 15px; font-size: 12px; color: var(--xp-ink-3); font-variant-numeric: tabular-nums; }
.xp-tile-badge { font-size: 11px; color: var(--xp-ink-3); border: 1px solid var(--xp-line); border-radius: 999px; padding: 1px 8px; }
.xp-mini-rows { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; width: 100%; min-height: 0; }
.xp-mini-row { display: flex; align-items: center; gap: 9px; height: 32px; padding: 0 12px; border-radius: 11px; background: #f8f4ec; border: 1px solid #efe7d9; font-size: 12.5px; color: var(--xp-ink-2); overflow: hidden; flex: 0 0 auto; }
.xp-mini-dot { width: 6px; height: 6px; border-radius: 50%; background: #c9bda9; flex: 0 0 auto; }
.xp-mini-dot[data-status="active"] { background: var(--xp-accent); }
.xp-mini-dot[data-status="done"] { background: #7f9c7a; }
.xp-mini-title { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--xp-ink); }
.xp-mini-date { font-size: 11px; color: var(--xp-ink-3); font-variant-numeric: tabular-nums; flex: 0 0 auto; }
.xp-mini-empty { font-size: 12px; color: var(--xp-ink-3); }
.xp-mini-more { margin-top: 2px; font-size: 11px; color: var(--xp-ink-3); }
.xp-mini-note-grid { margin-top: 10px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; width: 100%; align-content: start; min-height: 0; overflow: hidden; }
.xp-mini-note-swatch { display: block; aspect-ratio: 1 / 0.92; border-radius: 10px; border: 1px solid rgba(90, 70, 40, .07); padding: 8px 9px; overflow: hidden; }
.xp-mini-note-label { font-size: 12.5px; line-height: 1.35; color: var(--xp-ink); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; word-break: break-all; }
.xp-note-c0 { background: var(--xp-note-0); }
.xp-note-c1 { background: var(--xp-note-1); }
.xp-note-c2 { background: var(--xp-note-2); }
.xp-note-c3 { background: var(--xp-note-3); }
.xp-note-c4 { background: var(--xp-note-4); }
.xp-note-c5 { background: var(--xp-note-5); }
.xp-mini-note-swatch.xp-note-c2, .xp-mini-note-swatch.xp-note-c4, .xp-mini-note-swatch.xp-note-c5 { border-color: rgba(255, 250, 240, .14); }
.xp-note-c2 .xp-mini-note-label, .xp-note-c4 .xp-mini-note-label, .xp-note-c5 .xp-mini-note-label { color: rgba(251, 247, 238, .95); }
.xp-note-c2 .xp-book-title, .xp-note-c4 .xp-book-title, .xp-note-c5 .xp-book-title { color: #fbf6ea; }
.xp-note-c2 .xp-book-text, .xp-note-c4 .xp-book-text, .xp-note-c5 .xp-book-text { color: rgba(251, 247, 238, .74); }
.xp-note-c2 .xp-book-date, .xp-note-c4 .xp-book-date, .xp-note-c5 .xp-book-date { color: rgba(251, 247, 238, .56); }
.xp-home-foot { display: flex; justify-content: space-between; gap: 12px; font-size: 11px; color: var(--xp-ink-3); padding: 0 4px; }
.xp-home-foot-dir { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; }

/* 页面骨架 */
.xp-page { display: flex; flex-direction: column; height: 100%; min-height: 0; gap: 12px; }
.xp-page-head { display: flex; align-items: center; gap: 12px; min-width: 0; }
.xp-back {
  width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--xp-line);
  background: rgba(255, 253, 250, .85); display: grid; place-items: center; cursor: pointer;
  color: var(--xp-ink-2); flex: 0 0 auto; padding: 0; transition: background .18s, color .18s, transform .18s;
}
.xp-back:hover { background: #fff; color: var(--xp-ink); transform: translateX(-1px); }
.xp-page-title-wrap { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.xp-page-title { font-size: 20px; font-weight: 620; letter-spacing: -.01em; line-height: 1.15; font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace; }
.xp-page-sub { font-size: 11.5px; color: var(--xp-ink-3); }
.xp-head-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.xp-head-meta { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; min-width: 0; flex: 0 0 auto; }
.xp-head-updated { font-size: 11px; color: var(--xp-ink-3); font-variant-numeric: tabular-nums; }

.xp-btn {
  height: 32px; padding: 0 13px; border-radius: 10px; border: 1px solid var(--xp-line);
  background: #fffdfa; color: var(--xp-ink-2); font-size: 12.5px; cursor: pointer;
  transition: background .16s, border-color .16s, color .16s, box-shadow .16s; white-space: nowrap;
}
.xp-btn:hover { background: #fff; border-color: #dcd1bf; color: var(--xp-ink); }
.xp-btn:disabled { opacity: .5; cursor: default; }
.xp-btn-primary { background: var(--xp-accent); border-color: #cf7f33; color: #fff; font-weight: 560; box-shadow: 0 6px 14px -8px rgba(207, 127, 51, .8); }
.xp-btn-primary:hover { background: #d4822f; border-color: #c8761f; color: #fff; }
.xp-btn-danger-ghost { color: #b45b4a; border-color: #ecd6cf; background: #fdf6f4; }
.xp-btn-danger-ghost:hover { background: #fdf0ed; border-color: #e2c2b8; color: #a34e3e; }

.xp-search {
  display: flex; align-items: center; gap: 9px; height: 40px; padding: 0 15px;
  border-radius: 999px; border: 1px solid var(--xp-line); background: rgba(255, 253, 250, .92);
  color: var(--xp-ink-3); flex: 0 0 auto;
}
.xp-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font-size: 13px; color: var(--xp-ink); }
.xp-search input::placeholder { color: #b3a999; }

.xp-chips { display: flex; gap: 6px; flex: 0 0 auto; }
.xp-chip { height: 26px; padding: 0 11px; border-radius: 999px; border: 1px solid transparent; background: #efe9de; color: var(--xp-ink-2); font-size: 11.5px; cursor: pointer; transition: background .16s, color .16s; }
.xp-chip:hover { background: #e9e1d3; }
.xp-chip[data-active="true"] { background: var(--xp-ink); color: #fdfaf4; border-color: var(--xp-ink); }

.xp-status {
  display: inline-flex; align-items: center; height: 20px; padding: 0 9px; border-radius: 999px;
  border: 1px solid #e5dccd; background: #f7f2e8; color: var(--xp-ink-2); font-size: 10.5px; letter-spacing: .02em; cursor: default;
}
.xp-status[data-status="active"] { background: #fbeee0; border-color: #f0d6b6; color: #a5622a; }
.xp-status[data-status="doing"] { background: #fbeee0; border-color: #f0d6b6; color: #a5622a; }
.xp-status[data-status="done"] { background: #e9efe5; border-color: #d3e0cb; color: #5b7653; }
button.xp-status { cursor: pointer; }

/* 想法状态胶囊的弹出小菜单 */
.xp-idea-status { position: relative; display: inline-flex; }
.xp-status-menu {
  position: absolute; top: calc(100% + 6px); left: 0; z-index: 30;
  display: flex; flex-direction: column; gap: 2px; min-width: 96px; padding: 4px;
  border: 1px solid var(--xp-line); border-radius: 10px; background: #fffdfa;
  box-shadow: 0 16px 34px -20px rgba(90, 70, 40, .55);
  animation: xp-rise .18s ease both;
}
.xp-status-option {
  display: block; width: 100%; padding: 5px 10px; border: 0; border-radius: 7px;
  background: transparent; text-align: left; font-size: 11.5px; color: var(--xp-ink-2); cursor: pointer;
}
.xp-status-option:hover { background: #f6f0e6; color: var(--xp-ink); }
.xp-status-option[data-active="true"] { background: #f7eee2; color: #a5622a; }

.xp-save-state { font-size: 11px; color: var(--xp-ink-3); white-space: nowrap; }
.xp-save-state[data-state="saving"] { color: #a5622a; }
.xp-save-state[data-state="saved"] { color: #6c8a63; }
.xp-save-state[data-state="error"] { color: #b45b4a; }

.xp-banner {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 11px;
  font-size: 12px; border: 1px solid; flex: 0 0 auto; min-width: 0;
}
.xp-banner > span:first-child { min-width: 0; }
.xp-banner[data-kind="error"] { background: #fdf3f0; border-color: #f0d5cc; color: #a5543f; }
.xp-banner[data-kind="info"] { background: #f3f0e6; border-color: #e7dfcd; color: #6d6350; }
.xp-banner[data-kind="warn"] { background: #fdf6e6; border-color: #f0e0b8; color: #8a6a24; }
.xp-banner-actions { margin-left: auto; display: flex; gap: 6px; flex: 0 0 auto; }
.xp-banner-actions button { border: 1px solid rgba(120, 100, 70, .18); background: rgba(255, 255, 255, .65); color: inherit; font-size: 11.5px; padding: 3px 9px; border-radius: 7px; cursor: pointer; }
.xp-banner-actions button:hover { background: #fff; }

/* 列表 */
.xp-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 6px; }
.xp-row {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px;
  text-align: left; padding: 12px 14px; border-radius: 16px; border: 1px solid var(--xp-line);
  background: linear-gradient(180deg, #fffefc, #fcf9f3); cursor: pointer;
  box-shadow: 0 1px 2px rgba(90, 70, 40, .04);
  transition: transform .22s, box-shadow .22s, border-color .22s;
  animation: xp-rise .4s cubic-bezier(.2, .9, .25, 1) both; animation-delay: calc(var(--i, 0) * 26ms);
  flex: 0 0 auto;
}
.xp-row:hover { transform: translateY(-1px); border-color: #e0d4c1; box-shadow: 0 12px 26px -22px rgba(90, 70, 40, .7); }
.xp-row-num { width: 30px; height: 30px; border-radius: 50%; border: 1.3px solid var(--xp-line); display: grid; place-items: center; font-size: 11px; color: var(--xp-ink-3); font-variant-numeric: tabular-nums; flex: 0 0 auto; }
.xp-row-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.xp-row-title { font-size: 14px; font-weight: 560; color: var(--xp-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.xp-row-sub { font-size: 12px; color: var(--xp-ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.xp-row-tags { display: flex; gap: 4px; flex-wrap: wrap; }
.xp-tag { font-size: 10.5px; color: var(--xp-ink-2); background: #f0e9dd; border-radius: 5px; padding: 1px 6px; }
.xp-row-side { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex: 0 0 auto; }
.xp-row-date { font-size: 11px; color: var(--xp-ink-3); font-variant-numeric: tabular-nums; }
.xp-row-count { font-size: 10.5px; color: var(--xp-ink-3); }

.xp-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  color: var(--xp-ink-3); border: 1px dashed #ddd2c0; border-radius: 18px; padding: 30px; text-align: center;
}
.xp-empty-mark { width: 44px; height: 44px; border-radius: 14px; background: #f6f0e6; display: grid; place-items: center; color: #bcae99; }
.xp-empty-title { font-size: 13px; color: var(--xp-ink-2); }
.xp-empty-sub { font-size: 11.5px; max-width: 300px; line-height: 1.6; }

/* 左右分栏 */
.xp-split { flex: 1; min-height: 0; display: grid; grid-template-columns: 176px minmax(0, 1fr); gap: 12px; }
.xp-rail { display: flex; flex-direction: column; gap: 6px; min-height: 0; overflow-y: auto; padding: 8px; border-radius: 18px; border: 1px solid var(--xp-line); background: rgba(255, 253, 250, .72); }
.xp-rail-item {
  display: flex; align-items: center; gap: 8px; padding: 8px 9px; border-radius: 11px; border: 1px solid transparent;
  background: transparent; text-align: left; cursor: pointer; color: var(--xp-ink-2); font-size: 12px; transition: background .16s, border-color .16s, color .16s; flex: 0 0 auto;
}
.xp-rail-item:hover { background: #fff; }
.xp-rail-item[data-active="true"] { background: #fff; border-color: var(--xp-line); box-shadow: 0 6px 16px -14px rgba(90, 70, 40, .9); color: var(--xp-ink); }
.xp-rail-num { width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center; font-size: 10px; border: 1px solid var(--xp-line); background: #f7f2e8; color: var(--xp-ink-3); flex: 0 0 auto; font-variant-numeric: tabular-nums; }
.xp-rail-item[data-active="true"] .xp-rail-num { background: var(--xp-accent-soft); border-color: #eccba6; color: #a5622a; }
.xp-rail-title { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
.xp-rail-empty { font-size: 11.5px; color: #b0a696; padding: 6px 4px; }

.xp-canvas { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-radius: 18px; border: 1px solid var(--xp-line); background: rgba(255, 253, 250, .85); overflow-y: auto; }
.xp-canvas[data-flow="true"] { overflow: hidden; }
.xp-canvas-hint { font-size: 11px; color: var(--xp-ink-3); text-align: center; padding: 2px 0 0; flex: 0 0 auto; }

.xp-title-input {
  flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font-size: 20px; font-weight: 610;
  letter-spacing: -.01em; color: var(--xp-ink); padding: 2px 6px; border-radius: 9px; transition: background .18s, box-shadow .18s;
}
.xp-title-input:hover { background: #fff; }
.xp-title-input:focus { background: #fff; box-shadow: 0 0 0 1px var(--xp-line); }
.xp-title-input:disabled { opacity: .6; }
.xp-title-lg { font-size: 26px; padding: 0 6px; }

/* 三阶段卡片 */
.xp-flow { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 0; }
.xp-stage {
  display: flex; flex-direction: column; min-height: 0; flex: 0 0 auto;
  border-radius: 16px; border: 1px solid var(--xp-line); background: #fbf7f0; overflow: hidden;
  transition: flex-grow .42s cubic-bezier(.2, .9, .25, 1), flex-basis .42s cubic-bezier(.2, .9, .25, 1), background .3s, border-color .3s, box-shadow .3s;
}
.xp-stage[data-open="true"] { flex-basis: 0; flex-grow: 1; background: #fffdfa; border-color: #e3d8c6; box-shadow: 0 20px 46px -38px rgba(90, 70, 40, .9); }
.xp-stage-head { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto; align-items: center; gap: 10px; width: 100%; padding: 12px 14px; border: 0; background: transparent; cursor: pointer; text-align: left; flex: 0 0 auto; }
.xp-stage-num { width: 26px; height: 26px; border-radius: 50%; border: 1.3px solid #e2d7c5; display: grid; place-items: center; font-size: 10.5px; color: var(--xp-ink-3); font-variant-numeric: tabular-nums; flex: 0 0 auto; transition: background .3s, border-color .3s, color .3s; }
.xp-stage[data-open="true"] .xp-stage-num { border-color: #eccba6; background: var(--xp-accent-soft); color: #a5622a; }
.xp-stage-name { font-size: 14px; font-weight: 630; }
.xp-stage-meta { font-size: 11px; color: var(--xp-ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right; }
.xp-stage-chevron { font-size: 14px; color: var(--xp-ink-3); width: 18px; text-align: center; flex: 0 0 auto; }
.xp-stage-preview { padding: 0 14px 12px 50px; font-size: 12px; color: var(--xp-ink-2); line-height: 1.5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 0 auto; }
.xp-stage-body { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 14px 14px; animation: xp-fold .3s ease both; }
.xp-flow-link { display: grid; place-items: center; height: 22px; color: #c2b6a3; font-size: 11px; flex: 0 0 auto; }

/* 节点 */
.xp-nodes { display: flex; flex-direction: column; gap: 8px; }
.xp-node { border: 1px solid #efe6d7; border-radius: 13px; background: #fbf7f0; padding: 9px 11px; }
.xp-node-lead { background: #fdf8ef; border-color: #f0dfc3; }
.xp-node-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.xp-node-label { font-size: 10px; letter-spacing: .1em; color: var(--xp-ink-3); }
.xp-node-actions { display: flex; gap: 3px; }
.xp-node-title, .xp-node-text, .xp-node-evidence { font-size: 13px; line-height: 1.62; color: var(--xp-ink); border-radius: 6px; cursor: text; }
.xp-node-title { font-size: 14px; font-weight: 550; }
.xp-node-evidence { font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace; font-size: 11.5px; color: var(--xp-ink-2); }
.xp-inline { white-space: pre-wrap; word-break: break-word; }
.xp-inline:hover { background: rgba(255, 255, 255, .7); outline: 1px dashed #e4d9c5; outline-offset: 2px; border-radius: 6px; }
.xp-inline-empty { color: #b6ab9a; font-style: italic; }
.xp-field { display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 8px; align-items: start; margin-top: 4px; }
.xp-field-label { font-size: 10.5px; color: var(--xp-ink-3); padding-top: 2px; }
.xp-input { width: 100%; border: 1px solid #e6dccb; border-radius: 8px; background: #fffdf9; color: var(--xp-ink); font-size: 13px; line-height: 1.6; padding: 5px 8px; outline: 0; resize: vertical; }
.xp-input:focus { border-color: #e0c49e; box-shadow: 0 0 0 3px rgba(221, 138, 61, .1); }
.xp-mini { width: 20px; height: 20px; border-radius: 6px; border: 1px solid #e8dfd0; background: #fffdf9; color: var(--xp-ink-3); font-size: 11px; display: grid; place-items: center; cursor: pointer; padding: 0; transition: color .15s, border-color .15s; }
.xp-mini:hover { color: var(--xp-ink); border-color: #dccdb6; }
.xp-mini[data-danger="true"]:hover { color: #b45b4a; border-color: #e8c7bd; background: #fdf4f1; }
.xp-mini:disabled { opacity: .4; cursor: default; }
.xp-rail-sep { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 6px 2px 0; }
.xp-rail-sep-title { font-size: 10.5px; letter-spacing: .08em; color: var(--xp-ink-3); }
.xp-rail-sep-title em { font-style: normal; color: #bdb2a1; }
.xp-add { border: 0; background: transparent; color: var(--xp-accent); font-size: 11.5px; cursor: pointer; padding: 2px 4px; border-radius: 6px; }
.xp-add:hover { background: #f7eee2; }
.xp-rail-empty { font-size: 11.5px; color: #b0a696; padding: 6px 4px; }
.xp-detail-note { font-size: 11.5px; color: var(--xp-ink-3); background: #f6f1e8; border-radius: 10px; padding: 7px 10px; line-height: 1.6; }

/* 想法详情 */
.xp-idea-head { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }
.xp-idea-badge { width: 26px; height: 26px; border-radius: 50%; border: 1.3px solid #e6d9c4; background: var(--xp-accent-soft); color: #a5622a; display: grid; place-items: center; font-size: 11px; font-variant-numeric: tabular-nums; flex: 0 0 auto; }
.xp-idea-meta { display: flex; align-items: center; gap: 10px; font-size: 11.5px; color: var(--xp-ink-3); flex: 0 0 auto; }
.xp-editor { flex: 1; min-height: 160px; width: 100%; border: 0; outline: 0; resize: none; background: transparent; color: var(--xp-ink); font-size: 14px; line-height: 1.8; padding: 4px; }
.xp-editor::placeholder { color: #b6ab9a; }
.xp-idea-tools { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; padding-top: 10px; border-top: 1px dashed #ece2d2; flex: 0 0 auto; }

/* 记事本 */
.xp-book-grid { flex: 1; min-height: 0; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 12px; padding: 2px 6px 6px 2px; align-content: start; }
.xp-book-card {
  display: flex; flex-direction: column; gap: 5px; aspect-ratio: 1 / 1; padding: 12px 13px;
  border-radius: 16px; border: 1px solid rgba(90, 70, 40, .07); text-align: left; cursor: pointer; overflow: hidden;
  box-shadow: 0 1px 2px rgba(90, 70, 40, .05);
  transition: transform .24s cubic-bezier(.2, .9, .25, 1), box-shadow .24s;
  animation: xp-rise .4s cubic-bezier(.2, .9, .25, 1) both; animation-delay: calc(var(--i, 0) * 22ms);
}
.xp-book-card:hover { transform: translateY(-2px) scale(1.012); box-shadow: 0 18px 34px -24px rgba(90, 70, 40, .65); }
.xp-book-date { font-size: 10px; letter-spacing: .06em; color: rgba(52, 43, 30, .5); font-variant-numeric: tabular-nums; }
.xp-book-title { font-size: 13.5px; font-weight: 620; color: #312b24; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.xp-book-text { font-size: 11.5px; line-height: 1.5; color: rgba(52, 43, 30, .68); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; }
.xp-book-add {
  width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--xp-line); background: #fffdfa;
  display: grid; place-items: center; cursor: pointer; color: var(--xp-ink-2); font-size: 16px; padding: 0;
  transition: background .2s, color .2s, transform .2s;
}
.xp-book-add:hover { background: #fff; color: var(--xp-ink); transform: rotate(90deg); }

/* 弹出层 */
.xp-overlay { position: absolute; inset: 0; z-index: 40; display: grid; place-items: center; padding: 18px; background: rgba(56, 46, 32, .26); backdrop-filter: blur(10px) saturate(1.05); animation: xp-fade .2s ease both; }
.xp-overlay[data-closing="true"] { animation: xp-fade-out .18s ease both; }
.xp-overlay-card {
  position: relative; display: flex; flex-direction: column; min-height: 0;
  width: min(860px, 100%); height: min(88%, 760px);
  border-radius: 24px; border: 1px solid #e9e0d2; background: #fdfbf6;
  box-shadow: 0 50px 100px -50px rgba(45, 35, 20, .6), inset 0 1px 0 rgba(255, 255, 255, .7);
  overflow: hidden;
  transform-origin: var(--ox, 50%) var(--oy, 50%);
  animation: xp-pop-in .46s cubic-bezier(.19, 1.02, .28, 1) both;
}
.xp-overlay[data-closing="true"] .xp-overlay-card { animation: xp-pop-out .18s ease both; }
.xp-overlay-head { display: flex; align-items: flex-start; gap: 12px; padding: 18px 20px 14px; border-bottom: 1px solid #efe7da; flex: 0 0 auto; }
.xp-overlay-title-wrap { min-width: 0; flex: 1; }
.xp-eyebrow { font-size: 10.5px; letter-spacing: .14em; color: var(--xp-ink-3); font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace; }
.xp-overlay-title { font-size: 19px; font-weight: 620; letter-spacing: -.01em; margin-top: 3px; }
.xp-overlay-sub { font-size: 11px; color: var(--xp-ink-3); margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.xp-overlay-head-actions { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }
.xp-icon-btn { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--xp-line); background: #fffdfa; display: grid; place-items: center; color: var(--xp-ink-2); cursor: pointer; padding: 0; transition: background .16s, color .16s; }
.xp-icon-btn:hover { background: #fff; color: var(--xp-ink); }
.xp-overlay-body { flex: 1; min-height: 0; padding: 16px 20px; display: flex; flex-direction: column; gap: 10px; }
.xp-overlay-foot { display: flex; align-items: center; gap: 10px; padding: 12px 20px; border-top: 1px solid #efe7da; background: #faf6ee; flex: 0 0 auto; min-width: 0; }
.xp-overlay-foot > .xp-hint { flex: 1; min-width: 0; }
.xp-overlay-foot-actions { margin-left: auto; display: flex; gap: 8px; flex: 0 0 auto; }
.xp-hint { font-size: 11px; color: var(--xp-ink-3); line-height: 1.6; }
.xp-doc-editor { flex: 1; min-height: 0; width: 100%; border: 1px solid #eae0d0; border-radius: 14px; background: #fffdf9; color: var(--xp-ink); font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace; font-size: 12.5px; line-height: 1.8; padding: 14px 16px; outline: 0; resize: none; }
.xp-doc-editor:focus { border-color: #e0c49e; box-shadow: 0 0 0 4px rgba(221, 138, 61, .08); }

/* 工作区 AGENTS.md：顶部标签栏 */
.xp-ws-tabs { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 20px 0; flex: 0 0 auto; }
.xp-ws-tab {
  display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 11px;
  border-radius: 999px; border: 1px solid #e5dccd; background: #f7f2e8; color: var(--xp-ink-2);
  font-size: 11.5px; cursor: pointer; transition: background .16s, border-color .16s, color .16s;
  max-width: 240px;
}
.xp-ws-tab:hover { background: #f0e8da; }
.xp-ws-tab:disabled { opacity: .65; cursor: default; }
.xp-ws-tab[data-active="true"] { background: var(--xp-ink); border-color: var(--xp-ink); color: #fdfaf4; }
.xp-ws-tab-title { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.xp-ws-badge {
  flex: 0 0 auto; font-size: 10px; line-height: 1; padding: 2px 6px; border-radius: 999px;
  background: var(--xp-accent-soft); border: 1px solid #eccba6; color: #a5622a;
}
.xp-ws-tab[data-active="true"] .xp-ws-badge { background: rgba(255, 255, 255, .14); border-color: rgba(255, 255, 255, .3); color: #fbf6ea; }

.xp-note-card { width: min(620px, 100%); height: min(80%, 600px); }
.xp-note-body { gap: 8px; }
.xp-note-title-input { font-size: 14px; }
.xp-note-textarea { flex: 1; min-height: 0; width: 100%; border: 1px solid #eae0d0; border-radius: 14px; background: #fffdf9; color: var(--xp-ink); font-size: 14px; line-height: 1.75; padding: 12px 14px; outline: 0; resize: none; }
.xp-note-textarea:focus { border-color: #e0c49e; box-shadow: 0 0 0 4px rgba(221, 138, 61, .08); }
.xp-swatches { gap: 6px; }
.xp-swatch { width: 18px; height: 18px; border-radius: 50%; border: 1px solid rgba(90, 70, 40, .14); cursor: pointer; padding: 0; transition: box-shadow .16s; }
.xp-swatch[data-active="true"] { box-shadow: 0 0 0 2px #fdfbf6, 0 0 0 3.5px var(--xp-accent); }
.xp-date-row { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--xp-ink-3); flex: 0 0 auto; }
.xp-date-input { width: auto; }

.xp-info-card { width: min(470px, 100%); height: auto; max-height: 82%; }
.xp-info-body { gap: 0; padding: 6px 20px 16px; overflow-y: auto; }
.xp-info-row { display: flex; gap: 14px; padding: 10px 0; border-bottom: 1px dashed #eee5d6; font-size: 12.5px; }
.xp-info-row:last-child { border-bottom: 0; }
.xp-info-key { width: 76px; flex: 0 0 auto; color: var(--xp-ink-3); font-size: 11.5px; padding-top: 1px; }
.xp-info-val { min-width: 0; color: var(--xp-ink); word-break: break-all; line-height: 1.6; }
.xp-info-val code { font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace; font-size: 11.5px; background: #f2ebde; border-radius: 5px; padding: 1px 5px; }

.xp-confirm {
  position: absolute; left: 20px; right: 20px; bottom: 76px; z-index: 2;
  display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px;
  background: #3d362c; color: #fbf7ef; box-shadow: 0 22px 50px -24px rgba(30, 24, 15, .8);
  animation: xp-rise .25s ease both;
}
.xp-confirm-text { font-size: 12.5px; }
.xp-confirm-actions { margin-left: auto; display: flex; gap: 8px; }
.xp-confirm-actions button { border: 1px solid rgba(255, 255, 255, .24); background: transparent; color: #fbf7ef; font-size: 12px; padding: 4px 11px; border-radius: 8px; cursor: pointer; }
.xp-confirm-actions button:hover { background: rgba(255, 255, 255, .1); }

/* 页面转场：点卡片 → 页面内容从卡片位置直接放大到全屏，
       其余卡片被「挤开」；关闭时页面淡出、同色系表面按同样轨迹飞回，
       兄弟卡片再挤回来。所有飞行动画只动 transform/opacity（合成器处理） */
.xp-zoom-home { pointer-events: none; }
.xp-zoom-home .xp-home-head, .xp-zoom-home .xp-home-foot { animation: xp-zoom-fade .36s ease both; }
.xp-returning { pointer-events: auto; }
.xp-returning .xp-home-head, .xp-returning .xp-home-foot { animation: xp-zoom-fade-in .14s ease .3s both; }
.xp-pushing .xp-tile { animation: xp-push .4s cubic-bezier(.32, .75, .32, 1) both; }
.xp-pushing .xp-tile[data-source] { animation: xp-source-out .22s ease .04s both; }
.xp-returning .xp-tile { animation: xp-unpush .14s cubic-bezier(.2, .9, .25, 1) .3s both; }
.xp-returning .xp-tile[data-source] { animation: xp-source-in .1s ease .36s both; opacity: 0; }
.xp-page-zoom { transform-origin: 0 0; animation: xp-page-grow .46s cubic-bezier(.18, .82, .26, 1) both; will-change: opacity, transform; }
.xp-page-out { animation: xp-page-out .24s cubic-bezier(.55, .08, .78, .4) both; pointer-events: none; will-change: opacity; }
.xp-zoom-clone {
  position: absolute; inset: 0; overflow: hidden; pointer-events: none;
  transform-origin: 0 0; will-change: opacity, transform;
}
.xp-zoom-clone[data-mode="close"] { opacity: 0; animation: xp-zoom-out .46s cubic-bezier(.18, .82, .26, 1) both; }
/* 飞行表面（仅返回用）：与卡片同色系的暖白渐变填充，
       带同款圆角 22px、细边框和阴影；打开时则直接飞页面本身（xp-page-zoom） */
.xp-zoom-inner {
  position: absolute; inset: 0; border-radius: 22px;
  background: linear-gradient(180deg, #fffefc 0%, #faf6ef 100%);
  border: 1px solid var(--xp-line);
  box-shadow: 0 18px 40px -30px rgba(90, 70, 40, .5);
}
@keyframes xp-zoom-out {
  0% { opacity: 0; transform: translate(0, 0) scale(1, 1); }
  24% { opacity: .62; }
  60% { opacity: 1; }
  86% { opacity: 1; }
  100% { opacity: 0; transform: translate(var(--tx, 0), var(--ty, 0)) scale(var(--tsx, 1), var(--tsy, 1)); }
}
@keyframes xp-push {
  from { opacity: 1; transform: none; }
  to { opacity: 0; transform: translate(var(--px, 0), var(--py, 0)) scale(.88); }
}
@keyframes xp-unpush {
  from { opacity: 0; transform: translate(var(--px, 0), var(--py, 0)) scale(.88); }
  to { opacity: 1; transform: none; }
}
@keyframes xp-source-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes xp-source-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes xp-zoom-fade { from { opacity: 1; } to { opacity: 0; } }
@keyframes xp-zoom-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes xp-page-grow {
  0% { opacity: .6; transform: translate(var(--fx, 0), var(--fy, 0)) scale(var(--fsx, 1), var(--fsy, 1)); }
  35% { opacity: 1; }
  100% { opacity: 1; transform: translate(0, 0) scale(1, 1); }
}
@keyframes xp-page-out {
  0% { opacity: 1; }
  100% { opacity: 0; }
}

/* 动画 */
@keyframes xp-pop-in {
  0% { opacity: 0; transform: scale(.82) translateY(14px); }
  60% { opacity: 1; }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes xp-pop-out {
  0% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(.92) translateY(8px); }
}
@keyframes xp-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes xp-fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes xp-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes xp-fold { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }

/* 滚动条 */
.xp-root ::-webkit-scrollbar { width: 9px; height: 9px; }
.xp-root ::-webkit-scrollbar-thumb { background: rgba(120, 100, 70, .16); border-radius: 99px; border: 2px solid transparent; background-clip: content-box; }
.xp-root ::-webkit-scrollbar-thumb:hover { background: rgba(120, 100, 70, .3); background-clip: content-box; }
.xp-root ::-webkit-scrollbar-track { background: transparent; }

@media (max-width: 940px) {
  .xp-split { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
  .xp-rail { flex-direction: row; overflow-x: auto; overflow-y: hidden; }
  .xp-rail-item { flex: 0 0 auto; max-width: 150px; }
}
@media (max-width: 860px) {
  .xp-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(112px, auto)) minmax(0, 1.3fr) minmax(0, 1fr); }
  .xp-tile-ideas { grid-column: 1; grid-row: 1; }
  .xp-tile-guide { grid-column: 2; grid-row: 1; }
  .xp-grid-pair { grid-column: 1 / 3; grid-row: 2; width: auto; }
  .xp-grid-pair .xp-tile { flex: 1 1 0; width: auto; height: auto; }
  .xp-tile-skills { grid-column: 1 / 3; grid-row: 3; }
  .xp-tile-book { grid-column: 1 / 3; grid-row: 4; }
  .xp-tile-skills, .xp-tile-book { justify-self: stretch; width: auto; }
  .xp-book-grid { grid-template-columns: repeat(auto-fill, minmax(122px, 1fr)); }
}
@media (prefers-reduced-motion: reduce) {
  .xp-root *, .xp-root *::before, .xp-root *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
`
    const existingStyle = document.getElementById('xp-style')
    if (existingStyle) {
      existingStyle.textContent = CSS
    } else {
      const style = document.createElement('style')
      style.id = 'xp-style'
      style.textContent = CSS
      document.head.appendChild(style)
    }

    /* ------------------------------------------------------------------ */
    /* 注册                                                                */
    /* ------------------------------------------------------------------ */

    function SidebarIcon(props) {
      return h(LayersIcon, { size: (props && props.size) || 20 })
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: 'experience',
              order: 6,
              label: '全局经验',
            },
            SidebarIcon,
          ),
        )
        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: 'experience',
            },
            Panel,
          ),
        )
      },
      __test: {
        Panel,
        Home,
        SkillsPage,
        SkillDetailPage,
        IdeasPage,
        IdeaDetailPage,
        BookPage,
        GuideOverlay,
        AgentsOverlay,
        WorkspaceAgentsOverlay,
        InfoOverlay,
        NoteEditor,
        SkillFlow,
        GoalDetail,
        PlanDetail,
        ExecutionDetail,
      },
    }
  },
})