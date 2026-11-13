/**
 * dsh-experience —— Host 半
 * ============================================================================
 * 一个面板，四块内容：
 *   经验 Skills / 想法 / 记事本 / 全局 Agents
 *
 * 数据目录默认 <DSH_HOME>/experience（可用 DSH_EXPERIENCE_DIR 覆盖）：
 *   skills/<id>.json   一条经验一个文件
 *   ideas/<id>.json    一条想法一个文件
 *   notes.json         记事本
 *   AGENTSKILL.md      写技能的规矩
 *
 * 「全局 Agents」仍然只服务 $DSH_HOME/AGENTS.md 一份文件，接口不接受路径参数。
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, win32 } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createStore } from './lib/store.js'
import { registerExperienceTools } from './lib/tools.js'

export const name = 'dsh-experience'
export const inject = ['webServer', 'tools', 'systemPrompt']

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const AGENTS_FILE = join(DSH_HOME, 'AGENTS.md')
const ICON_FILE = fileURLToPath(new URL('./icon.svg', import.meta.url))
const DEFAULT_GUIDE_FILE = fileURLToPath(new URL('./AGENTSKILL.default.md', import.meta.url))

const DEFAULT_DATA_DIR = join(DSH_HOME, 'experience')
const DATA_DIR = process.env.DSH_EXPERIENCE_DIR || DEFAULT_DATA_DIR

const MAX_CHARS = 500_000
const MAX_BODY = 8 * 1024 * 1024

const store = createStore(DATA_DIR, DEFAULT_GUIDE_FILE)
let storeState = { dir: DATA_DIR, ready: false, error: '' }

function prepareStore() {
  try {
    const state = store.ensure()
    storeState = { dir: state.dir, ready: true, error: '' }
  } catch (error) {
    storeState = {
      dir: DATA_DIR,
      ready: false,
      error: error && error.message ? error.message : String(error),
    }
  }
  return storeState
}

/* ------------------------------------------------------------------ */
/* 全局 AGENTS.md                                                      */
/* ------------------------------------------------------------------ */

function readDoc(file = AGENTS_FILE) {
  if (!existsSync(file)) {
    return { exists: false, path: file, content: '', mtimeMs: 0, size: 0, eol: '\n' }
  }
  const buffer = readFileSync(file)
  let text = buffer.toString('utf8')
  if (text.length && text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  return {
    exists: true,
    path: file,
    content: text,
    mtimeMs: statSync(file).mtimeMs,
    size: buffer.length,
    eol,
  }
}

function toFileEol(content, eol) {
  const text = String(content == null ? '' : content)
  if (text.length > MAX_CHARS) {
    const error = new Error('内容太长了（上限 ' + MAX_CHARS + ' 字符）')
    error.code = 'TOO_LARGE'
    throw error
  }
  if (eol !== '\r\n') return text.replace(/\r\n/g, '\n')
  return text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
}

function saveDoc(input, file = AGENTS_FILE) {
  const current = readDoc(file)
  const force = Boolean(input && input.force)
  const baseMtimeMs = input && Number(input.baseMtimeMs)

  if (!force && current.exists && Number.isFinite(baseMtimeMs) && baseMtimeMs > 0) {
    if (Math.abs(current.mtimeMs - baseMtimeMs) > 1) {
      const error = new Error('文件在磁盘上已被修改')
      error.code = 'CONFLICT'
      error.current = { mtimeMs: current.mtimeMs, size: current.size }
      throw error
    }
  }

  const text = toFileEol(input && input.content, current.eol)
  if (current.exists) copyFileSync(file, file + '.bak')
  const temp = file + '.tmp'
  writeFileSync(temp, text, 'utf8')
  renameSync(temp, file)
  return readDoc(file)
}

/* ------------------------------------------------------------------ */
/* 工作区 AGENTS.md —— 每个工作区目录下自己的 AGENTS.md                */
/* ------------------------------------------------------------------ */

// 两个路径是否指向同一处：统一按 Windows 语义规范化（\ 与 / 互认、去掉末尾分隔符），
// 比较时忽略大小写，专门服务「某个工作区是不是当前工作区」的判断。
function samePath(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const norm = (value) => win32.normalize(String(value)).replace(/[\\/]+$/, '').toLowerCase()
  return norm(a) === norm(b)
}

// 在列表里按 id 找工作区；找不到返回 null。
// 文件路径一律取自列表里的 path（join(path, 'AGENTS.md')），绝不接受客户端传来的路径。
function findWorkspace(list, id) {
  const key = String(id == null ? '' : id)
  if (!key) return null
  return (list || []).find((ws) => ws && String(ws.id) === key) || null
}

// 收集所有工作区。registry / workingDirectory 都是运行时服务，可能不存在，
// 全部用 try/catch 兜住；连默认目录都拿不到时返回空列表，接口照常 200。
function collectWorkspaces(ctx) {
  let defaultPath = ''
  try {
    const wd = ctx.get('workingDirectory')
    if (wd && typeof wd.defaultDirectory === 'string') defaultPath = wd.defaultDirectory
  } catch {
    // workingDirectory 服务不存在
  }

  const entries = []
  try {
    const registry = ctx.get('workspaceRegistry')
    if (registry && typeof registry.list === 'function') {
      for (const ws of registry.list() || []) {
        if (!ws || typeof ws.path !== 'string' || !ws.path) continue
        entries.push({
          id: String(ws.id == null ? '' : ws.id),
          title: String(ws.title || ws.path),
          path: ws.path,
          createdAt: String(ws.createdAt || ''),
          current: false,
        })
      }
    }
  } catch {
    // workspaceRegistry 服务不存在或 list 抛错
  }

  // registry 不可用或为空时，至少返回默认目录一条
  if (!entries.length && defaultPath) {
    entries.push({ id: 'default', title: '默认工作区', path: defaultPath, current: true })
  }

  // 认定「默认工作区」：路径与默认目录一致优先，其次目录名就叫 default-workspace，
  // 再不行取创建时间最早的那个（DSH 首次启动时初始化的就是默认工作区）。
  // 注意 workingDirectory.defaultDirectory 在桌面端是 profile 目录、不是工作区，
  // 所以不能只靠它判断。
  const isDefaultWorkspace = (ws) =>
    samePath(ws.path, defaultPath) || win32.basename(ws.path).toLowerCase() === 'default-workspace'
  let currentEntry = entries.find(isDefaultWorkspace)
  if (!currentEntry) {
    currentEntry = entries.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0]
  }
  if (currentEntry) {
    currentEntry.current = true
    // 默认工作区排第一，其余保持注册顺序
    entries.sort((a, b) => (a === currentEntry ? -1 : b === currentEntry ? 1 : 0))
  }

  // 只 existsSync + statSync 不读全文；目录没了也只标 exists:false，不会让接口 500
  for (const ws of entries) {
    const file = join(ws.path, 'AGENTS.md')
    if (!existsSync(file)) {
      ws.exists = false
      ws.size = 0
      ws.mtimeMs = 0
      continue
    }
    try {
      const stat = statSync(file)
      ws.exists = stat.isFile()
      ws.size = stat.size
      ws.mtimeMs = stat.mtimeMs
    } catch {
      ws.exists = false
      ws.size = 0
      ws.mtimeMs = 0
    }
  }
  return { defaultPath, workspaces: entries }
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

function sendError(res, status, error) {
  const message = error && error.message ? error.message : String(error || '未知错误')
  const code = error && error.code ? String(error.code) : 'EXPERIENCE_ERROR'
  const payload = { ok: false, error: { code, message } }
  if (error && error.current) payload.current = error.current
  sendJson(res, status, payload)
}

function sendOk(res, payload) {
  sendJson(res, 200, Object.assign({ ok: true }, payload || {}))
}

function handleStoreError(res, error) {
  if (error && error.code === 'CONFLICT') return sendError(res, 409, error)
  if (error && error.code === 'NOT_FOUND') return sendError(res, 404, error)
  if (error && error.code === 'BAD_ID') return sendError(res, 400, error)
  return sendError(res, 400, error)
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (!text) return {}
  return JSON.parse(text)
}

export function apply(ctx) {
  prepareStore()

  const disposeTools = registerExperienceTools(ctx, store)
  ctx.effect(() => disposeTools)

  const disposePrompt = ctx.systemPrompt.section({
    name: 'global-experience',
    order: 880,
    text:
      '「全局经验」：侧边栏有经验面板，数据在 ' +
      DATA_DIR +
      '。**收到新指令、动手之前先 experience_list 扫一遍标题**（纯提问不用，除非用户问「我们有哪些经验」）：' +
      '标题里没有相关内容就直接执行；有相关标题就先 experience_read 读完那一条再执行，按里面记的坑和做法走，别从零试错。' +
      '完成一项用户交代的任务后，先 experience_list 查重：同一件事已有旧条目就用 experience_update 追加，不要另开新条；确实没有才用 experience_record 记一条。写之前先 experience_guide 读规矩。' +
      '用户说「看想法 / 按想法做」时，用 experience_list({ kind: "idea" }) 找到并 experience_read 读正文。' +
      '想法有三态：未完成 / 进行中 / 已完成；用户点「复制给 agent」会把它标成进行中。你做完并且**用户验收之后**，用 experience_record 记经验、' +
      'sourceIdeaId 填这条想法的 id，它会自动变成「已完成」；没验收就先别记，更不要把它当已完成。',
  })
  ctx.effect(() => disposePrompt)

  const handler = async (req, res) => {
    let url
    try {
      url = new URL(req.url || '/', 'http://127.0.0.1')
    } catch {
      return sendError(res, 400, new Error('请求地址无效'))
    }

    if (req.method === 'GET' && url.pathname === '/dsh-experience/icon.svg') {
      try {
        const buffer = readFileSync(ICON_FILE)
        res.statusCode = 200
        res.setHeader('content-type', 'image/svg+xml')
        res.setHeader('cache-control', 'no-cache')
        res.end(buffer)
      } catch {
        sendError(res, 404, new Error('图标文件不存在'))
      }
      return
    }

    if (String(req.headers['x-dsh-experience'] || '') !== '1') {
      return sendError(res, 403, new Error('缺少全局经验的请求标记'))
    }

    try {
      if (req.method === 'GET' && url.pathname === '/dsh-experience/ping') {
        return sendOk(res, {
          dir: storeState.dir,
          ready: storeState.ready,
          error: storeState.error,
          stats: storeState.ready ? store.stats() : null,
        })
      }

      if (req.method === 'GET' && url.pathname === '/dsh-experience/state') {
        const notes = store.readNotes()
        const guide = store.readGuide()
        return sendOk(res, {
          dir: store.dir,
          ready: storeState.ready,
          error: storeState.error,
          skills: store.listSkills(),
          ideas: store.listIdeas(),
          notes: notes.items,
          notesMtimeMs: notes.mtimeMs,
          guide: {
            exists: guide.exists,
            mtimeMs: guide.mtimeMs,
            chars: guide.content.length,
            preview: guide.content.slice(0, 240),
            path: guide.path,
          },
        })
      }

      /* ---------------- 经验 ---------------- */

      if (req.method === 'GET' && url.pathname === '/dsh-experience/skill') {
        const id = String(url.searchParams.get('id') || '')
        return sendOk(res, { record: store.getSkill(id) })
      }

      if (req.method === 'POST' && url.pathname === '/dsh-experience/skill/create') {
        const body = await readJsonBody(req)
        const record = store.createSkill(body, {
          sessionId: body && body.sessionId,
          workspace: body && body.workspace,
        })
        return sendOk(res, { record })
      }

      if (req.method === 'POST' && url.pathname === '/dsh-experience/skill/update') {
        const body = await readJsonBody(req)
        const record = store.updateSkill(body.id, body.patch || {}, body.baseUpdatedAt)
        return sendOk(res, { record })
      }

      if (req.method === 'POST' && url.pathname === '/dsh-experience/skill/delete') {
        const body = await readJsonBody(req)
        return sendOk(res, store.deleteSkill(body.id))
      }

      /* ---------------- 想法 ---------------- */

      if (req.method === 'GET' && url.pathname === '/dsh-experience/idea') {
        const id = String(url.searchParams.get('id') || '')
        return sendOk(res, { record: store.getIdea(id) })
      }

      if (req.method === 'POST' && url.pathname === '/dsh-experience/idea/create') {
        const body = await readJsonBody(req)
        return sendOk(res, { record: store.createIdea(body) })
      }

      if (req.method === 'POST' && url.pathname === '/dsh-experience/idea/update') {
        const body = await readJsonBody(req)
        const current = store.getIdea(body.id)
        if (body.baseUpdatedAt && String(body.baseUpdatedAt) !== String(current.updatedAt)) {
          const error = new Error('这条想法在别处改过了，先重新载入')
          error.code = 'CONFLICT'
          error.current = { id: current.id, updatedAt: current.updatedAt }
          throw error
        }
        return sendOk(res, {
          record: store.updateIdea(
            body.id,
            (() => {
              const patch = body.patch && typeof body.patch === 'object' ? Object.assign({}, body.patch) : Object.assign({}, body)
              delete patch.id
              delete patch.baseUpdatedAt
              return patch
            })(),
          ),
        })
      }

      if (req.method === 'POST' && url.pathname === '/dsh-experience/idea/delete') {
        const body = await readJsonBody(req)
        return sendOk(res, store.deleteIdea(body.id))
      }

      if (req.method === 'POST' && url.pathname === '/dsh-experience/idea/convert') {
        const body = await readJsonBody(req)
        return sendOk(res, store.convertIdea(body.id, body.patch || {}))
      }

      /* ---------------- 记事本 ---------------- */

      if (req.method === 'GET' && url.pathname === '/dsh-experience/notes') {
        return sendOk(res, store.readNotes())
      }

      if (req.method === 'POST' && url.pathname === '/dsh-experience/notes/save') {
        const body = await readJsonBody(req)
        return sendOk(res, store.saveNotes(body.items, body.baseMtimeMs, body.force))
      }

      /* ---------------- 规矩 ---------------- */

      if (req.method === 'GET' && url.pathname === '/dsh-experience/guide') {
        return sendOk(res, store.readGuide())
      }

      if (req.method === 'POST' && url.pathname === '/dsh-experience/guide/save') {
        const body = await readJsonBody(req)
        return sendOk(res, store.saveGuide(body))
      }

      /* ---------------- 全局 AGENTS ---------------- */

      if (req.method === 'GET' && url.pathname === '/dsh-experience/agents') {
        return sendOk(res, { doc: readDoc() })
      }

      if (req.method === 'POST' && url.pathname === '/dsh-experience/agents/save') {
        const body = await readJsonBody(req)
        const doc = saveDoc({ content: body.content, baseMtimeMs: body.baseMtimeMs, force: body.force })
        return sendOk(res, { doc })
      }

      /* ---------------- 工作区 AGENTS ---------------- */

      if (req.method === 'GET' && url.pathname === '/dsh-experience/workspaces') {
        return sendOk(res, collectWorkspaces(ctx))
      }

      if (req.method === 'GET' && url.pathname === '/dsh-experience/workspace-agents') {
        const ws = findWorkspace(collectWorkspaces(ctx).workspaces, url.searchParams.get('id'))
        if (!ws) {
          const error = new Error('找不到这个工作区')
          error.code = 'NOT_FOUND'
          return sendError(res, 404, error)
        }
        return sendOk(res, {
          workspace: { id: ws.id, title: ws.title, path: ws.path, current: ws.current },
          doc: readDoc(join(ws.path, 'AGENTS.md')),
        })
      }

      if (req.method === 'POST' && url.pathname === '/dsh-experience/workspace-agents/save') {
        const body = await readJsonBody(req)
        const ws = findWorkspace(collectWorkspaces(ctx).workspaces, body && body.id)
        if (!ws) {
          const error = new Error('找不到这个工作区')
          error.code = 'NOT_FOUND'
          return sendError(res, 404, error)
        }
        const doc = saveDoc(
          { content: body.content, baseMtimeMs: body.baseMtimeMs, force: body.force },
          join(ws.path, 'AGENTS.md'),
        )
        return sendOk(res, {
          workspace: { id: ws.id, title: ws.title, path: ws.path, current: ws.current },
          doc,
        })
      }

      return sendError(res, 404, new Error('没有这个接口：' + url.pathname))
    } catch (error) {
      return handleStoreError(res, error)
    }
  }

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'prefix',
      path: '/dsh-experience',
      handler,
    }),
  )
}

// 供本地自测使用（不属于插件对外接口）
export const __test = {
  readDoc,
  toFileEol,
  saveDoc,
  prepareStore,
  samePath,
  findWorkspace,
  getStoreState: () => storeState,
  store,
}