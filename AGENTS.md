# Repository Guidelines

## 仓库关系与 fork 现状

本仓库是上游 <https://github.com/omdsh-dev/dsh-browser> 的 fork，fork 地址 <https://github.com/graydovee/dsh-browser>（上游旧地址 `Lum1104/dsh-browser` 会 301 过来，是同一个仓库）。

- 本文统一用「上游」指 `omdsh-dev/dsh-browser`（源仓库）、「fork」指 `graydovee/dsh-browser`；**不与本地 remote 的命名绑定**。
- 判断远端归属看 URL、不看名字：用 `git remote -v` 或 `git remote get-url <name>` 确认——URL 指向 `graydovee/dsh-browser` 的是 fork 远端，指向 `omdsh-dev/dsh-browser` 的是上游远端。不同 checkout 里它们可能叫 `origin`、`upstream`、`fork` 的任意组合，不要假设 `origin` 指向哪一边。
- 动手前先确认这两条通路已具备：能 fetch 上游 `main`（跟随上游用）、能 push 到 fork（发 PR 用）；缺哪条就按 URL 补 `git remote add`。

上游现状（2026-10-17 核对）：

- `main` 最后一次提交 2026-10-01；最后一个 release v0.1.3（2026-09-04）。
- 9 个 PR 待合入（最早的一个自 2026-09-16 起），13 个 issue 未关闭。

因此本 fork 暂时承担维护：扩展的更新检查与安装脚本指向本 fork（`extensions/dsh-browser/src/panel/updates.ts`、`scripts/install.*`），版本号推进到 v0.1.7。这些属于 fork 专有接线，**不进入对上游的 PR**。

### `omdsh-dev/dsh-browser` 分支的作用

这条分支是本仓库对上游 `omdsh-dev/dsh-browser` 的**唯一 PR 承载分支**（命名即目标仓库，方便识别 PR 去向）：

- 只放**产品改动**：`extensions/` 与 `packages/` 的源码、测试、以及新功能的使用文档；`CHANGELOG*`、`AGENTS.md`、fork 的发布/更新源接线、CI runner 钉版、版本号 bump 都不进来。
- 一律**一个 PR、一条分支**：功能分支按《分支与合入流程》合入这里，再统一进 PR；不要为不同功能另开对上游的 PR。
- **不要删除、改名或强推**：它是 PR #121 的 head（`graydovee:omdsh-dev/dsh-browser`）。需要重整时在上面追加提交。

### 当前的 issue 与 PR

- Issue：<https://github.com/omdsh-dev/dsh-browser/issues/120> —— 维护说明（上游停更期间在 fork 维护，功能整合为一个 PR，可随时合回主线）。
- PR：<https://github.com/omdsh-dev/dsh-browser/pull/121> —— `feat: 浏览器桥接新增开发者工具、视口截图与输入区控件`；base `omdsh-dev/dsh-browser:main` ← head `graydovee:omdsh-dev/dsh-browser`；规模随功能合入增长（核对时 73 文件 / +15018 −5059），以 GitHub 页面为准。
- 该 PR 是"活"的：后续每次功能更新推到同一分支，并在 PR 内回复一条评论追加 changelog 条目；issue #120 只作线索，不堆内容。

## Project Structure & Module Organization

`dsh-browser` 是一个 pnpm workspace，由浏览器扩展、dsh 桥插件与安装脚本三部分组成，改动应留在各自所属目录内：

- `extensions/dsh-browser/` — Chrome/Firefox MV3 扩展：`src/panel/`（侧栏 React 界面）、`src/background/`（service worker/事件页：桥连接、RPC 客户端、工具分发）、`src/content/`（页面快照、动作、隐私与划选）、`src/security/`（审批与可信来源）、`tests/`（vitest）。
- `packages/browser/bridge-browser/` — dsh 插件 `@yuxianglin/dsh-bridge-browser`：`src/` 是源码（`protocol.ts` 为两端共享的 wire 契约真源），`tests/`（vitest），`lib/` 是构建产物。
- `scripts/` — `install.sh` / `install.ps1`（构建 + 注册 profile + 复制扩展产物）、`smoke-runtime.mjs`（真机冒烟）、`check-runtime.mjs`、`fixtures/`。
- `benchmark/` — 快照与工具集基准；`.agents/notes/` — 设计决策记录（`implemented/` 下的既有结论优先于推测）。
- `CHANGELOG.md` / `CHANGELOG.zh-CN.md` — 逐版本用户可见变化（英文主版本 / 中文版本），按功能而非提交记录。
- `.github/PULL_REQUEST_TEMPLATE.md` — PR 模板。

## Interaction Conventions

- 面向用户的输出（说明、回答、总结）用中文；代码注释（行内、函数、包注释）保持英文。
- README 中英成对：改一侧必须同步另一侧，并用 `git hash-object <file>` 把新哈希写回对应的 `README.i18n.yaml`。
- CHANGELOG 同样中英成对（`CHANGELOG.md` 英文主版本 / `CHANGELOG.zh-CN.md` 中文版本）；语言命名跟随 README 约定，中文固定用 `.zh-CN.md` 后缀。
- 结论优先给证据：涉及平台/浏览器行为时说明实测方式（命令、平台、Chrome/Firefox 版本）。

## Build, Test, and Development Commands

```sh
pnpm install
pnpm run typecheck                      # 两个包的 tsc
pnpm run test                           # 桥插件 + 扩展的 vitest
pnpm run build                          # 构建桥插件与 Chrome 扩展产物
pnpm --filter dsh-browser-extension run build:firefox
node scripts/smoke-runtime.mjs          # 真机冒烟：临时 DSH_HOME 启动 dsh web，走真实桥协议
bash scripts/install.sh                 # 安装/升级（macOS/Linux）：构建并复制到 ~/.dsh/browser-extension
powershell scripts/install.ps1          # 安装/升级（Windows）：同上，两个脚本行为需保持一致
```

桥插件契约或 wire 帧有改动时，`pnpm run test` 之外必须跑一次 `node scripts/smoke-runtime.mjs`；它用真实 dsh 校验扩展依赖的每个 Host 方法与失败语义。

## Coding Style & Naming Conventions

- TypeScript 严格模式；扩展面板不直接访问网络或桥，一切 RPC 经 background port 转发。
- 新增面板逻辑先写成可单测的纯函数模块（参考 `src/panel/permissions.ts`、`src/panel/commands.ts`），再接入 React 组件。
- 桥侧对网关返回值做防御式解析（未知形状显式失败，用稳定 error code），不要假设 Host 一定返回完整字段。
- 文案走 `src/panel/strings.ts` 的中英双份字典，不硬编码字符串；样式统一用 `--ui-scale` 缩放。

## Testing Guidelines

- 每个行为改动补 vitest 用例：纯函数放 `tests/<module>.spec.ts`，界面行为用 jsdom 组件用例（参考 `tests/panel-composer-controls.spec.ts`）。
- 跨端契约（桥 Host 方法、协议帧、失败语义）必须在 `packages/browser/bridge-browser/tests/` 有桥侧用例，并在 `scripts/smoke-runtime.mjs` 有真机断言。
- 桥插件与扩展的既有用例不得为了让新代码通过而削弱断言；行为变化时同时更新断言与理由。

## Commit & Pull Request Guidelines

- 提交信息沿用现有风格：`feat|fix|docs|test|chore(scope): 中文摘要`，保持单次提交范围收敛、可独立回滚。
- **合入顺序见下《分支与合入流程》**；changelog 的写法见《CHANGELOG 规则》，漏更新 changelog 的分支不视为可合入。
- PR 按 `.github/PULL_REQUEST_TEMPLATE.md` 填写：说明改动、验证命令与结果、平台/浏览器影响范围。

### 分支与合入流程

fork 自研功能的开发与合入按 **`.agents/notes/fork-feature-flow.md`** 执行。遇到以下任一情况先读该文件：

- 新开 `feat/…` / `fix/…` 功能分支，或把功能分支的提交合入承载分支 `omdsh-dev/dsh-browser`；
- 更新上游 PR #121 的描述或评论；
- 给 `main` 开 PR，或在合并前把 `main` 追平到 PR 分支；
- 处理 `CHANGELOG` / `README.i18n.yaml` 冲突，或判断某项改动是否属于「产品改动」。

三项固定事实：

- 承载分支 `omdsh-dev/dsh-browser` 是对上游的 PR 承载分支（PR #121 的 head）。
- 上游恢复维护、PR 合入后，把上游 `main` 合回本仓库 `main`（同样走 `main` 的 PR），`omdsh-dev/dsh-browser` 再按下一轮功能重新积攒。
- 导入上游第三方 PR 走另一条通路，见下《上游 PR 引入流程》。

### 上游 PR 引入流程

上游 `omdsh-dev/dsh-browser` 的待合入 PR 以 **fork 内 PR** 导入 fork `main`：分支从当前 `main` 切出，base 为 `graydovee/dsh-browser:main`，用 merge commit 保留原作者与原始 SHA；导入物不进 `omdsh-dev/dsh-browser` 承载分支。

合入步骤、分诊判据、冲突与适配策略、命令清单、验证矩阵、changelog 与致谢、trailer 核对、上游 issue 清单更新、回滚与上游收敛，见 **`.agents/notes/upstream-pr-flow.md`**。

### `main` 分支保护

fork 仓库 `graydovee/dsh-browser` 的 `main` 已开启 classic branch protection（`Settings → Branches`，规则名 `main`，只匹配这一条分支）：

- **只能通过 PR 合入**：直接 `git push` 到 `main` 一律被拒；`Do not allow bypassing` 已开启（`enforce_admins`），管理员也没有旁路。
- **不需要审批**：Required approvals = 0，PR 作者可以直接合并自己的 PR，不会卡在"不能自审"。
- 禁止强推（force push）与删除 `main`；新提交会作废已有的 review approval。
- 未要求 status checks、签名提交与线性历史——测试执行力仍靠本文《Testing Guidelines》约束，不是靠 GitHub 拦。

因此 `main` 只能从分支开 PR 合入；自研功能与上游导入两条通路的 PR 步骤分别见 `.agents/notes/fork-feature-flow.md` 第 5 步和 `.agents/notes/upstream-pr-flow.md` 第 4 节。

- 本机 `gh` 配了两个账号（`dujiahui-agora`、`graydovee`），操作本仓库前先 `gh auth switch --user graydovee` 并确认 `gh api user --jq .login` 返回 `graydovee`。
- `gh` 的令牌在 macOS 钥匙串里，受限沙箱读不到（会表现为 `The token in default is invalid` / 401），需要在可访问钥匙串的环境执行。
- 应急时临时撤掉保护，改完立刻恢复：

```sh
gh api -X DELETE repos/graydovee/dsh-browser/branches/main/protection
```

恢复时回到 `Settings → Branches → Add classic branch protection rule`，规则名 `main`、勾选 `Require a pull request before merging` 并取消 `Require approvals`、`Do not allow bypassing`；或把上次的规则导出成 JSON 后用 `gh api -X PUT .../branches/main/protection --input protection.json` 提交，不要只发部分字段（PUT 会用整份规则体覆盖）。

### CHANGELOG 规则

- **changelog 的更新时机是"功能分支合入 `omdsh-dev/dsh-browser` 之后、合入 `main` 之前"**（落地方式见 `.agents/notes/fork-feature-flow.md` 第 5 步）；缺 changelog 的合并不视为完成。
- 记录逐版本的用户可见变化，最新在前；依赖版本、纯配置与纯文档调整不记。这些约束属于本文件，不要写进 changelog 正文。
- **中英双语成对**：`CHANGELOG.md` 是英文主版本（默认页），`CHANGELOG.zh-CN.md` 是中文版本；两者地位相同，同一次改动必须同时更新两侧，条目一一对应。
- **一个功能分支（一次合并）只写一条条目**：同一分支的后续提交**改写**这条条目（补全范围、修正措辞），而不是新增；只有另起一个分支做另一件事才新增条目。条目在合入 `main` 前定稿。
- **写功能，不写实现**：条目是给使用者看的，用一到两句话概括"多了什么能力 / 修好了什么"，不要写实现细节（方法名、内部模块与字段名、协议名、文件路径、commit hash、代码标识符）。细节留在 PR 说明里。
- 每条条目一行、日期倒序：英文 `* YYYY-MM-DD [Fix/Feature/Refactor] Summary`，中文 `* YYYY-MM-DD [Fix/Feature/Refactor] 摘要`。只用 `Fix`、`Feature`、`Refactor` 三种标签，测试覆盖并入对应条目而不是单独成条。
- 按已发布版本分组（`## v0.x.y`，与 git tag 一致）；已打 tag 的段落冻结，永不新增条目。
- 新条目只加在最上面的段落。下一个 tag 未定期间用 `## latest`（不存在就新建），发版后再把它改成 tag 名——不要提前猜版本号。
- 打 tag / 重命名 `## latest` 时只做明确要求的机械步骤，不得自行增加、删除或改写条目内容；条目内容的修改需要显式请求。
- **致谢尾注**：导入上游贡献者的改动时（见《上游 PR 引入流程》），条目在同一行末尾补尾注——中文 `（感谢 @handle）`，英文 `(thanks @handle)`；不另起条目，也不改写他人已发布的条目。
- **语言归属与链接**：changelog 的语言版本跟随 README 约定，每个语言的 README 必须链接同语言的 changelog——英文 README 链 `CHANGELOG.md`，中文 README 链 `CHANGELOG.zh-CN.md`；子目录 README 用相对路径（`../../CHANGELOG.zh-CN.md`）。某个组件还没有 README 时，先补出中英两份 README，再在各自 README 中链接对应语言的 changelog。

## Deployment & Release Safety

- 不要提交 token、凭据、真实主机地址：`~/.dsh/ext-bridge-token`、profile 配置、`install-info.json` 都属本地状态。
- `scripts/install.sh`（macOS/Linux）与 `scripts/install.ps1`（Windows）会构建产物、把桥插件 link 进 `web` profile，并同步到 `~/.dsh/browser-extension`；改动安装流程前先在本机跑通一次完整安装，且两边行为保持一致。
- 生效边界：桥插件改动需要重启对应 dsh 进程（`dsh web` 或 DSH Desktop），扩展改动需要在 `chrome://extensions` 重新加载；只重载扩展不会更新已在内存中运行的桥插件。
- 部署后可用桥探测或 `node scripts/smoke-runtime.mjs` 确认新方法已就绪，再交付给用户。
