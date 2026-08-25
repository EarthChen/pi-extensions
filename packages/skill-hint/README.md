# Skill Hint — 非行首 `/` 触发 skill 补全

在输入框任意位置(非消息开头)敲 `/`,弹出 `/skill:*` 命令建议;选中后插入完整命令,回车即执行。解决"想用某个 skill 但记不全名字"的问题。

## 背景

pi 原生斜杠菜单只在**消息以 `/` 开头**时触发(`CombinedAutocompleteProvider` 检查 `textBeforeCursor.startsWith("/")`)。已输入其他文字后再想调 skill,没有任何提示入口。

本扩展通过 `ctx.ui.addAutocompleteProvider()` 在内置补全器之上包一层:

- 光标前是空白/行首、且当前 token 以 `/` 开头时,用 `pi.getCommands()` 过滤出 `source === "skill"` 的命令,fuzzy 过滤后作为候选项返回。
- 其余情况一律委托给被包装的内置 provider,`@` 文件补全、路径补全、行首斜杠菜单均不受影响。

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
| 消息开头敲 `/` | 内置斜杠菜单(本扩展不介入) |
| 句中敲 ` /ski` | 弹出 fuzzy 匹配的 skill 命令,如 `/skill:skill-creator` |
| 选中候选项 | 插入 `/skill:<name> `(光标落在尾部空格后) |
| 敲 `cat /usr/local` | token 含第二个 `/`,视为路径,交给内置路径补全 |
| fuzzy 无匹配 | 交给内置 provider(通常无建议,不打扰) |

候选列表只含 skill 命令,遵循 settings 的 `enableSkillCommands`:该开关关闭时 skill 命令不注册,扩展自然无提示。

## 已知局限

- 插入的 `/skill:name ` 只有最终位于消息开头才会作为命令执行;在长句子中间插入只是普通文本(pi 的固有语义)。典型用法是空输入框先选 skill 再补参数。
- 空格后的绝对路径(如 `cat /usr`)在只敲出第一段时会先弹 skill 菜单;继续敲到 `/` 或无匹配后自动回落到路径补全。

## 开发

裸 TS,无构建步骤,由 pi 运行时(bun)直接加载。
