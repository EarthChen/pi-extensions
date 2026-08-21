# Proactive Compact — 主动上下文压缩(agent 判断 + 占用率阈值)

让 agent 在达到 pi 原生阈值之前主动压缩,两个通道:

1. **语义判断**:agent 调 `compact_context`(任务切换 / 阶段完成 / 用户要求)。
2. **占用率阈值**:上下文用量达到配置比例时,扩展自动 arm。

不被动等 pi 同步压缩,也不需用户手动 `/compact`。

## 背景

pi 原生自动压缩只在 `contextTokens > contextWindow - reserveTokens`(阈值)或溢出时触发——由引擎决定,agent 无话语权,也不看"任务是否切换"。`/compact` 只能由用户空闲时触发。

本扩展把"何时压缩"拆成两类决策者:

- **数值类**(窗口快满):扩展自己算,自动触发,agent 无需介入。
- **语义类**(上下文不再需要):只有 agent 的 LLM 判断得了,通过工具触发。

因此扩展只暴露**一个工具** `compact_context`;窗口用量等数值逻辑由扩展内部持有,不向 agent 暴露查询工具。

## 安装

npm 包(推荐):

```bash
pi install npm:@earthchen/pi-extensions
# 或 git 安装:
pi install git:github.com/EarthChen/pi-extensions
```

pi 自动加载 `~/.pi/agent/npm/` 下的扩展,**重启(或 `/reload`)即生效**。仅依赖 pi 内置扩展 API(`ctx.compact`、`ctx.getContextUsage`、`registerTool` 等),无额外依赖。无配置块时数值通道按默认 `ratio: 0.6` 工作。

若此前在 `~/.pi/agent/extensions/proactive-compact.ts` 放过本地副本,安装 npm 包后请删除旧副本,避免同一扩展被加载两次。

本地开发(不发布):把本仓库 `extensions/proactive-compact.ts` 与 `extensions/proactive-compact/` 放到 `~/.pi/agent/extensions/` 下即可。

## 触发条件

| # | 条件 | 触发方 | arm 时机 | 触发时机 |
|---|------|--------|----------|----------|
| 1 | 语义判断 | agent 调 `compact_context` | 工具调用时 | `agent_end` 且空闲,异步 |
| 2 | 占用率阈值 | 扩展自动 | `tool_execution_end`(用量 ≥ 阈值) | `agent_end` 且空闲,异步 |

条件 2 的阈值 = `min(floor(contextWindow × ratio), maxTokens)`(见配置)。两个通道共用同一条异步触发路径。

**与 observational-memory 自动触发的关系**:两者度量不同——OM 看"距上次压缩的增量",本扩展看总占用率。占用率达到阈值时,OM 的增量必然还未达标;因此本扩展的阈值通道总是先 arm,OM 的自动触发实际充当本扩展禁用时的后备。

## 暴露的工具

### `compact_context`

agent 主动请求压缩。参数:

- `instructions?`(string):压缩的关注点 / 原因,例如 `"TASK BOUNDARY: 新任务与上一任务无关,丢弃旧上下文"` 或 `"只保留代码改动与未解决错误"`。该文本作为 `customInstructions` 转发,供其他扩展(如 `pi-observational-memory`)纳入摘要。

调用后返回确认,实际压缩在当前轮 `agent_end` 且 agent 空闲时异步进行——当前 turn 不会被打断。

**何时调用**:当对话的早期上下文对后续工作不再相关——新 / 无关任务开始、大段探索或搜索结束、或用户明确要求压缩。普通的中途进展(上下文仍需要)不要调用。

## 任务边界透传到 observational-memory

当 agent 在 `instructions` 中写明边界(如 `"TASK BOUNDARY: ..."`),本扩展把它作为 `customInstructions` 传入 `ctx.compact()`,进入 `session_before_compact` 事件。

要让这段说明真正进入 observational-memory 的记忆摘要,需其钩子消费 `customInstructions`。相关 PR:#56(https://github.com/elpapi42/pi-observational-memory/pull/56)。合并发版前,本地补丁 `~/.pi/agent/npm/node_modules/pi-observational-memory/src/hooks/compaction-hook.ts` 提供同样效果:

```ts
let summary = renderSummary(projection.reflections, projection.observations);
if (event.customInstructions) summary = summary + " --- " + event.customInstructions;
```

> PR 合并且 `pi-observational-memory` 发版后,删除该本地补丁即可,扩展零维护、升级稳定。

不补该钩子时,本扩展仍正常:只是任务边界说明不会进 observational-memory 摘要(仅作为 `ctx.compact` 参数存在,被原钩子忽略)。阈值路径(`source: "threshold"`)不传 `instructions`,不会污染摘要。

## 安全性:触发 turn 不被阻断,等待顺延到下一 turn

压缩在 `agent_end` 异步触发(OM 同款:`setTimeout(0)` + `isIdle()` 检查 + 不 `await`)。**触发压缩的那一轮 turn 永远不会被中途暂停**——这点不同于 pi 原生:原生在 `message_end` `await` 压缩,会阻塞该 turn 直到上下文重建完(见 `agent-session.js:776`)。

但压缩重建上下文的代价总要有人付:pi 在构建下一轮上下文时会 `await _checkCompaction`(`agent-session.js:865`),即**下一轮首次 LLM 调用前会等待压缩完成**(`isCompacting` 状态见 `agent-session.js:647`)。所以异步并非"agent 永不等",而是把"等"从触发轮中途挪到**下一轮边界**;若两轮之间 agent 空闲,压缩在后台跑完,无感。两种路径总压缩耗时一致,差异仅在等待落点。

## 与原生 / observational-memory 的关系

- **原生 pi 阈值压缩**:仍作为兜底存在。
- **pi-observational-memory**:独立做分层记忆压缩;本扩展的压缩同样触发其 `session_before_compact` 钩子,因此也继承"后台预建摘要 → 压缩瞬时完成"的特性。**注意这是运行时交互,不是配置耦合**——本扩展不读取 OM 的任何配置。

## 配置

`settings.json`(全局 `~/.pi/agent/settings.json`,项目级 `<project>/.pi/settings.json` 覆盖)中的**可选** `proactive-compact` 块:

```json
"proactive-compact": {
  "ratio": 0.6,
  "maxTokens": 400000
}
```

- `ratio`(可选):占用率阈值比例,阈值 = `floor(contextWindow × ratio)`。未设置默认 `0.6`。
- `maxTokens`(可选):阈值的绝对上限,`min(ratio 阈值, maxTokens)`。为大窗口模型(1M)而设,避免比例把触发点放大到几十万 token;未设置 = 无上限。
- 窗口大小未知时阈值视为 ∞,数值通道不 arm。
- `MIN_CONTEXT_TOKENS`(16000,源码常量,非配置项):阈值低于此值时数值通道不 arm——此时压缩已缩不掉任何有效内容(pi 逐字保留最近 `keepRecentTokens`),arm 只会造成空转压缩循环。仅在远小于 200k 的窗口上才可能触及。

**语义边界**:阈值是"总占用率"语义,与 `observational-memory.compactAfterTokensRatio` 的"距上次压缩增量"语义无关——本扩展**不读取、不回退** OM 的任何配置。调整 OM 的 ratio 只影响 OM 自己的触发;调整本扩展的阈值只改 `proactive-compact` 块。
