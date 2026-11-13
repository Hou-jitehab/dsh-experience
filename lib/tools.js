/**
 * 给 agent 用的「全局经验」工具。
 *
 * 这些工具注册在插件上下文里，对所有会话可见；execute 的第二个参数
 * 带着发起调用的 agent，用它记下来源会话。
 */

import { StoreError } from './store.js'

function outputSpec() {
  return {
    schema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        ok: { type: 'boolean' },
        text: { type: 'string' },
      },
    },
    render(_args, value) {
      const text =
        value && typeof value.text === 'string' ? value.text : JSON.stringify(value == null ? null : value, null, 2)
      return [{ type: 'text', text }]
    },
  }
}

function ok(text, extra) {
  return Object.assign({ ok: true, text }, extra || {})
}

function bad(text, code) {
  return { ok: false, text, code: code || 'EXPERIENCE_ERROR' }
}

function sessionIdFromExec(exec) {
  try {
    const agent = exec && (exec.agent || exec.caller || exec.agentRef)
    if (!agent) return ''
    if (typeof agent.id === 'string') return agent.id
    if (agent.session && typeof agent.session.id === 'string') return agent.session.id
    if (typeof agent.sessionId === 'string') return agent.sessionId
  } catch {
    // exec 的形状不是契约的一部分，拿不到就算了
  }
  return ''
}

function formatList(kind, items) {
  const label = kind === 'idea' ? '想法' : '经验'
  if (items.length === 0) return '没有找到' + label + '。'
  const lines = ['共 ' + items.length + ' 条' + label + '：']
  for (const item of items) {
    if (kind === 'idea') {
      lines.push('- [' + item.status + '] ' + item.title + '（' + item.id + '）')
      if (item.preview) lines.push('  ' + item.preview)
    } else {
      const counts = item.counts || {}
      lines.push(
        '- [' +
          item.status +
          '] ' +
          item.title +
          '（' +
          item.id +
          '）· ' +
          dayLabel(item.updatedAt) +
          ' · ' +
          (counts.executionSteps || 0) +
          ' 步',
      )
      /* 给 agent 扫的列表只带标题 + 50 字目标摘要：经验越积越多时扫一遍才不费上下文。
         面板卡片仍用完整预览（store 里 140 字），这里只是展示层截短 */
      if (item.preview) {
        const preview = String(item.preview)
        lines.push('  ' + (preview.length > 50 ? preview.slice(0, 50) + '…' : preview))
      }
    }
  }
  return lines.join('\n')
}

function dayLabel(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return String(iso).slice(0, 10)
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

const questionSchema = {
  type: 'array',
  description: '只记真正改变方向的提问，0–8 条。',
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      question: { type: 'string', description: 'agent 问用户的' },
      answer: { type: 'string', description: '用户的回答' },
    },
    required: ['question'],
  },
}

const goalAdjustmentSchema = {
  type: 'array',
  description: '过程中因为什么改了策略。每条必须写原因。',
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      reason: { type: 'string', description: '为什么改（必填）' },
      from: { type: 'string', description: '原方案' },
      to: { type: 'string', description: '新方案' },
    },
    required: ['reason'],
  },
}

const planAdjustmentSchema = {
  type: 'array',
  description: '计划中途怎么变的、为什么。',
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      reason: { type: 'string', description: '为什么改计划（必填）' },
      change: { type: 'string', description: '改成了什么' },
    },
    required: ['reason'],
  },
}

const executionSchema = {
  type: 'object',
  description: '由实际执行任务的 agent 写。最多 8 步，不要编造。',
  additionalProperties: false,
  properties: {
    steps: {
      type: 'array',
      description: '每步三样：动作、结果、证据。没有证据就写「无」。',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', description: '具体做了什么（动词开头）' },
          result: { type: 'string', description: '结果如何，成功/失败/部分完成' },
          evidence: { type: 'string', description: '文件路径、命令、链接或测试结果；没有就写「无」' },
        },
        required: ['action'],
      },
    },
  },
}

export function registerExperienceTools(ctx, store) {
  const disposers = []

  disposers.push(
    ctx.tools.register({
      name: 'experience_guide',
      description:
        '读取「全局经验」的写作规矩（AGENTSKILL.md）。写经验前先读一遍；用户问经验怎么写也用它。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: outputSpec(),
      async execute() {
        const guide = store.readGuide()
        if (!guide.content) return bad('规矩文件是空的：' + guide.path)
        return ok(guide.content)
      },
    }),
  )

  disposers.push(
    ctx.tools.register({
      name: 'experience_list',
      description:
        '列出已经记录的经验，或用户写下的想法。找「用户说过的某个想法」用 kind:"idea"；回顾做过的事用默认的 skill。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', enum: ['skill', 'idea'], description: 'skill=经验（默认），idea=想法' },
          status: {
            type: 'string',
            description: '按状态过滤：经验用 active/done；想法用 draft/doing/done',
          },
          query: { type: 'string', description: '在标题、目标/正文里找关键词' },
          limit: { type: 'integer', minimum: 1, maximum: 100, description: '最多返回几条，默认 20' },
        },
      },
      output: outputSpec(),
      async execute(args) {
        const input = args && typeof args === 'object' ? args : {}
        const kind = input.kind === 'idea' ? 'idea' : 'skill'
        const query = String(input.query || '').trim().toLowerCase()
        const status = String(input.status || '').trim()
        const limit = Math.max(1, Math.min(100, Number(input.limit) || 20))
        let items = kind === 'idea' ? store.listIdeas() : store.listSkills()
        if (status) items = items.filter((item) => item.status === status)
        if (query) {
          items = items.filter((item) => {
            const haystack = [item.title, item.preview].join('\n').toLowerCase()
            return haystack.includes(query)
          })
        }
        const total = items.length
        items = items.slice(0, limit)
        return ok(formatList(kind, items), { kind, total, items })
      },
    }),
  )

  disposers.push(
    ctx.tools.register({
      name: 'experience_read',
      description: '读一条经验或想法的完整内容。先 experience_list 拿 id。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', description: '记录 id' },
          kind: { type: 'string', enum: ['skill', 'idea'], description: '不给就先找经验，再找想法' },
        },
        required: ['id'],
      },
      output: outputSpec(),
      async execute(args) {
        const input = args && typeof args === 'object' ? args : {}
        const id = String(input.id || '').trim()
        if (!id) return bad('要给 id')
        const order = input.kind === 'idea' ? ['idea'] : input.kind === 'skill' ? ['skill'] : ['skill', 'idea']
        for (const kind of order) {
          try {
            const record = kind === 'idea' ? store.getIdea(id) : store.getSkill(id)
            return ok(JSON.stringify(record, null, 2), { kind, record })
          } catch (error) {
            if (!(error instanceof StoreError) || error.code !== 'NOT_FOUND') {
              return bad(error && error.message ? error.message : String(error))
            }
          }
        }
        return bad('找不到这条记录：' + id)
      },
    }),
  )

  disposers.push(
    ctx.tools.register({
      name: 'experience_record',
      description:
        '完成一项用户交代的任务后，新建一条经验。写之前先 experience_guide 读规矩；执行部分由实际执行者写。纯问答/闲聊不记。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', description: '一句话标题，半年后还能一眼认出来' },
          status: { type: 'string', enum: ['active', 'done'], description: '默认 done；还在做就传 active' },
          tags: { type: 'array', items: { type: 'string' }, description: '最多 12 个短标签' },
          goal: {
            type: 'object',
            additionalProperties: false,
            properties: {
              text: { type: 'string', description: '用户交代的任务，尽量保留原话' },
              questions: questionSchema,
              adjustments: goalAdjustmentSchema,
            },
            required: ['text'],
          },
          plan: {
            type: 'object',
            additionalProperties: false,
            properties: {
              steps: {
                type: 'array',
                items: { type: 'string' },
                description: '按执行顺序的步骤，1–20 条',
              },
              adjustments: planAdjustmentSchema,
            },
          },
          execution: executionSchema,
          sessionId: { type: 'string', description: '来源会话；不传会自动从调用者拿' },
          workspace: { type: 'string', description: '工作区路径' },
          sourceIdeaId: { type: 'string', description: '如果由某条想法转来，填想法 id' },
        },
        required: ['title', 'goal'],
      },
      output: outputSpec(),
      async execute(args, exec) {
        try {
          const input = args && typeof args === 'object' ? args : {}
          const status = input.status === 'active' ? 'active' : 'done'
          const planSteps = input.plan && Array.isArray(input.plan.steps) ? input.plan.steps : []
          const execSteps = input.execution && Array.isArray(input.execution.steps) ? input.execution.steps : []
          if (status === 'done' && planSteps.length === 0) {
            return bad('要记录成 done，至少写 1 步计划；还没计划就先传 status:"active"')
          }
          if (status === 'done' && execSteps.length === 0) {
            return bad('要记录成 done，至少写 1 步执行（动作 / 结果 / 证据）；还没做完就传 status:"active"')
          }
          const record = store.createSkill(Object.assign({}, input, { status }), {
            sessionId: input.sessionId || sessionIdFromExec(exec),
          })
          if (input.sourceIdeaId) {
            try {
              store.updateIdea(input.sourceIdeaId, { status: 'done', convertedTo: record.id })
            } catch {
              // 想法可能已经被删了；经验已经记下，不因为这一步失败而回滚
            }
          }
          return ok('已记录「' + record.title + '」（' + record.id + '）', {
            id: record.id,
            title: record.title,
            updatedAt: record.updatedAt,
          })
        } catch (error) {
          return bad(error && error.message ? error.message : String(error), error && error.code)
        }
      },
    }),
  )

  disposers.push(
    ctx.tools.register({
      name: 'experience_update',
      description: '修改一条已有经验（补执行、改状态、改标题等）。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', description: '经验 id' },
          title: { type: 'string' },
          status: { type: 'string', enum: ['active', 'done'] },
          tags: { type: 'array', items: { type: 'string' } },
          goal: {
            type: 'object',
            additionalProperties: false,
            properties: {
              text: { type: 'string' },
              questions: questionSchema,
              adjustments: goalAdjustmentSchema,
            },
          },
          plan: {
            type: 'object',
            additionalProperties: false,
            properties: {
              steps: { type: 'array', items: { type: 'string' } },
              adjustments: planAdjustmentSchema,
            },
          },
          execution: executionSchema,
          baseUpdatedAt: { type: 'string', description: '上次读到的 updatedAt；不传则不检查冲突' },
        },
        required: ['id'],
      },
      output: outputSpec(),
      async execute(args) {
        try {
          const input = args && typeof args === 'object' ? args : {}
          const id = String(input.id || '').trim()
          if (!id) return bad('要给 id')
          const patch = Object.assign({}, input)
          delete patch.id
          delete patch.baseUpdatedAt
          const record = store.updateSkill(id, patch, input.baseUpdatedAt)
          return ok('已更新「' + record.title + '」（' + record.id + '）', {
            id: record.id,
            title: record.title,
            updatedAt: record.updatedAt,
          })
        } catch (error) {
          return bad(error && error.message ? error.message : String(error), error && error.code)
        }
      },
    }),
  )

  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // 卸载阶段的清理错误不再往外抛
      }
    }
  }
}