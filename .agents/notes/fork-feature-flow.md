# fork 自研功能的 PR 流程（功能分支 → 承载分支 → 上游 PR → fork `main`）

适用于 fork 自研的功能与修复。导入上游第三方 PR 走另一条通路，见 `upstream-pr-flow.md`。

`AGENTS.md` 只负责在这些场景出现时指向本文；步骤、命令、冲突处理与踩坑都收在这里。

## 1. 前置条件（一次性）

```sh
git remote -v                                  # 按 URL 判断谁是 fork、谁是上游
git branch --set-upstream-to=fork/main main
gh auth switch --user graydovee && gh api user --jq .login   # 输出 graydovee
```

## 2. 第 1 步：开功能分支并开发

- 从 `fork/main` 切 `feat/<slug>` / `fix/<slug>`；一个功能一条分支。
- 在独立 worktree 里开发，`git worktree` 让在用的 checkout 保持不动。
- 功能完成后提交一次收敛的 commit（`feat|fix(scope): 中文摘要`），按第 7 节矩阵跑门禁。

```sh
git fetch fork --prune
git worktree add ../dsh-browser-$slug -b feat/$slug fork/main
cd ../dsh-browser-$slug && pnpm install --frozen-lockfile

# 开发……
pnpm typecheck && pnpm test
git add -A && git commit -m "feat(panel): <中文摘要>"
```

扩展界面改动需要真机验证时，按第 7 节的安装步骤把产物同步到 `~/.dsh/browser-extension`，再到 `chrome://extensions` 重新加载扩展。

## 3. 第 2 步：合入承载分支 `omdsh-dev/dsh-browser`

- 承载分支承载产品改动：`extensions/`、`packages/` 的源码与测试，以及新功能的使用文档。
- 把功能分支的提交 **cherry-pick** 到承载分支，让 fork 侧的 CHANGELOG、版本号、发布接线留在 `main` 一侧。
- 合入后跑一遍门禁，再把承载分支推到 fork。

```sh
git worktree add ../dsh-browser-pr omdsh-dev/dsh-browser
cd ../dsh-browser-pr && pnpm install --frozen-lockfile
git cherry-pick <feature-sha>
pnpm typecheck && pnpm test
git push fork omdsh-dev/dsh-browser
```

冲突处理见第 6 节。承载分支的 README 是面向上游的版本（上游链接、上游安装命令），功能段落与 `main` 侧文本一致，可整段搬过来。

## 4. 第 3 步：同步上游 PR #121

**描述**：顶部保留指向 fork `CHANGELOG.zh-CN.md` 的链接；条目只放中文、按日期倒序平铺、不带版本段落；新条目插在最前。上游汇总 PR #121 的标题说明性质与维护方式，具体功能由描述条目与评论承载。

```sh
gh pr view 121 -R omdsh-dev/dsh-browser --json body --jq .body > /tmp/body.md
# 编辑 /tmp/body.md：把新条目插到第一条 changelog 之前
gh pr edit 121 -R omdsh-dev/dsh-browser --body-file /tmp/body.md
```

**评论**：一条功能一条评论，结构为 `概述 / Summary`、`动机 / Motivation`、`改动内容 / Changes`、`测试 / Testing`、`影响范围 / Impact`；按合入时间正序追加，并在评论里引用 fork 内承载该功能的 PR。

```sh
gh pr comment 121 -R omdsh-dev/dsh-browser --body-file /tmp/comment.md
```

评论里的引用写成：`对应代码改动与 changelog 条目见 fork 仓库 PR [#N](https://github.com/graydovee/dsh-browser/pull/N)`。

## 5. 第 4 步：开 PR 合入 `main`

- 从 `main` 切 PR 分支，`--no-ff` 合并承载分支，保留"这个功能来自哪条承载分支"的痕迹。
- 在同一分支上提交 changelog（`## latest` 顶部各一条，中英一一对应）。
- 代码与 changelog 放在**同一个 PR** 里提交，PR 标题写具体功能（如 `feat(panel): …`）。
- PR 正文按 `.github/PULL_REQUEST_TEMPLATE.md` 填；"测试"一节写实际跑过的命令与结果，真机手测写浏览器与边界路径。

```sh
git fetch fork --prune
git worktree add ../dsh-browser-main main      # main 被别的 checkout 占用时，从 fork/main 建临时分支
cd ../dsh-browser-main
git checkout -b feat/$slug-to-main

git merge omdsh-dev/dsh-browser --no-ff -m "merge: 同步承载分支（<功能>）"

git add CHANGELOG.md CHANGELOG.zh-CN.md
git commit -m "docs(changelog): 记录<功能>"
git push fork feat/$slug-to-main

gh pr create -R graydovee/dsh-browser --base main --head feat/$slug-to-main \
  --title "feat(<scope>): <功能>" --body-file /tmp/pr.md
```

`main` 迭代较快（常有并行的上游 PR 导入）。开 PR 后到合并前反复追平，然后重跑门禁：

```sh
git fetch fork --prune && git merge fork/main
```

合并后核对 `main` 的 CI：

```sh
gh run list -R graydovee/dsh-browser --limit 3        # main 上那条为 success
```

## 6. 冲突处理

| 冲突文件 | 处理 |
|---|---|
| `README.i18n.yaml`（承载分支上的 cherry-pick、以及每次把 `main` 合进 PR 分支） | 按**合入后**的文件重算哈希：`git hash-object <file>`。yaml 里的标签是 `README.md:` / `README.zh.md:`（不是文件路径），按标签替换对应两行 |
| `CHANGELOG*` 顶部（`main` 又合并了别的功能） | 两边条目都保留：本 PR 条目置顶，其余按 `main` 原顺序 |
| 其他文件的冲突 | 逐段并集；解决后 `git diff <merge base>..HEAD --stat` 核对文件集 |

## 7. 验证矩阵

| 改动面 | 必跑 |
|---|---|
| 任何功能改动 | `pnpm run typecheck`、`pnpm run test` |
| 改 wire 帧 / Host 方法 / 工具契约 / 认证与信任边界 | 上面 + `pnpm run check:runtime` + `node scripts/smoke-runtime.mjs` |
| 动 `manifest*.json`（尤其 `key`）或版本号 | **先 `pnpm run build` 再 `pnpm run test`**：`packages/browser/bridge-browser/tests/e2e/bridge-extension.e2e.spec.ts` 读 `extensions/dsh-browser/dist`，旧产物会让 pinned extension id 断言假红 |
| 扩展界面改动 | 上面全跑 + 本机安装产物后手测 |
| 纯文档 | 文档校对即可 |

本机手测安装（不跑完整 `install.sh` 时）：

```sh
pnpm --filter dsh-browser-extension run build
cp ~/.dsh/browser-extension/install-info.json /tmp/install-info.backup.json
rsync -a --delete-after extensions/dsh-browser/dist/ ~/.dsh/browser-extension/
cp /tmp/install-info.backup.json ~/.dsh/browser-extension/install-info.json   # rsync --delete 会带走它
```

然后到 `chrome://extensions` 点该扩展卡片的「重新加载」。扩展改动即时生效，不需要重启 dsh。

## 8. 禁止事项

- 删除、改名或强推 `omdsh-dev/dsh-browser`：需要重整时在上面追加提交。
- 把 `CHANGELOG*`、`AGENTS.md`、`updates.ts` / `install.*`、版本号、CI 配置提交进承载分支。
- 用 `git merge` 把基于 `main` 的功能分支整体合进承载分支（会带入 fork 接线）；改用 `cherry-pick`。
- 用 `--ours` / `--theirs` 整体回退冲突文件（会吞掉另一侧内容）。
- 为同一功能在上游 PR 再发一条补充评论；改为就地 `PATCH` 修正。
- 直接 `git push` 到 `main`：只能通过 PR 合入（见 `AGENTS.md`《`main` 分支保护》）。

## 9. 收尾

```sh
git worktree remove --force ../dsh-browser-pr ../dsh-browser-main ../dsh-browser-$slug
git push fork --delete <已合并的临时分支>
git branch -D <已合并的临时分支>
```

## 10. 实例：2026-10-19「页面交接提示新增跳转回到助手页面」

| 环节 | 结果 |
|---|---|
| 功能分支 | `feat/tab-return-to-assistant-page`（独立 worktree），`7e96df78` |
| 合入承载分支 | cherry-pick → `4ceca77f`，冲突只在 `README.i18n.yaml` 两行哈希 |
| 上游 PR #121 | 描述插入中文条目；评论五段结构 + 引用 fork PR #10 |
| 到 main 的 PR | fork PR #10（代码 + changelog）；期间 `main` 连续前进 4 次，每次追平后重解 CHANGELOG 顶部冲突并重跑门禁 |
| main | `29045fee`，合并后 CI `success` |

本轮修正（已并入上文）：到 `main` 的 PR 携带代码与 changelog 两部分（第 5 步）；PR 标题写具体功能（第 5 步）；上游评论引用 fork PR（第 4 步）。
