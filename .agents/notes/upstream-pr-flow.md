# 上游 PR 引入流程（fork 内 PR → fork `main`）

上游 `omdsh-dev/dsh-browser` 停更期间，本 fork（`graydovee/dsh-browser`）需要把上游待合入的第三方 PR 搬进来。本文是该通路的**唯一权威说明**；`AGENTS.md` 只给定位与本文链接，细则全部收在本文。导入的事实记录在 git 历史、fork PR 与上游 issue 的合入清单评论里，按需直接查询（见第 9 节）。

## 1. 适用范围与不变量

| # | 规则 | 为什么 |
|---|---|---|
| 1 | **唯一入口是 fork 内 PR**（base `graydovee/dsh-browser:main`），不允许本地合完直接推 `main` | CI 门禁、公开可审计记录、原作者可见的反向链接、按 PR 回滚 |
| 2 | **导入物只进 fork `main`**，不进承载分支 `omdsh-dev/dsh-browser`（PR #121） | 那条分支只装 fork 自研功能，避免把别人的工作打包回上游 |
| 3 | **一上游 PR 一 fork PR**；分支 `upstream/<n>-<slug>` 从当前 `main` 切出 | 归因与回滚粒度 = 一个上游 PR |
| 4 | **只允许 merge commit**：`git merge --no-ff` 保留原提交与作者；禁 squash / rebase / reword / `--reset-author` | 上游日后合入同一 PR 时能干净三方合并 |
| 5 | **冲突与对齐 fork 契约的改动单独成提交**：`adapt(upstream): #<n> <说明>` | 上游内容与我们适配可分别审计、分别回滚 |
| 6 | **上游 CI 红的不导入** | 先修好或 defer，不在 fork 里替上游背红 |
| 7 | **changelog 随该 PR 一起提交**：中英各一条 + 致谢尾注 | 一次合并一条，漏 changelog 视同没合 |
| 8 | **合并后核对 trailer**，并把结果同步到上游 issue 清单评论 | 留名三处：git author（主证据）、合并提交 trailer、fork PR 正文；对外索引写在上游 issue 的清单评论里 |

不做的事：不替上游维护者关闭/合并 PR；不在上游仓库提交代码（可选的致谢/通知评论除外）；不改远端命名。

## 2. 一次性准备（本地配置，不入库）

```sh
# 远端名称各 checkout 可能不同，先看 URL 判断谁是谁
git remote -v

# main 跟随 fork（否则 git pull/push 方向会错）
git branch --set-upstream-to=fork/main main

# 让上游 PR ref 可 fetch
git config --add remote.origin.fetch '+refs/pull/*/head:refs/remotes/origin/pr/*'
git fetch origin

# gh 账号（操作 fork 仓库时）
gh auth switch --user graydovee && gh api user --jq .login

# 若本机 HTTPS 凭据不可用，push 用 SSH URL
git push -u git@github.com:graydovee/dsh-browser.git <branch>
```

## 3. 分诊：这个上游 PR 要不要导入

| 维度 | 用法 |
|---|---|
| 价值 | 安全/正确性 > dsh 运行时兼容 > 新工具/能力 > 重构 > 纯文档 |
| 重复度 | 完全重复 → 只回填致谢（不导入）；部分重复 → 只取增量 |
| 风险面 | 改 wire 协议 / manifest 权限 / 依赖 / 高权限工具（eval、devtools、截图、`<all_urls>`）→ 强制安全评审 + 真机冒烟 |
| 可维护性 | diff 规模、是否带测试、上游 CI 是否绿；无测试的先由 fork 补 vitest |
| 作者状态 | 分支是否活跃；停更分支的收敛成本写进 fork PR 正文的备注 |

判定取值：`adopt` / `adopt-partial` / `duplicate` / `reject` / `defer`。

```sh
n=92
gh pr view $n -R omdsh-dev/dsh-browser            # 描述/CI/评论
git log --oneline main..origin/pr/$n               # 这条分支带了哪些提交
git cherry -v main origin/pr/$n                    # main 是否已有等价补丁（空=没有）
git diff main...origin/pr/$n -- .github scripts package.json pnpm-lock.yaml CHANGELOG*  # 有没有夹带
grep -n "<功能关键词>" CHANGELOG*.md
```

## 4. 单个 PR 的完整流程

```sh
n=92; slug=scroll-nested

# ① 基线：本地 main 与 fork 对齐，基线绿（首次需 CI=true pnpm install --frozen-lockfile）
git checkout main && git fetch fork --prune && git merge --ff-only fork/main
CI=true pnpm run typecheck && CI=true pnpm run test

# ② 新分支
git checkout -b upstream/$n-$slug

# ③ 合入上游（默认方式）
git merge --no-ff origin/pr/$n -m "merge(upstream): #$n <上游标题>" \
  -m "Upstream-PR: https://github.com/omdsh-dev/dsh-browser/pull/$n
Source: origin/pr/$n @ <上游 head sha>
Author: <上游作者> <邮箱>"

# ④ 冲突/对齐 fork 契约 → 单独提交（见第 5 节）
# git commit -m "adapt(upstream): #$n <适配说明>"

# ⑤ 验证（见第 6 节矩阵）
CI=true pnpm run typecheck && CI=true pnpm run check:runtime
CI=true pnpm run build && CI=true pnpm run test
node scripts/smoke-runtime.mjs     # 需要时

# ⑥ changelog（中英各一条 + 致谢），随分支提交
# ⑦ 推送并开 PR
git push -u git@github.com:graydovee/dsh-browser.git upstream/$n-$slug
gh pr create -R graydovee/dsh-browser --base main --head upstream/$n-$slug \
  --title "feat|fix(upstream #$n): <摘要>" --body-file /tmp/pr-$n.md

# ⑧ 等 CI 绿
gh pr checks <fork 号> -R graydovee/dsh-browser --watch --interval 15

# ⑨ 合并（merge commit，提交信息带 trailer）
gh pr merge <fork 号> -R graydovee/dsh-browser --merge --delete-branch \
  --subject "merge(upstream): #$n <上游标题>" \
  --body "Upstream-PR: https://github.com/omdsh-dev/dsh-browser/pull/$n
Source: origin/pr/$n @ <sha>
Author: <name> <email>
Adaptation: 无 | <一句话>"

# ⑩ 核对 trailer
git fetch fork --prune
git log -1 --format=%B fork/main | sed -n '1,8p'      # Upstream-PR / Source / Author 在不在
```

特殊情况：
- 上游分支夹带无关提交/合并提交 → `git cherry-pick -x <sha>…` 只取该 PR 自己的提交（保留 author，丢原 SHA，在 PR 正文注明取舍）。
- 上游分支已删除、fetch 不到 → `curl -L https://github.com/omdsh-dev/dsh-browser/pull/<n>.patch | git am -3`（兜底）。
- 需要 `origin/pr/<n>/merge`（合入上游 main 的预演）时只作参考，导入始终以 `head` 为准。

## 5. 冲突与适配策略

| 冲突文件 | 处理 |
|---|---|
| `scripts/install.*`、`extensions/dsh-browser/src/panel/updates.ts`、（fork 的）发布/更新源接线 | 保留 fork 版本，绝不回退成上游写法 |
| 版本号（根/`extensions/dsh-browser/package.json`、`manifest*.json`） | 保留 fork 版本；上游的 bump 一律丢弃（fork 自己按发布节奏 bump） |
| `CHANGELOG*`、`AGENTS.md`、`.github/workflows/*`、`README.i18n.yaml` | 保留 fork 版本 |
| 桥插件 / 扩展产品代码 | 以上游为准；与 fork 自研功能语义冲突时手工并集，必要时拆 `adapt` 提交 |
| `pnpm-lock.yaml` | 重新 `pnpm install` 生成，不手工合并；`@deepseek-ai/*` 仍在 `0.2.1-rc.x` 线 |
| 文档里写死的上游版本号（如“dsh 0.2.0-rc.2”） | 统一改成 fork 的 `0.2.1-rc.3` |
| 升级提示里的具体版本号（如“从 0.1.5 之前升级”） | 改成不猜版本号的措辞（“从旧构建升级”），中英与两个安装脚本一致 |

**踩坑记录（务必避免）**：`git checkout --ours <file>` 会把该文件**整体**回退到 Header 版，**连带丢掉上游自动合并成功的新增行**（2026-10-19 导入 #110 时，`manifest.json` 的 stable `key` 就是这样被抹掉的）。正确做法二选一：

1. 手工解除冲突（删除 `<<<<<<<`/`=======`/`>>>>>>>` 后并集），保留上游新增、只挑版本行用 ours；或
2. 用 `--ours` 后**立刻补回**上游新增字段，并跑测试确认（例如 `key` 必须在，且扩展 id 派生测试通过）。

冲突解决后要单独核对：上游新增的配置项/常量/测试是否都在、fork 的既有功能是否还在、`git diff <merge base>..HEAD --stat` 是否与预期文件集一致。

## 6. 验证矩阵

| 改动面 | 必跑 |
|---|---|
| 任何导入 | `pnpm run typecheck`、`pnpm run check:runtime`、`pnpm run build`、`pnpm run test` |
| 改 wire 帧 / Host 方法 / 工具契约 / 认证与信任边界 / 发现路由 | 上面全跑 + `node scripts/smoke-runtime.mjs` |
| 扩展侧界面行为 | `pnpm run build`（e2e 需要 `extensions/dsh-browser/dist`）后跑 `pnpm run test`；本机有 playwright chromium 时 e2e 会真跑，无则 `SKIP`（在 PR 正文注明） |
| `manifest` 权限 / 高权限工具 | 逐项评审新增权限能否从功能推导，并同步 README 隐私/安全说明 |

`pnpm` 在非 TTY 下会因自动 install 报 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，脚本化执行时统一加 `CI=true`。

已知偶发：`tests/composition.spec.ts > registers the developer-tools group …` 在机器高负载时可能超时（单跑必过），CI 绿即视为通过，必要时重跑。

## 7. changelog 与致谢

- 中英各一条，加在 `## latest` 段最上方，跟随该导入 PR 一起提交（写法见 `AGENTS.md`《CHANGELOG 规则》）。
- 只写用户可见能力，不写实现细节（方法名、字段名、协议名、文件路径、commit hash）。
- 末尾回填致谢：中文 `（感谢 @handle）`，英文 `(thanks @handle)`。
- 一次合并只写一条；同一 PR 的后续提交**改写**这条，不新增。

## 8. fork PR 正文结构

首段固定头部块，其余按 `.github/PULL_REQUEST_TEMPLATE.md`：

```markdown
## 原始 PR / Upstream PR

- https://github.com/omdsh-dev/dsh-browser/pull/<n>
- 作者 / Author: @<handle>
- 来源 / Source: `origin/pr/<n> @ <sha>`
- 合并方式 / Integration: `merge --no-ff`（保留原提交与作者）
- 适配 / Adaptation: 无 | <说明>

## 概述 / Summary
## 动机 / Motivation
## 改动内容 / Changes      ← 含 adapt 提交要点
## 测试 / Testing          ← 命令 + 结果 + 平台
## 影响范围 / Impact        ← 平台/浏览器/权限/升级影响
## changelog              ← 中英各一行
## Checklist
```

## 9. 记录落在哪里

导入的事实分布在下面几处，需要时按「查法」一列直接查：

| 记录 | 位置 | 查法 |
|---|---|---|
| 谁写的、哪次上游提交 | git author（未改写） | `git log --format='%h %an <%ae> %s' fork/main --not origin/main` |
| 来自哪个上游 PR、哪个 SHA、有无适配 | 合并提交 message 的 trailer | `git log -1 --format=%B <merge sha>` |
| 为什么导入、改了什么、怎么验证 | fork PR 正文（头部块 + 模板五段） | fork PR 页面 |
| 对外索引（上游能看到的汇总） | 上游 issue 的合入清单评论（见第 13 节） | `gh issue view 120` |
| 用户可见变化与致谢 | `CHANGELOG.md` / `CHANGELOG.zh-CN.md` | 仓库根目录 |

判断某个上游 PR 是否已导入：`git log --merges fork/main --grep 'merge(upstream): #<n>'`；判断内容是否等价：`git cherry -v origin/main fork/main`。

## 10. 回滚与上游后续收敛

- 回滚单个导入：`git revert -m 1 <merge sha>`，在 revert 提交信息里写原因，并同步更新上游 issue 的清单评论。
- 上游恢复维护后：常规同步 `git fetch origin main && git merge origin/main`；因为保留了原 SHA 与作者，通常干净三方合并。
- 上游若 rebase/squash 成新 SHA：内容一般仍自动合并；用 `git cherry -v origin/main main` 复核，结论写在 fork PR 或上游 issue 评论里。
- 上游最终合入与本 fork 同题的 PR：以上游最终版为准，删掉 fork 的等价实现，单独成一个收敛提交，保留 changelog 与致谢。

## 11. 失败模式速查

| 情况 | 处理 |
|---|---|
| 上游 PR CI 红 | 不导入；适配提交里修好并注明，或 `defer` |
| 夹带无关文件/版本号/工作流改动 | `cherry-pick -x` 只取相关提交，或适配提交剔除 |
| 作者 force-push / 删分支 | `.patch` + `git am -3` 兜底，在 PR 正文记 URL 与抓取时间 |
| 两个上游 PR 改同一文件 | 逐个按序导入，各自独立跑门禁，不合簇归因 |
| `gh` 未认证 / 令牌不可用 | `gh auth login` 或改用网页；本地流程照旧 |
| 导入后出现回归 | `git revert -m 1` + 更新 issue 清单评论 |

## 12. 验收命令（每个导入合并后）

```sh
# ① fork main 仍是上游超集（左侧必须是 0）
git rev-list --left-right --count origin/main...fork/main

# ② 原作者在历史里
git shortlog -sne fork/main --not origin/main | head

# ③ trailer 完整
git log -1 --format=%B fork/main | sed -n '1,8p'

# ④ 导入清单与历史一致（以 git 为准：每个 merge(upstream) 都有对应 fork PR）
git log --format='%h %s' --merges fork/main | grep 'merge(upstream)'

# ⑤ 上游 issue 的合入清单评论已更新（gh 凭据可用时）
gh issue view 120 -R omdsh-dev/dsh-browser --json comments \
  --jq '.comments[] | select(.author.login=="graydovee") | .body[0:120]'
```

## 13. 收尾：更新上游 issue 的合入清单

每批导入合入 `main` 之后，回到维护 issue <https://github.com/omdsh-dev/dsh-browser/issues/120>，更新「已合入 fork `main` 的上游 PR」清单。这是流程的**最后一步**，漏了视为本批没收尾。

规则：

- **一张表**：上游 PR → 原作者 → fork PR → fork `main` 上的 merge SHA → 备注（有无适配）。
- **引用 fork PR 用完整链接**：`https://github.com/graydovee/dsh-browser/pull/<n>`，不要只写 `#8` 这类编号（跨仓库无法解析）。
- **维护单一权威评论**：优先**编辑**已有那条清单评论（`updateIssueComment`），保持一处可查；确有需要才追加新评论并在其中重申旧表，不逐 PR 单开评论、不刷屏。
- **只写事实**：已合入的上游 PR、对应 fork PR、验证结论；不替上游维护者下结论，不关闭/合并任何上游 PR，不在上游仓库提交代码。
- **顺序**：先把 fork PR 与合并提交落定（正文、trailer 都已就位），再发/改这条评论；评论只是索引，事实以 git 与 PR 为准。
- 有新增导入时更新同一张表，并在正文里补一行「本轮新增：…」，不要重写历史条目。

命令（`gh` 可用时）：

```sh
# 找到自己那条清单评论（node id 供编辑用）
gh issue view 120 -R omdsh-dev/dsh-browser --json comments \
  --jq '.comments[] | select(.author.login=="graydovee") | {id, url, head: .body[0:80]}'

# 追加一条新评论
gh issue comment 120 -R omdsh-dev/dsh-browser --body-file /tmp/issue-120-comment.md

# 编辑已有评论（GraphQL，body 用 -F 从文件读）
gh api graphql \
  -f query='mutation($id:ID!,$body:String!){updateIssueComment(input:{id:$id,body:$body}){issueComment{url}}}' \
  -f id=<COMMENT_NODE_ID> -F body=@/tmp/issue-120-comment.md
```

`gh` 凭据不可用时（令牌在钥匙串、沙箱读不到）改用浏览器操作同一页面，产物与结论一致。

## 附录：本仓库的实例

已按本文导入：#111（fork PR #3）、#92（#8）、#125（#9）、#99（#11）、#110（#12）；适配要点见各 fork PR 正文（`Adaptation:` 一节）与合并提交的 `Adaptation:` trailer。
