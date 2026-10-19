# 上游 PR 引入台账

记录上游 `omdsh-dev/dsh-browser`（本文称「上游」）待导入本 fork `graydovee/dsh-browser`（「fork」）的 PR：判定、来源 SHA、落地 fork PR 与 merge SHA。流程见 `AGENTS.md`《上游 PR 引入流程》。

判定取值：`adopt` / `adopt-partial` / `duplicate` / `reject` / `defer`。状态取值：`pending` / `open` / `merged` / `reverted` / `skipped`。

## 台账

| PR | 作者 | 判定 | 分支 | 源 SHA | fork PR | merge SHA | changelog | 状态 |
|---|---|---|---|---|---|---|---|---|
| [#92](https://github.com/omdsh-dev/dsh-browser/pull/92) 滚动内层容器 | @happinessisreal | adopt | `upstream/92-scroll-nested` | `a99933c` | - | - | `## latest` | pending |
| [#125](https://github.com/omdsh-dev/dsh-browser/pull/125) 新窗口工具 | @zzalancelot | adopt | `upstream/125-open-window` | `2c12f81` | - | - | `## latest` | pending |
| [#99](https://github.com/omdsh-dev/dsh-browser/pull/99) 发现路由 CORS | @PerryLink | adopt-partial（另需适配 fork 的发现信标） | `upstream/99-discovery-cors` | `fa39152` | - | - | `## latest` | pending |
| [#110](https://github.com/omdsh-dev/dsh-browser/pull/110) 扩展 origin 白名单 | Toto Leung (@chintoleung) | adopt | `upstream/110-extension-origin-pin` | `a118d3a` | - | - | `## latest` | pending |

已导入（历史）：[#111](https://github.com/omdsh-dev/dsh-browser/pull/111) 支付/密码字段多段自动填充掩码，merge `06f8179`（2026-10-19）。

## 分诊判据

- 价值：安全/正确性 > dsh 运行时兼容 > 新工具/能力 > 重构 > 纯文档；低价值 defer。
- 重复度检测（每个候选都跑）：

  ```sh
  git log --oneline main -- <PR 触及的路径>
  git cherry -v main origin/pr/<n>
  git diff main...origin/pr/<n> -- <关键文件>
  grep -n "<功能关键词>" CHANGELOG*.md
  ```

- 风险面：改 wire 协议 / manifest 权限 / 依赖 / 高权限工具 → 强制安全评审 + `node scripts/smoke-runtime.mjs`。
- 无测试的 PR 不合入；由 fork 补 vitest，放在 `adapt(upstream)` 提交里并注明 based on #<n>。
- 上游的 `0.2.0-rc.x` 写法统一改为本 fork 的 `0.2.1-rc.2`。
- 与 fork 自研功能重叠的部分以上游最终版为准，删除 fork 等价实现，单独成一个收敛提交。

## 命令清单

先让上游 PR ref 可 fetch（一次性配置）：

```sh
git config --add remote.origin.fetch '+refs/pull/*/head:refs/remotes/origin/pr/*'
git fetch origin
```

单个 PR 的导入流程：

```sh
n=92; slug=scroll-nested
git checkout main && git fetch fork && git merge --ff-only fork/main
git checkout -b upstream/$n-$slug main

git log --oneline main..origin/pr/$n
git cherry -v main origin/pr/$n

git merge --no-ff origin/pr/$n -m "merge(upstream): #$n <title>" \
  -m "Upstream-PR: https://github.com/omdsh-dev/dsh-browser/pull/$n
Source: origin/pr/$n @ <sha>
Author: <name> <email>"

# 冲突/对齐 fork 契约：单独提交
# git commit -m "adapt(upstream): #$n <适配说明>"

pnpm run typecheck && pnpm run check:runtime && pnpm run test && pnpm run build
# 触碰 wire/Host/工具契约或认证面时再加：
# node scripts/smoke-runtime.mjs

# changelog（中英各一条，含致谢）随本分支提交后再推

git push -u git@github.com:graydovee/dsh-browser.git upstream/$n-$slug
gh pr create -R graydovee/dsh-browser --base main --head upstream/$n-$slug \
  --title "feat(upstream #$n): <摘要>" --body-file /tmp/pr-$n.md
gh pr checks -R graydovee/dsh-browser --watch

gh pr merge -R graydovee/dsh-browser <num> --merge --delete-branch \
  --subject "merge(upstream): #$n <title>" \
  --body "Upstream-PR: https://github.com/omdsh-dev/dsh-browser/pull/$n
Source: origin/pr/$n @ <sha>
Author: <name> <email>"

git log -1 --format=%B $(gh pr view <num> -R graydovee/dsh-browser --json mergeCommit --jq .mergeCommit.oid)
```

## 边界与失败模式

- 导入物不进 `omdsh-dev/dsh-browser`（PR #121）：那条分支继续只装 fork 自研功能。
- 不回滚已合并的导入时用 `git revert -m 1 <merge sha>`，台账改 `reverted` 并写原因。
- 上游日后合入同一 PR：因保留原 SHA 与作者，`git merge origin/main` 通常是干净的三方合并；异常时用 `git cherry -v origin/main main` 复核并记台账。
- 上游若 rebase/squash 成新 SHA：内容通常仍自动合并，台账记复核结果。
