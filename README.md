# pi-extensions

[EarthChen](https://github.com/EarthChen) 的 [pi](https://github.com/badlogic/pi-mono) 扩展集合。**pnpm workspace monorepo**:每个扩展是独立 npm 包(可独立安装),但**共享同一个版本号**。

## 扩展

| 扩展 | 安装命令 | 文档 |
|------|----------|------|
| `proactive-compact` | `pi install npm:@earthchen/pi-proactive-compact` | [packages/proactive-compact/README.md](packages/proactive-compact/README.md) |

## 安装某个扩展

```bash
pi install npm:@earthchen/pi-proactive-compact
```

pi 自动加载 `~/.pi/agent/npm/` 下的扩展,重启(或 `/reload`)生效。每个扩展独立安装、独立启用,互不影响。

## 新增扩展

1. 建 `packages/<name>/`,含 `package.json`(name `@earthchen/pi-<name>`、入口 `pi.extensions: ["./<name>.ts"]`)、`<name>.ts`(默认导出 `ExtensionAPI` 注册函数)、`README.md`、`LICENSE`。
2. 跑 `node scripts/sync-version.mjs` 把根版本号同步进该包。
3. `pnpm -r publish`(见下)发布。

## 发布(共享版本)
>
> 自动发版(打 tag 触发 CI)的完整流程与前置条件见 [RELEASING.md](./RELEASING.md);下方为本地手动兜底命令。

版本号单一事实源在仓库根 `package.json` 的 `version`。

```bash
pnpm install                     # 解析 workspace
node scripts/sync-version.mjs   # 根 version → packages/*/package.json(共享版本同步)
pnpm -r publish                 # 发布所有扩展(同版本);pi 要求先提交(干净工作树)
```

> [注] `pnpm run version:sync` 在部分 pnpm 版本会因依赖构建状态检查(`ERR_PNPM_IGNORED_BUILDS`)失败;直接用上面的 `node` 命令即可绕过。
> npm 不允许重发同一版本;每次 bump 根版本后,所有扩展一起以新版本发布。若只想发某个扩展:`pnpm --filter @earthchen/pi-<name> publish`(需先同步版本)。
