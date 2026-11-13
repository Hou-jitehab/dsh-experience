/**
 * 经验数据的文件层。
 *
 * 目录结构：
 *   skills/<id>.json   一条经验一个文件
 *   ideas/<id>.json    一条想法一个文件
 *   notes.json         记事本（整个数组）
 *   AGENTSKILL.md      写作规矩
 *   index.md           自动生成的索引（给人/agent 直接看）
 *   .trash/            删除的记录（不真删）
 *
 * 所有写入都是「临时文件 + rename」，写前把旧文件复制成 .bak。
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

export class StoreError extends Error {
  constructor(code, message, extra) {
    super(message)
    this.name = 'StoreError'
    this.code = code
    if (extra) Object.assign(this, extra)
  }
}

const SKILL_STATUS = new Set(['active', 'done'])
const IDEA_STATUS = new Set(['draft', 'doing', 'done'])

/* 老数据兼容：ready 当进行中、converted 当已完成。读出来时映射，不回写磁盘 */
function mapIdeaStatus(status) {
  if (status === 'ready') return 'doing'
  if (status === 'converted') return 'done'
  return status
}
const MAX = {
  title: 120,
  goal: 20000,
  question: 4000,
  reason: 4000,
  step: 4000,
  action: 2000,
  evidence: 2000,
  body: 50000,
  tag: 24,
}

function fail(code, message, extra) {
  throw new StoreError(code, message, extra)
}

function nowIso() {
  return new Date().toISOString()
}

function localStamp(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return String(iso || '').slice(0, 16).replace('T', ' ')
  return date.toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function pad(value, width) {
  return String(value).padStart(width || 2, '0')
}

function makeId() {
  const d = new Date()
  const stamp =
    String(d.getFullYear()) +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '-' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  const rand = Math.random().toString(36).slice(2, 6)
  return stamp + '-' + rand
}

function dayKey(date) {
  const d = date instanceof Date ? date : new Date()
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function text(value, max, field, required) {
  const result = String(value == null ? '' : value).trim()
  if (required && !result) fail('FIELD_REQUIRED', (field || '字段') + '不能为空')
  if (result.length > max) fail('FIELD_TOO_LONG', (field || '字段') + '太长了（上限 ' + max + ' 字）')
  return result
}

function safeId(id) {
  const value = String(id == null ? '' : id).trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,80}$/.test(value)) {
    fail('BAD_ID', '记录 id 不合法：' + value)
  }
  return value
}

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  if (existsSync(file)) copyFileSync(file, file + '.bak')
  const temp = file + '.tmp'
  writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', 'utf8')
  renameSync(temp, file)
}

function writeText(file, value) {
  if (existsSync(file)) copyFileSync(file, file + '.bak')
  const temp = file + '.tmp'
  writeFileSync(temp, String(value == null ? '' : value), 'utf8')
  renameSync(temp, file)
}

function listJson(dir) {
  try {
    return readdirSync(dir).filter((name) => name.endsWith('.json') && !name.endsWith('.bak'))
  } catch {
    return []
  }
}

function tagList(value) {
  const list = Array.isArray(value) ? value : []
  const seen = new Set()
  const result = []
  for (const item of list) {
    const tag = String(item == null ? '' : item).trim()
    if (!tag) continue
    if (tag.length > MAX.tag) fail('TAG_TOO_LONG', '标签太长了（上限 ' + MAX.tag + ' 字）：' + tag)
    if (seen.has(tag)) continue
    seen.add(tag)
    result.push(tag)
    if (result.length >= 12) break
  }
  return result
}

function questionList(value) {
  const list = Array.isArray(value) ? value : []
  const result = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const question = text(item.question, MAX.question, '提问')
    const answer = text(item.answer, MAX.question, '回答')
    if (!question && !answer) continue
    result.push({ question, answer })
    if (result.length >= 30) break
  }
  return result
}

function goalAdjustments(value) {
  const list = Array.isArray(value) ? value : []
  const result = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const reason = text(item.reason, MAX.reason, '调整原因')
    const from = text(item.from, MAX.reason, '原方案')
    const to = text(item.to, MAX.reason, '新方案')
    if (!reason && !from && !to) continue
    if (!reason) fail('ADJUST_REASON_REQUIRED', '每条策略调整都要写原因')
    result.push({ reason, from, to })
    if (result.length >= 20) break
  }
  return result
}

function planAdjustments(value) {
  const list = Array.isArray(value) ? value : []
  const result = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const reason = text(item.reason, MAX.reason, '计划调整原因')
    const change = text(item.change, MAX.reason, '计划调整内容')
    if (!reason && !change) continue
    if (!reason) fail('ADJUST_REASON_REQUIRED', '每条计划调整都要写原因')
    result.push({ reason, change })
    if (result.length >= 20) break
  }
  return result
}

function planSteps(value) {
  const list = Array.isArray(value) ? value : []
  const result = []
  for (const item of list) {
    const step = text(typeof item === 'string' ? item : item && item.text, MAX.step, '计划步骤')
    if (!step) continue
    result.push(step)
    if (result.length >= 50) break
  }
  return result
}

function executionSteps(value) {
  const list = Array.isArray(value) ? value : []
  const result = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const action = text(item.action, MAX.action, '执行动作')
    const outcome = text(item.result, MAX.step, '执行结果')
    const evidence = text(item.evidence, MAX.evidence, '执行证据')
    if (!action && !outcome && !evidence) continue
    if (!action) fail('STEP_ACTION_REQUIRED', '执行步骤必须写「做了什么」')
    result.push({ action, result: outcome, evidence })
    if (result.length >= 20) break
  }
  return result
}

function normalizeSkill(input, existing) {
  const source = input && typeof input === 'object' ? input : {}
  const base = existing && typeof existing === 'object' ? existing : {}
  const baseGoal = base.goal && typeof base.goal === 'object' ? base.goal : {}
  const basePlan = base.plan && typeof base.plan === 'object' ? base.plan : {}
  const baseExecution = base.execution && typeof base.execution === 'object' ? base.execution : {}
  const goalIn = source.goal && typeof source.goal === 'object' ? source.goal : {}
  const planIn = source.plan && typeof source.plan === 'object' ? source.plan : {}
  const executionIn = source.execution && typeof source.execution === 'object' ? source.execution : {}

  const title =
    source.title !== undefined ? text(source.title, MAX.title, '标题', true) : String(base.title || '')
  if (!title) fail('TITLE_REQUIRED', '标题不能为空')

  let status = source.status !== undefined ? String(source.status) : base.status || 'done'
  if (!SKILL_STATUS.has(status)) fail('BAD_STATUS', '状态只能是 active 或 done')

  const goalText =
    goalIn.text !== undefined ? text(goalIn.text, MAX.goal, '目标') : String(baseGoal.text || '')
  const questions =
    goalIn.questions !== undefined ? questionList(goalIn.questions) : Array.isArray(baseGoal.questions) ? baseGoal.questions : []
  const adjustments =
    goalIn.adjustments !== undefined
      ? goalAdjustments(goalIn.adjustments)
      : Array.isArray(baseGoal.adjustments)
        ? baseGoal.adjustments
        : []
  const steps =
    planIn.steps !== undefined ? planSteps(planIn.steps) : Array.isArray(basePlan.steps) ? basePlan.steps : []
  const planAdjust =
    planIn.adjustments !== undefined
      ? planAdjustments(planIn.adjustments)
      : Array.isArray(basePlan.adjustments)
        ? basePlan.adjustments
        : []
  const execution =
    executionIn.steps !== undefined
      ? executionSteps(executionIn.steps)
      : Array.isArray(baseExecution.steps)
        ? baseExecution.steps
        : []

  return {
    version: 1,
    kind: 'skill',
    id: base.id || makeId(),
    title,
    status,
    createdAt: base.createdAt || nowIso(),
    updatedAt: nowIso(),
    tags: source.tags !== undefined ? tagList(source.tags) : Array.isArray(base.tags) ? base.tags : [],
    sessionId:
      source.sessionId !== undefined
        ? text(source.sessionId, 500, '会话 id')
        : String(base.sessionId || ''),
    workspace:
      source.workspace !== undefined ? text(source.workspace, 500, '工作区') : String(base.workspace || ''),
    sourceIdeaId:
      source.sourceIdeaId !== undefined
        ? text(source.sourceIdeaId, 80, '来源想法')
        : String(base.sourceIdeaId || ''),
    goal: { text: goalText, questions, adjustments },
    plan: { steps, adjustments: planAdjust },
    execution: { steps: execution },
  }
}

function normalizeIdea(input, existing) {
  const source = input && typeof input === 'object' ? input : {}
  const base = existing && typeof existing === 'object' ? existing : {}
  const title =
    source.title !== undefined ? text(source.title, MAX.title, '标题', true) : String(base.title || '')
  if (!title) fail('TITLE_REQUIRED', '标题不能为空')
  const body = source.body !== undefined ? text(source.body, MAX.body, '正文') : String(base.body || '')
  let status = source.status !== undefined ? String(source.status) : base.status || 'draft'
  // 兼容老数据：ready 等价于 doing、converted 等价于 done，映射后按新三态落盘。
  status = mapIdeaStatus(status)
  if (!IDEA_STATUS.has(status)) fail('BAD_STATUS', '想法状态只能是 draft / doing / done')
  return {
    version: 1,
    kind: 'idea',
    id: base.id || 'idea-' + makeId(),
    title,
    body,
    status,
    createdAt: base.createdAt || nowIso(),
    updatedAt: nowIso(),
    convertedTo: source.convertedTo !== undefined ? String(source.convertedTo || '') : String(base.convertedTo || ''),
  }
}

function normalizeNote(input, index) {
  const source = input && typeof input === 'object' ? input : {}
  const body = text(source.body !== undefined ? source.body : source.text, 20000, '记事内容')
  const title = text(source.title !== undefined ? source.title : body.split('\n')[0], 120, '记事标题')
  if (!title && !body) return null
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(source.date || '')) ? String(source.date) : dayKey()
  const color = Number.isInteger(source.color) ? Math.max(0, Math.min(5, source.color)) : (index || 0) % 6
  return {
    id: source.id && /^[A-Za-z0-9_-]{3,80}$/.test(String(source.id)) ? String(source.id) : 'note-' + makeId(),
    title: title || body.slice(0, 60),
    body,
    date,
    createdAt: source.createdAt || nowIso(),
    color,
  }
}

function summarizeSkill(record) {
  const goal = record.goal && typeof record.goal === 'object' ? record.goal : {}
  const plan = record.plan && typeof record.plan === 'object' ? record.plan : {}
  const execution = record.execution && typeof record.execution === 'object' ? record.execution : {}
  return {
    id: record.id,
    title: record.title,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    tags: Array.isArray(record.tags) ? record.tags : [],
    sessionId: record.sessionId || '',
    preview: String(goal.text || '').slice(0, 140),
    counts: {
      questions: Array.isArray(goal.questions) ? goal.questions.length : 0,
      adjustments: Array.isArray(goal.adjustments) ? goal.adjustments.length : 0,
      planSteps: Array.isArray(plan.steps) ? plan.steps.length : 0,
      planAdjustments: Array.isArray(plan.adjustments) ? plan.adjustments.length : 0,
      executionSteps: Array.isArray(execution.steps) ? execution.steps.length : 0,
    },
  }
}

function summarizeIdea(record) {
  return {
    id: record.id,
    title: record.title,
    status: mapIdeaStatus(record.status),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    convertedTo: record.convertedTo || '',
    preview: String(record.body || '').replace(/\s+/g, ' ').slice(0, 140),
    length: String(record.body || '').length,
  }
}

export function createStore(dir, defaultGuideFile) {
  const root = dir
  const skillsDir = join(root, 'skills')
  const ideasDir = join(root, 'ideas')
  const trashDir = join(root, '.trash')
  const notesFile = join(root, 'notes.json')
  const guideFile = join(root, 'AGENTSKILL.md')
  const indexPath = join(root, 'index.md')

  function ensure() {
    mkdirSync(root, { recursive: true })
    mkdirSync(skillsDir, { recursive: true })
    mkdirSync(ideasDir, { recursive: true })
    mkdirSync(trashDir, { recursive: true })
    if (!existsSync(notesFile)) writeFileSync(notesFile, '[]\n', 'utf8')
    if (!existsSync(guideFile) && defaultGuideFile && existsSync(defaultGuideFile)) {
      copyFileSync(defaultGuideFile, guideFile)
    }
    return { dir: root, ready: true, error: '' }
  }

  function skillFile(id) {
    return join(skillsDir, safeId(id) + '.json')
  }

  function ideaFile(id) {
    return join(ideasDir, safeId(id) + '.json')
  }

  function getSkill(id) {
    const file = skillFile(id)
    if (!existsSync(file)) fail('NOT_FOUND', '找不到这条经验：' + id)
    const record = readJson(file, null)
    if (!record || typeof record !== 'object') fail('BROKEN_RECORD', '这条经验的 JSON 读不出来：' + id)
    return record
  }

  function getIdea(id) {
    const file = ideaFile(id)
    if (!existsSync(file)) fail('NOT_FOUND', '找不到这条想法：' + id)
    const record = readJson(file, null)
    if (!record || typeof record !== 'object') fail('BROKEN_RECORD', '这条想法的 JSON 读不出来：' + id)
    record.status = mapIdeaStatus(record.status)
    return record
  }

  function listSkills() {
    const result = []
    for (const name of listJson(skillsDir)) {
      const record = readJson(join(skillsDir, name), null)
      if (!record || typeof record !== 'object' || !record.id) continue
      result.push(summarizeSkill(record))
    }
    return result.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  }

  function listIdeas() {
    const result = []
    for (const name of listJson(ideasDir)) {
      const record = readJson(join(ideasDir, name), null)
      if (!record || typeof record !== 'object' || !record.id) continue
      result.push(summarizeIdea(record))
    }
    return result.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  }

  function createSkill(input, meta) {
    const record = normalizeSkill(input, null)
    if (meta && meta.sessionId) record.sessionId = String(meta.sessionId)
    if (meta && meta.workspace) record.workspace = String(meta.workspace)
    writeJson(skillFile(record.id), record)
    writeIndex()
    return record
  }

  function updateSkill(id, patch, baseUpdatedAt) {
    const current = getSkill(id)
    if (baseUpdatedAt && String(baseUpdatedAt) !== String(current.updatedAt)) {
      const error = new StoreError('CONFLICT', '这条记录在别处改过了，先重新载入')
      error.current = summarizeSkill(current)
      throw error
    }
    const record = normalizeSkill(Object.assign({}, patch, { id: current.id }), current)
    record.id = current.id
    record.createdAt = current.createdAt
    writeJson(skillFile(record.id), record)
    writeIndex()
    return record
  }

  function deleteSkill(id) {
    const file = skillFile(id)
    if (!existsSync(file)) fail('NOT_FOUND', '找不到这条经验：' + id)
    const target = join(trashDir, safeId(id) + '-' + Date.now() + '.json')
    renameSync(file, target)
    if (existsSync(file + '.bak')) renameSync(file + '.bak', target + '.bak')
    writeIndex()
    return { id, trashed: target }
  }

  function createIdea(input) {
    const record = normalizeIdea(input, null)
    writeJson(ideaFile(record.id), record)
    writeIndex()
    return record
  }

  function updateIdea(id, patch) {
    const current = getIdea(id)
    const record = normalizeIdea(Object.assign({}, patch, { id: current.id }), current)
    record.id = current.id
    record.createdAt = current.createdAt
    writeJson(ideaFile(record.id), record)
    writeIndex()
    return record
  }

  function deleteIdea(id) {
    const file = ideaFile(id)
    if (!existsSync(file)) fail('NOT_FOUND', '找不到这条想法：' + id)
    const target = join(trashDir, safeId(id) + '-' + Date.now() + '.json')
    renameSync(file, target)
    if (existsSync(file + '.bak')) renameSync(file + '.bak', target + '.bak')
    writeIndex()
    return { id, trashed: target }
  }

  function convertIdea(id, skillInput) {
    const idea = getIdea(id)
    const input = Object.assign({}, skillInput || {})
    if (!input.title) input.title = idea.title
    const goal = Object.assign({}, input.goal || {})
    if (goal.text === undefined) goal.text = idea.body
    input.goal = goal
    input.sourceIdeaId = idea.id
    if (input.status === undefined) input.status = 'active'
    const skill = createSkill(input, null)
    updateIdea(id, { status: 'done', convertedTo: skill.id })
    return { skill, idea: getIdea(id) }
  }

  function readNotes() {
    const data = readJson(notesFile, [])
    const items = Array.isArray(data)
      ? data.map((item, index) => normalizeNote(item, index)).filter(Boolean)
      : []
    return {
      items,
      mtimeMs: existsSync(notesFile) ? statSync(notesFile).mtimeMs : 0,
      path: notesFile,
    }
  }

  function saveNotes(items, baseMtimeMs, force) {
    const current = readNotes()
    if (!force && Number.isFinite(Number(baseMtimeMs)) && Number(baseMtimeMs) > 0) {
      if (Math.abs(current.mtimeMs - Number(baseMtimeMs)) > 1) {
        const error = new StoreError('CONFLICT', '记事本在别处改过了，先重新载入')
        error.current = { mtimeMs: current.mtimeMs, count: current.items.length }
        throw error
      }
    }
    const list = Array.isArray(items)
      ? items.map((item, index) => normalizeNote(item, index)).filter(Boolean)
      : []
    writeJson(notesFile, list)
    return readNotes()
  }

  function readGuide() {
    if (!existsSync(guideFile)) return { content: '', mtimeMs: 0, path: guideFile, exists: false }
    const content = readFileSync(guideFile, 'utf8')
    return {
      content,
      mtimeMs: statSync(guideFile).mtimeMs,
      path: guideFile,
      exists: true,
    }
  }

  function saveGuide(input) {
    const current = readGuide()
    const force = Boolean(input && input.force)
    if (!force && current.exists && Number(input && input.baseMtimeMs) > 0) {
      if (Math.abs(current.mtimeMs - Number(input.baseMtimeMs)) > 1) {
        const error = new StoreError('CONFLICT', '规矩文件在别处改过了，先重新载入')
        error.current = { mtimeMs: current.mtimeMs }
        throw error
      }
    }
    writeText(guideFile, input && input.content)
    return readGuide()
  }

  function writeIndex() {
    try {
      const skills = listSkills()
      const ideas = listIdeas()
      const stamp = new Date().toLocaleString('zh-CN', { hour12: false })
      const lines = []
      lines.push('# 全局经验索引')
      lines.push('')
      lines.push('> 由 dsh-experience 自动生成，最后更新：' + stamp)
      lines.push('> 数据目录：`' + root + '`')
      lines.push('')
      lines.push('## 经验（' + skills.length + '）')
      lines.push('')
      if (skills.length === 0) {
        lines.push('（还没有记录）')
      } else {
        lines.push('| 标题 | 状态 | 更新 | 步骤 |')
        lines.push('| --- | --- | --- | --- |')
        for (const item of skills) {
          const title = String(item.title || '').replace(/\|/g, '\\|')
          lines.push(
            '| [' +
              title +
              '](skills/' +
              item.id +
              '.json) | ' +
              item.status +
              ' | ' +
              localStamp(item.updatedAt) +
              ' | ' +
              item.counts.executionSteps +
              ' |',
          )
        }
      }
      lines.push('')
      lines.push('## 想法（' + ideas.length + '）')
      lines.push('')
      if (ideas.length === 0) {
        lines.push('（还没有想法）')
      } else {
        for (const item of ideas) {
          lines.push('- [' + item.title + '](ideas/' + item.id + '.json) · ' + item.status)
        }
      }
      lines.push('')
      writeFileSync(indexPath, lines.join('\n'), 'utf8')
    } catch {
      // 索引只是方便查看，写失败不影响主数据
    }
  }

  function stats() {
    return {
      dir: root,
      skills: listSkills().length,
      ideas: listIdeas().length,
      notes: readNotes().items.length,
      guide: existsSync(guideFile),
    }
  }

  return {
    dir: root,
    paths: { skillsDir, ideasDir, notesFile, guideFile, indexPath },
    ensure,
    listSkills,
    getSkill,
    createSkill,
    updateSkill,
    deleteSkill,
    listIdeas,
    getIdea,
    createIdea,
    updateIdea,
    deleteIdea,
    convertIdea,
    readNotes,
    saveNotes,
    readGuide,
    saveGuide,
    writeIndex,
    stats,
  }
}