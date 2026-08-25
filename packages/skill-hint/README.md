# Skill Hint — 非行首 `/` 触发 skill 补全

在输入框任意位置(非消息开头)敲 `/`,弹出 `/skill:*` 命令建议;选中后插入完整命令,回车即执行。解决"想用某个 skill 但记不全名字"的问题。

## 背景

pi 原生斜杠菜单只在**消息以 `/` 开头**时触发(`CombinedAutocompleteProvider` 检查 `textBeforeCursor.startsWith("/")`)。已输入其他文字后再想调 skill,没有任何提示入口。

本扩展通过两个 hook 实现自动触发:

- `ctx.ui.addAutocompleteProvider()` 在内置补全器之上包一层:光标前是空白/行首、且当前 token 以 `/` 开头时,用 `pi.getCommands()` 过滤出 `source === "skill"` 的命令,fuzzy 过滤后作为候选项返回;其余情况一律委托给被包装的内置 provider,`@` 文件补全、路径补全、行首斜杠菜单均不受影响。
- `ctx.ui.setEditorComponent()` 注册一个继承内置 `CustomEditor` 的编辑器子类。pi-tui 的自动触发机制显式排除了 `/`(`setAutocompleteTriggerCharacters` 会跳过 `/`),基础编辑器只在消息开头对 `/` 自动弹菜单;子类在每次按键后检查光标是否处于句中 `/<query>` token 内,是则主动触发补全请求,实现输入即弹出。

Tab 手动触发仍然可用(走同一条 provider 路径)。

## 安装

```bash
pi install npm:@earthchen/pi-skill-hint
# 或本地路径安装(克隆仓库后):
pi install ./packages/skill-hint
```

重启 pi(或 `/reload`)生效。

若此前在 `~/.pi/agent/extensions/skill-hint.ts` 放过本地副本,安装 npm 包后请删除旧副本,避免同一扩展被加载两次。

## 行为

| 输入 | 结果 |
|------|------|
| 消息开头敲 `/` | 内置斜杠菜单(本扩展不介入;判定的是光标所在 token 是否为消息首个非空白字符,而非整行是否以 `/` 开头) |
| 句中敲 ` /ski` | 立即自动弹出 fuzzy 匹配的 skill 命令,如 `/skill:skill-creator`(Tab 亦可手动触发) |
| 选中候选项后(行首为 `/skill:name `)再敲 ` /sk` | 照常自动弹出——后续 `/` token 不受首行已选命令影响 |
| 选中候选项 | 插入 `/skill:<name> `(光标落在尾部空格后) |
| 敲 `cat /usr/local` | token 含第二个 `/`,视为路径,交给内置路径补全 |
| fuzzy 无匹配 | 交给内置 provider(通常无建议,不打扰) |

候选列表只含 skill 命令,遵循 settings 的 `enableSkillCommands`:该开关关闭时 skill 命令不注册,扩展自然无提示。

## 已知局限

- 插入的 `/skill:name ` 只有最终位于消息开头才会作为命令执行;在长句子中间插入只是普通文本(pi 的固有语义)。典型用法是空输入框先选 skill 再补参数。
- 空格后的绝对路径(如 `cat /usr`)在只敲出第一段时会先弹 skill 菜单;继续敲到 `/` 或无匹配后自动回落到路径补全。
- 自定义编辑器全局只能有一个(`setEditorComponent` 是单槽位):若同时安装其他替换编辑器的扩展(如 vim 模式),后注册者生效,自动触发随之失效(Tab 触发仍可用)。

## 开发

裸 TS,无构建步骤,由 pi 运行时(bun)直接加载。
