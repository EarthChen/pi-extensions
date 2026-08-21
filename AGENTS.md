# AGENTS.md

> pi 扩展集合的代理指南。代码细节以源码为准。

## Project

个人维护的 [pi](https://github.com/badlogic/pi-mono) 扩展集合(**单包多扩展**):一个 npm 包装多个扩展,靠 `package.json` 的 `pi.extensions` 数组声明入口。当前仅含 `proactive-compact`(主动上下文压缩)。[推断] 定位为按需扩充的个人扩展库,非独立产品。

## Stack

- 语言/运行时: TypeScript(**裸 TS,无构建步骤**;pi 用 bun 直接加载 `.ts`)
- 扩展 API: `@earendil-works/pi-coding-agent`(peerDependency,由 pi 运行时提供)
- 运行时依赖: `typebox`(工具参数 schema)
- 包管理器: pnpm(技术栈约束)
- 分发: npm(作用域 `@earthchen/pi-extensions`)/ git(`pi install`)

## Commands

- 发布: `pnpm publish`(包根执行;无构建,直接打包 `files` 白名单)
- [缺] 无 build / test / lint 脚本(裸 TS,经 pi 运行时校验)

## Architecture

- `package.json` 的 `pi.extensions` 数组 = 扩展清单,每项指向一个默认导出的入口文件。
- `extensions/<name>.ts`:扩展源码,`export default function(api: ExtensionAPI)` 在函数体内用 `pi.on` / `pi.registerTool` 注册。
- `extensions/<name>/README.md`:该扩展的独立文档。
- 新增扩展:加 `extensions/<name>.ts` + `extensions/<name>/README.md`,并在 `pi.extensions` 追加 `"./extensions/<name>.ts"`。
- 扩展配置(若有)走 pi 的 `settings.json`(`~/.pi/agent/settings.json` 或项目级 `.pi/settings.json`)中的 `<name>` 块,**不进包体**。

## Conventions

[推断] 自代码观察:
- 注释与标识符用英文;对外说明/文档用中文(pi 项目惯例)。
- 入口统一 `export default function` 接收 `ExtensionAPI`,注册逻辑写在函数体内。
- 无构建步骤,源码即发布物;保持 `.ts` 可被 pi 的 bun 直接加载。
- 单扩展单目录(`extensions/<name>/` 放 README),与入口文件同基名。
- `typebox` 版本锁死(当前 `1.3.8`,取自用环境);发布前确认公网可解析。

## Rules

- 扩展以 pi 包分发,**必须**在 `package.json` 声明 `pi.extensions` 入口;漏写则不被加载。
- 安装 npm 包后,删掉 `~/.pi/agent/extensions/` 下的本地同名副本,避免同一扩展被加载两次(`extensions/` 自动扫描 + npm 包加载会双加载)。[来源: extensions/proactive-compact/README.md]
- 扩展在 pi 中拥有完整系统权限;装第三方/他人扩展前先审源码(同 pi 包安全模型)。
- [推断] 提交信息沿用 `type(范围): 中文简述`(参考作者其他仓库);未强制,可改。
