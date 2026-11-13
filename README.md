# 全局经验 · dsh-experience

> 给 DeepSeek Harness（DSH）用的侧边栏面板：把做完的任务沉淀成结构化「经验」，下次开新会话时 agent 先扫一遍标题，直接复用上次的做法和踩过的坑。

DSH 的每个会话都是新的，上下文一关就没了。这个插件把「我们做过什么、怎么做的、卡在哪」变成**可检索、可编辑、可复用**的结构化记录，并且让 agent 在动手前自动去查。

面板里有四块内容：

| 块 | 作用 |
| --- | --- |
| **经验 Skills** | 一项任务一条记录：目标 → 计划 → 执行，全部可编辑 |
| **想法 Ideas** | 先写方案，标待办/进行中/已完成，做完落成一条经验 |
| **记事本 Notes** | 随手记，按日期分组，有开合动画 |
| **AGENTS.md** | 直接查看、编辑 `$DSH_HOME/AGENTS.md`，带冲突检测 |

**所有数据都在你本机**，插件不上传、不联网、不收集任何东西。

---

## 它解决什么问题

普通的「聊天记录」和「笔记」不适合给 agent 用：

- 聊天记录太长、噪音太多，agent 每次都要重新读一遍；
- 笔记没有结构，agent 不知道哪段是「坑」、哪段是「做法」；
- 同一个坑踩第二次的时候，上次的结论往往已经找不到了。

这个插件的做法是：

1. **一条任务 = 一条经验**，字段固定（目标、计划、执行），写的时候必须带证据；
2. 列表页**只显示标题**，agent 用 `experience_list` 花很少的上下文就能扫一遍；
3. 标题对上了才 `experience_read` 读全文，没对上直接开干；
4. 消费端（也就是 agent）和编辑端（人）看到的是同一份数据。

---

## 安装

插件走 DSH 的 Cordis bundle 机制。把本仓库放到本机任意目录，然后二选一：

- 让 agent 用 `plugin_manager` 的 `install_bundle`，传**本仓库目录**；
- 或在 profile 的 bundle 列表里加一条 `link:<本仓库路径>`（`link:` 是软链，不复制文件）。

装好后侧边栏会出现「全局经验」入口。改代码后重新 import 插件即可生效，不需要重装。

**怎么确认装成功了**：侧边栏出现「全局经验」图标，点开能看到四个 tab；对 agent 说「列一下经验」，它应该能调用 `experience_list`（而不是报工具不存在）。

---

## 兼容性与已知限制

先说结论：插件是**零第三方依赖的纯 ESM**（只 import `node:` 内置和仓库里的相对路径），没有构建步骤、没有安装脚本，所以「装不上」通常只有下面几种原因，都不是随机崩溃：

| 情况 | 会发生什么 |
| --- | --- |
| DSH 版本不在 `>=0.2.1-rc.3 <0.3.0` | DSH 的插件管理器**拒绝加载**这个插件，其它插件照常；侧边栏不出现入口。升级 DSH 后需要作者适配新版本。 |
| 用 headless / SDK profile（没有 Web 界面） | 插件依赖 `webServer` 服务，会停在 pending 状态：不加载、不报错、不影响宿主。 |
| 只 `pnpm add` 或把目录丢进 `node_modules` | **不会激活**。必须作为 bundle 挂进 profile（`link:` 或 `install_bundle`），否则 `cordis.patch.yml` 没被读取，profile 里就没有 `experience` 这一行。 |
| `~/.dsh`（`DSH_HOME`）不可写 | 插件以「未就绪」状态启动，面板显示错误信息；DSH 本身不受影响。 |
| 同一个 profile 里已有 `id: experience` 的插件行 | 会冲突（正常安装不会遇到）。 |

其它说明：

- **平台**：主要在 Windows 上开发和验证，**macOS / Linux 没有实测过**。代码里没有平台相关的路径硬编码（数据默认落在 `~/.dsh/experience`）；唯一的平台相关逻辑是「判断哪个工作区是默认工作区」那一段，用了 Windows 的路径归一化语义——在非 Windows 上最多把两个路径误判成同一个，不影响经验记录、检索和面板。
- **首次启动**会自动创建 `skills/`、`ideas/`、`.trash/`、`notes.json`、`AGENTSKILL.md`，不需要手动准备目录。
- **客户端脚本**（`client.js`）走宿主的 `window.__ModuleLoader__` + 宿主提供的 React，所以只能在 DSH 0.2.x 的 Web 端里跑；单独打开这个文件没有意义。
- 没在别的机器上跑过自动化测试，上面的结论来自：匿名 clone 后模块可加载、用空目录模拟首次初始化（目录/索引/默认规矩都能正确生成）、以及在本机 DSH 0.2.1-rc.3 上的完整使用。**遇到问题请开 issue，附上 DSH 版本和报错。**

---

## 数据目录

默认 `$DSH_HOME/experience`（`DSH_HOME` 默认 `~/.dsh`），可以用环境变量 `DSH_EXPERIENCE_DIR` 指到别的盘：

```bash
# Windows (PowerShell)
$env:DSH_EXPERIENCE_DIR = 'D:\my-data\experience'

# macOS / Linux
export DSH_EXPERIENCE_DIR=~/data/experience
```

目录结构：

```
skills/<id>.json   一条经验一个文件
ideas/<id>.json    一条想法一个文件
notes.json         记事本（整个数组）
AGENTSKILL.md      写经验的规矩（首次启动从内置模板复制）
index.md           自动生成的索引，给人/agent 直接看
.trash/            删除的记录（不真删，可捞回）
```

写盘策略：

- 所有写入都是**临时文件 + rename**，避免写一半断电留下半截文件；
- 覆盖前把上一版复制成 `.bak`；
- 删除移到 `.trash/`，不物理删除；
- 读的时候兼容旧字段（`ready` → `doing`、`converted` → `done`），但**不回写**，磁盘上保持原样。

一条经验长这样（`skills/<id>.json`）：

```json
{
  "title": "一句话标题，半年后还能一眼认出来",
  "status": "done",
  "tags": ["dsh", "plugin"],
  "goal": {
    "text": "用户交代的任务，尽量保留原话",
    "questions": [{ "question": "我问用户的", "answer": "用户回答的" }],
    "adjustments": [{ "reason": "为什么改", "from": "原方案", "to": "新方案" }]
  },
  "plan": {
    "steps": ["第一步", "第二步"],
    "adjustments": []
  },
  "execution": {
    "steps": [
      { "action": "做了什么", "result": "成功/失败", "evidence": "文件路径 / 命令 / 链接" }
    ]
  }
}
```

---

## 面板用法

1. **第一级**：只有标题，左边按月分组。
2. **第二级**：点标题，看到「目标 → 计划 → 执行」三张阶段卡，每张只显示摘要和计数。
3. **第三级**：再点阶段卡，看到这一块里的每个节点（提问、调整、计划步骤、执行步骤），按顺序用箭头连起来。

任何节点**点一下就能改**：回车确认，Esc 取消；增删、上下移动都在行内完成。每条记录还有「源码」开关，解析不了就退回纯文本，不会把内容锁死。

写作规矩放在 `AGENTSKILL.md`（面板里可编辑，内置模板见 `AGENTSKILL.default.md`），agent 写之前会先读它。

---

## Agent 工具

插件在 Host 侧注册五个全局工具，所有会话（包括子 agent）都能用：

| 工具 | 作用 |
| --- | --- |
| `experience_guide` | 读写作规矩 `AGENTSKILL.md`；写之前先读 |
| `experience_list` | 列经验，或按 `kind: "idea"` 列想法 |
| `experience_read` | 读一条完整内容 |
| `experience_record` | 新建一条经验；自动记下来源会话 |
| `experience_update` | 改一条；可带 `baseUpdatedAt` 防并发覆盖 |

系统提示里只放一句话（「有经验面板，做完用 `experience_record` 记，写前读 `experience_guide`」），详细规矩都在 `AGENTSKILL.md` 里，避免重复占上下文。

---

## HTTP 接口

同源 HTTP，除图标外都要求请求头 `x-dsh-experience: 1`：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/dsh-experience/ping` | 数据目录是否就绪 |
| GET | `/dsh-experience/state` | 面板首屏：经验/想法摘要、记事、规矩元信息 |
| GET | `/dsh-experience/skill?id=` | 读一条经验 |
| POST | `/dsh-experience/skill/create` | 新建经验 |
| POST | `/dsh-experience/skill/update` | `{ id, patch, baseUpdatedAt }` |
| POST | `/dsh-experience/skill/delete` | 移到 `.trash` |
| GET | `/dsh-experience/idea?id=` | 读一条想法 |
| POST | `/dsh-experience/idea/create` | 新建想法 |
| POST | `/dsh-experience/idea/update` | `{ id, patch, baseUpdatedAt }` |
| POST | `/dsh-experience/idea/delete` | 移到 `.trash` |
| POST | `/dsh-experience/idea/convert` | 想法转经验 |
| GET | `/dsh-experience/notes` | 读记事本 |
| POST | `/dsh-experience/notes/save` | `{ items, baseMtimeMs, force }` |
| GET | `/dsh-experience/guide` | 读 `AGENTSKILL.md` |
| POST | `/dsh-experience/guide/save` | `{ content, baseMtimeMs, force }` |
| GET | `/dsh-experience/agents` | 读全局 `AGENTS.md` |
| POST | `/dsh-experience/agents/save` | `{ content, baseMtimeMs, force }` |
| GET | `/dsh-experience/workspaces` | 列工作区（默认工作区排第一） |
| GET | `/dsh-experience/workspace-agents?id=` | 读某个工作区的 `AGENTS.md` |
| POST | `/dsh-experience/workspace-agents/save` | `{ id, content, baseMtimeMs, force }` |
| GET | `/dsh-experience/icon.svg` | 插件图标 |

工作区路径**只从 DSH 的工作区注册表取**，接口不接受客户端传来的任意路径（`id` 查不到就是 404）。

---

## 一些设计取舍

- **为什么用 JSON 而不是 Markdown + frontmatter**：面板要做逐节点编辑、冲突检测和结构化检索，Markdown 得反复解析、渲染回去还容易改坏格式。
- **为什么列表只显示标题**：这是给 agent 省上下文的。一条经验全文可能有几千字，30 条经验全塞进去就没法干活了。
- **为什么保留 `.bak` 和 `.trash`**：写作是渐进的，改错了要能退回去；笔记类工具最忌讳「一改就没」。
- **为什么执行部分要求写证据**：没有证据的经验等于没写——半年后既不能复现，也不能判断当时是否真的做成了。

---

## License

[MIT](./LICENSE)