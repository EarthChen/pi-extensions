# AGENTS.md

> pi 扩展集合(pnpm workspace monorepo)的代理指南。代码细节以源码为准。

## Project

个人维护的 [pi](https://github.com/badlogic/pi-mono) 扩展集合,以 **pnpm workspace monorepo** 组织:每个扩展是独立 npm 包(可独立安装),但**共享一个版本号**。[推断] 定位为按需扩充的个人扩展库,非独立产品。

## Stack

- 语言/运行时: TypeScript(裸 TS,无构建步骤;pi 用 bun 直接加载 `.ts`)
- 扩展 API: `@earendil-works/pi-coding-agent`(peerDependency,由 pi 运行时提供)
- 运行时依赖: `typebox`(工具参数 schema)
- 包管理器: pnpm + workspace
- 分发: 每扩展独立 npm 包(`@earthchen/pi-ext-<name>`)/ git(`pi install`)

## Commands

- 安装 workspace: `pnpm install`
- 同步共享版本: `node scripts/sync-version.mjs`(根 `version` → `packages/*/package.json`)
- 发布全部: `pnpm -r publish`(需先提交;pi 要求干净工作树)
- 发布单个: `pnpm --filter @earthchen/pi-ext-<name> publish`
- [缺] 无 build / test / lint 脚本(裸 TS,经 pi 运行时校验)
- [注] `pnpm run version:sync` 在部分 pnpm 版本会因依赖构建检查失败,直接用 `node` 命令绕过。

## Architecture

- 仓库根 `package.json`(`private: true`)持有**共享版本号**这一单一事实源;`pnpm-workspace.yaml` 声明 `packages/*`。
- `scripts/sync-version.mjs`:把根 `version` 同步进每个 `packages/<name>/package.json`,强制多包同版本。
- 每个扩展 = `packages/<name>/`:独立 `package.json`(name `@earthchen/pi-ext-<name>`)、`<name>.ts`(默认导出 `ExtensionAPI` 注册函数)、`README.md`、`LICENSE`。
- 每包的 `pi.extensions: ["./<name>.ts"]` 是该扩展的安装入口;装 `npm:@earthchen/pi-ext-<name>` 只装这一个。

## Conventions

[推断] 自代码观察:
- 注释与标识符用英文;对外说明/文档用中文(pi 项目惯例)。
- 入口统一 `export default function` 接收 `ExtensionAPI`,注册逻辑写在函数体内。
- 无构建步骤,源码即发布物;保持 `.ts` 可被 pi 的 bun 直接加载。
- 包名 `@earthchen/pi-ext-<name>`;版本由根同步,**不要**手动改各包 `version`。
- `typebox` 版本锁死(当前 `1.3.8`,取自用环境);发布前确认公网可解析。

## Rules

- 加扩展必须新建 `packages/<name>/` 并跑 `pnpm version:sync`,保证版本与根一致;漏同步会导致发版版本错乱。
- 扩展以 pi 包分发,每包 `package.json` **必须**声明 `pi.extensions` 入口;漏写则不被加载。
- 安装某扩展后,删掉 `~/.pi/agent/extensions/` 下的本地同名副本,避免同一扩展被加载两次。[来源: packages/proactive-compact/README.md]
- 扩展在 pi 中拥有完整系统权限;装第三方/他人扩展前先审源码(同 pi 包安全模型)。
- [推断] 提交信息沿用 `type(范围): 中文简述`(参考作者其他仓库);未强制,可改。
