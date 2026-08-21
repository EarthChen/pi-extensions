# 发版流程 (RELEASING)

**结论**:发版 = 在 `main` 分支打 `vX.Y.Z` tag 并推送 → GitHub Actions(`.github/workflows/release.yml`)自动把所有扩展以同一版本发布到 npm。无需手工 `pnpm publish`。

版本号单一事实源是仓库根 `package.json` 的 `version`。所有 `packages/*` 共享此版本,由 `scripts/sync-version.mjs` 同步。

## 前置条件

- 仓库 `Settings → Secrets and variables → Actions` 已配置 `NPM_TOKEN`,值为具有 **publish** 权限的 npm token(`npm token create --type CI`)。缺失会导致 CI 401。
- 发布使用的 `pnpm`/`node` 版本与本地一致(pnpm 11、Node 22,见 workflow)。

## 自动发版链路(CI 做了什么)

`push` 触发 `tags: ["v*"]` 后,`release.yml` 依次执行:

1. **Checkout**(fetch-depth: 0,保留完整历史以便解析 `origin/main`)。
2. **校验 tag 在 main**:git tag 不绑定分支,用 `git merge-base --is-ancestor <tag-commit> origin/main` 校验 tag 指向的 commit 是 `origin/main` 的祖先;否则中止。
3. **校验版本**:tag(去掉 `v` 前缀)必须等于根 `package.json` 的 `version`,否则中止——防止发错号。
4. `pnpm install --frozen-lockfile`:lockfile 只记依赖、不记 workspace 包版本,bump 版本不会使其失效,冻结模式安全。
5. `node scripts/sync-version.mjs`:把根版本写进每个 `packages/<name>/package.json`(会改写文件)。
6. `pnpm -r publish --access public --no-git-checks`:
   - `--access public`:scoped 包(`@earthchen/*`)默认私有,必须显式公开否则 403。
   - `--no-git-checks`:上一步改写了 package.json,工作树变脏,必须关掉 pnpm 的 git 检查,否则 publish 失败。
   - 根包 `private: true` 会被自动跳过,只发 `packages/*` 下的非私有包。

## 如何切一个发布

推荐用辅助脚本(自动 bump 根版本、同步、提交、打 tag、按正确顺序推送):

```bash
./scripts/release.sh 0.2.0
# 等价: bump 根 version → sync-version → commit → git tag v0.2.0
#      → git push origin main → git push origin v0.2.0
```

脚本前置校验:必须在 `main`、工作树干净、版本号符合 semver。它**先推 main 再推 tag**,避免 CI 在 `main` 尚未推送时误判“tag 不在 main 上”。

手动等价步骤:

```bash
# 1. 在 main 上,改根 package.json version
# 2. 同步各包版本
node scripts/sync-version.mjs
pnpm install --frozen-lockfile
git add -A && git commit -m "chore: release vX.Y.Z"
# 3. 先推 main,再打 tag 并推送(顺序很重要)
git push origin main
git tag vX.Y.Z
git push origin vX.Y.Z
```

## 关键约束

- **tag 必须在 `main` 上**:见上方“校验 tag 在 main”。从 feature 分支或非 main 历史打 tag 会被 CI 拒绝。
- **tag 版本必须匹配根版本**:`v0.2.0` ↔ 根 `package.json` 的 `0.2.0`。不一致 CI 直接中止。
- **npm 不可重发同一版本**:每次发版必须先 bump 根 `version`。重发会 403;若要改已发版本,只能升版本。
- **共享版本**:一次发版所有扩展同版本一起发布。只发单个扩展用 `pnpm --filter @earthchen/pi-<name> publish`(仍需先 sync-version,且通常走本地兜底而非 CI)。

## 本地兜底(手工 publish)

CI 不可用时的本地发版(不走自动化,需自管 token/工作树):

```bash
pnpm install --frozen-lockfile
node scripts/sync-version.mjs
pnpm -r publish --access public --no-git-checks
# 认证:本地 ~/.npmrc 配置 //registry.npmjs.org/:_authToken=<token>
```

## 可选加固

- **钉死 Action 版本**:`release.yml` 当前用 `actions/checkout@v4` 等主版本 tag。zizmor 建议 pin 到 commit SHA 以防 action 被篡改。需要更高安全级别时再改。
