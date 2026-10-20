# 发布流程（tag → GitHub Release）

适用于打版本 tag 之后。`AGENTS.md` 的《Deployment & Release Safety》只写硬性规则并指向本文；步骤、资产契约与排障都收在这里。

## 为什么 tag 之后必须建 Release

tag 只是 git 里的一个提交指针，用户看不到、也装不了。这个项目有**两半**：桥插件（dsh 侧）与浏览器扩展。两者都不是「装个包就能跑」的形态：

- 桥插件的 `lib/` 是构建产物，被 `.gitignore` 排除，仓库里没有；`dsh plugin add github:graydovee/dsh-browser#path:/packages/browser/bridge-browser` 会**退出码 0 但装出一个没有 `lib/` 的包**，加载时报 `ERR_MODULE_NOT_FOUND …/lib/index.js`。
- 浏览器扩展只能由用户在 `chrome://extensions` / `about:debugging` 里以「已解压扩展」加载，没有任何命令能代劳。

所以每个 Release 都要挂预构建产物：桥插件用带 `lib/` 的 tarball，扩展用可直接解压加载的 tgz。插件市场（awesome-dsh-plugin / dsh-market）直接读 Release 资产，缺了就等于装不上。

## 资产契约（名字不可改）

| 资产名 | 内容 | 用在哪 |
|---|---|---|
| `dsh-bridge-browser.tgz` | `@yuxianglin/dsh-bridge-browser` 的 `npm pack` 产物，含 `lib/`、`cordis.patch.yml`、`locale/` | `dsh plugin --profile web add <url>`；awesome 条目的 `tarball:` 字段 |
| `dsh-browser-extension.tgz` | Chrome/Edge MV3 扩展（`extensions/dsh-browser/dist`），解压后含 `manifest.json` | `chrome://extensions` → 加载已解压的扩展 |
| `dsh-browser-extension-firefox.tgz` | Firefox 扩展（`extensions/dsh-browser/dist-firefox`），解压后含 `manifest.json` | `about:debugging` → 临时载入附加组件 |

规则：

- **资产名不带版本号**。版本写进 tag 和 Release 标题，不写进文件名——外部引用（awesome 条目的 `tarball:`）用的是
  `https://github.com/graydovee/dsh-browser/releases/latest/download/dsh-bridge-browser.tgz`，
  它只在请求时解析 `latest`，文件名照字面取。资产名一旦带版本号，下次发版这个链接就 404，而且不会有人察觉。
  另一种同样被接受的形态是**钉住 tag + 文件名带版本号**（`releases/download/vX.Y.Z/dsh-bridge-browser-X.Y.Z.tgz`），
  链接不可变、永远不会烂；代价是每次发版都要回插件列表改一次 `tarball:`。本仓库选前一种，因为发版频率高，
  而"每个 Release 都挂同名资产"这件事由 `scripts/release.sh` 强制（打包后校验包内产物、发布后校验三个
  `latest/download` 均 200）。选哪一种都行，但不能混：`latest/download/` 配一个带版本号的文件名是最容易腐烂的组合。
- **每个 Release 都必须挂齐三个**。`latest/download/…` 指向最近一次发布的 Release；只要有一次忘了挂，市场里的安装命令就是坏的。
- tarball 必须是**该 tag 的构建产物**，不能拿工作区的旧 `lib/` 顶替。

## 步骤

### 1. 前置

```sh
git switch main && git pull --ff-only            # main 已合入本次功能与 changelog
gh auth switch --user graydovee && gh api user --jq .login   # 输出 graydovee
git status --porcelain                            # 必须为空
```

版本号已在 `package.json` / `extensions/dsh-browser/package.json` 里 bump，`CHANGELOG*.md` 的 `## latest` 已改成 `## vX.Y.Z`，且中英两侧条目一一对应。

### 2. 打 tag 并发布

```sh
git tag -a vX.Y.Z -m "vX.Y.Z"
git push fork vX.Y.Z

bash scripts/release.sh vX.Y.Z
```

`scripts/release.sh` 会：构建桥插件与两个扩展 → 打成上表三个 tgz → 校验包内确有 `lib/index.js` 与两个 `manifest.json` → 用两个 CHANGELOG 的对应段落拼出中英双语发布说明 → `gh release create`（Release 已存在则 `upload --clobber`）→ 逐个请求 `latest/download/…` 确认 200。

先看产物不发布：`bash scripts/release.sh vX.Y.Z --dry-run`（只构建、打包、打印路径与大小）。

### 3. 手动兜底（脚本不可用时）

```sh
pnpm --filter @yuxianglin/dsh-bridge-browser run build
pnpm --filter dsh-browser-extension run build
pnpm --filter dsh-browser-extension run build:firefox

OUT=$(mktemp -d)
(cd packages/browser/bridge-browser && npm pack --pack-destination "$OUT")
mv "$OUT"/yuxianglin-dsh-bridge-browser-*.tgz "$OUT/dsh-bridge-browser.tgz"
cp -R extensions/dsh-browser/dist "$OUT/dsh-browser-extension"
cp -R extensions/dsh-browser/dist-firefox "$OUT/dsh-browser-extension-firefox"
tar -czf "$OUT/dsh-browser-extension.tgz" -C "$OUT" dsh-browser-extension
tar -czf "$OUT/dsh-browser-extension-firefox.tgz" -C "$OUT" dsh-browser-extension-firefox

gh release create vX.Y.Z --repo graydovee/dsh-browser --title vX.Y.Z --notes-file /tmp/notes.md \
  "$OUT/dsh-bridge-browser.tgz" \
  "$OUT/dsh-browser-extension.tgz" \
  "$OUT/dsh-browser-extension-firefox.tgz"
```

### 4. 验收

```sh
for u in dsh-bridge-browser.tgz dsh-browser-extension.tgz dsh-browser-extension-firefox.tgz; do
  curl -sIL -o /dev/null -w "%{http_code} $u\n" \
    "https://github.com/graydovee/dsh-browser/releases/latest/download/$u"
done
```

三个都要 `200`。再在**干净 `DSH_HOME`** 里实装一次桥插件，确认不是「装上了但加载不了」：

```sh
W=$(mktemp -d); mkdir -p "$W/home"
DSH="node node_modules/@deepseek-ai/dsh/lib/bin.js"
DSH_HOME="$W/home" $DSH plugin --profile web add \
  https://github.com/graydovee/dsh-browser/releases/latest/download/dsh-bridge-browser.tgz
ls "$W/home/profiles/web/node_modules/@yuxianglin/dsh-bridge-browser/lib"   # 应有 index.js
DSH_HOME="$W/home" $DSH --profile web --dump-config | grep -A1 'id: bridge-browser'
```

## 与上游 PR 的关系

Release 属于 fork 接线，**不进** `omdsh-dev/dsh-browser` 承载分支，也不进对上游的 PR #121；承载分支只放产品改动（见 `fork-feature-flow.md`）。

## 常见故障

| 现象 | 原因与处理 |
|---|---|
| 资产里没有 `lib/` | 打包前没跑构建，或打了工作区的空目录；重跑 `scripts/release.sh` |
| `latest/download/…` 404 | 该 Release 没挂对应资产，或资产名带了版本号；按契约重新上传 |
| `gh release create` 报仓库不对 | 本仓库 `origin` 指向上游；所有 `gh release*` 都要显式带 `--repo graydovee/dsh-browser` |
| `dsh plugin add` 装完加载报 `ERR_MODULE_NOT_FOUND` | 装的是 git 源码而不是 tgz；git 安装不产出构建产物，这是预期行为 |
