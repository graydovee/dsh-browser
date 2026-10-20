#!/usr/bin/env bash
#
# Build the three release assets for a tagged version and publish them as a
# GitHub Release on the fork.
#
# Why this exists: the bridge plugin's `lib/` is build output and is not
# committed, so `dsh plugin add github:owner/repo#path:/packages/...` installs
# a package that cannot load. The browser extension is loaded unpacked by hand.
# Both halves therefore have to ship as prebuilt release assets, and every
# release must carry the same three asset names — see .agents/notes/release.md.
#
# Usage:
#   bash scripts/release.sh v0.1.8              build, pack, publish, verify
#   bash scripts/release.sh v0.1.8 --dry-run    build and pack only
#   bash scripts/release.sh v0.1.8 --notes-file /tmp/notes.md
#
# macOS and Linux. The maintainer runs this by hand; it is not part of the
# installer flow.

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"

TAG=""
DRY_RUN=0
NOTES_FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --notes-file) NOTES_FILE=${2:?--notes-file needs a path}; shift ;;
    -h|--help) sed -n '3,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "release: unknown option $1" >&2; exit 2 ;;
    *)
      if [ -n "$TAG" ]; then echo "release: unexpected argument $1" >&2; exit 2; fi
      TAG=$1 ;;
  esac
  shift
done

if [ -z "$TAG" ]; then
  echo "release: usage: bash scripts/release.sh <tag> [--dry-run] [--notes-file <path>]" >&2
  exit 2
fi
if ! printf '%s' "$TAG" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'; then
  echo "release: '$TAG' is not a version tag like v0.1.8" >&2
  exit 2
fi

# Release assets are published on the fork, but this checkout's `origin` points
# at upstream, so every gh call must name the repository explicitly.
FORK_REPO=$(git remote get-url fork 2>/dev/null \
  | sed -n 's#.*github\.com[:/]\([^/]*/[^/.]*\)\.git$#\1#p' | head -1)
FORK_REPO=${FORK_REPO:-graydovee/dsh-browser}

PLUGIN_DIR=packages/browser/bridge-browser
EXT_DIR=extensions/dsh-browser

die() { echo "release: $*" >&2; exit 1; }

# --- preconditions ---------------------------------------------------------

git rev-parse -q --verify "refs/tags/$TAG" >/dev/null \
  || die "tag $TAG does not exist locally — create it on main first (see .agents/notes/release.md)"
[ -d node_modules ] || die "node_modules is missing — run: pnpm install --frozen-lockfile"
if [ "$DRY_RUN" -eq 0 ]; then
  command -v gh >/dev/null || die "gh is required to publish"
  gh auth status >/dev/null 2>&1 || die "gh is not logged in — gh auth switch --user graydovee"
fi

WORK=$(mktemp -d "${TMPDIR:-/tmp}/dsh-release.XXXXXX")
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

echo "==> building bridge plugin and both extensions"
pnpm --filter @yuxianglin/dsh-bridge-browser run build >/dev/null
pnpm --filter dsh-browser-extension run build >/dev/null
pnpm --filter dsh-browser-extension run build:firefox >/dev/null

# --- pack ------------------------------------------------------------------

echo "==> packing dsh-bridge-browser.tgz"
PACKED=$( cd "$PLUGIN_DIR" && npm pack --pack-destination "$WORK" 2>/dev/null | tail -n1 )
[ -n "$PACKED" ] && [ -f "$WORK/$PACKED" ] || die "npm pack produced no tarball"
mv "$WORK/$PACKED" "$WORK/dsh-bridge-browser.tgz"

pack_extension() { # <dist dir> <archive basename>
  local dist=$1 name=$2
  [ -f "$dist/manifest.json" ] || die "$dist/manifest.json is missing — did the extension build run?"
  rm -rf "${WORK:?}/$name"
  cp -R "$dist" "$WORK/$name"
  tar -czf "$WORK/$name.tgz" -C "$WORK" "$name"
  rm -rf "${WORK:?}/$name"
}
echo "==> packing dsh-browser-extension.tgz"
pack_extension "$EXT_DIR/dist" dsh-browser-extension
echo "==> packing dsh-browser-extension-firefox.tgz"
pack_extension "$EXT_DIR/dist-firefox" dsh-browser-extension-firefox

# A tarball without the build output is the exact failure this script exists to
# prevent, so check the contents rather than the exit codes above.
tar -tzf "$WORK/dsh-bridge-browser.tgz" | grep -q '^package/lib/index.js$' \
  || die "dsh-bridge-browser.tgz has no package/lib/index.js"
tar -tzf "$WORK/dsh-bridge-browser.tgz" | grep -q '^package/cordis.patch.yml$' \
  || die "dsh-bridge-browser.tgz has no package/cordis.patch.yml"
for name in dsh-browser-extension dsh-browser-extension-firefox; do
  tar -tzf "$WORK/$name.tgz" | grep -q "/manifest.json$" \
    || die "$name.tgz has no manifest.json"
done

ASSETS=(
  "$WORK/dsh-bridge-browser.tgz"
  "$WORK/dsh-browser-extension.tgz"
  "$WORK/dsh-browser-extension-firefox.tgz"
)
echo "==> assets built"
ls -lh "${ASSETS[@]}" | awk '{print "    " $9 " (" $5 ")"}'

if [ "$DRY_RUN" -eq 1 ]; then
  echo "==> dry run: nothing published (assets left in $WORK, removed on exit)"
  exit 0
fi

# --- notes -----------------------------------------------------------------

changelog_section() { # <file> — the `## <tag>` block, or nothing
  awk -v tag="$TAG" '
    $0 == "## " tag { inside = 1; next }
    inside && /^## / { exit }
    inside { print }
  ' "$1" | sed -e 's/[[:space:]]*$//' -e '/./,$!d'
}

if [ -n "$NOTES_FILE" ]; then
  NOTES=$NOTES_FILE
else
  NOTES=$WORK/notes.md
  {
    echo "## 中文"
    echo
    changelog_section CHANGELOG.zh-CN.md || true
    echo
    echo "## English"
    echo
    changelog_section CHANGELOG.md || true
    echo
    echo "## Release assets / 发布附件"
    echo
    echo "* \`dsh-bridge-browser.tgz\` — 预构建桥插件（含 \`lib/\`）/ prebuilt bridge plugin with \`lib/\`:"
    echo "  \`dsh plugin --profile web add https://github.com/$FORK_REPO/releases/latest/download/dsh-bridge-browser.tgz\`"
    echo "* \`dsh-browser-extension.tgz\` — Chrome / Edge 扩展（MV3），解压后在 \`chrome://extensions\` 加载已解压的扩展 / Chrome and Edge extension (MV3): unpack, then load it from \`chrome://extensions\`"
    echo "* \`dsh-browser-extension-firefox.tgz\` — Firefox 扩展，解压后在 \`about:debugging\` 里临时加载 \`manifest.json\` / Firefox extension: unpack and load its \`manifest.json\` from \`about:debugging\`"
  } > "$NOTES"
  if ! grep -q '^\* ' "$NOTES"; then
    echo "release: warning: no CHANGELOG section found for $TAG; the release body only lists the assets" >&2
  fi
fi

# --- publish ---------------------------------------------------------------

if gh release view "$TAG" --repo "$FORK_REPO" >/dev/null 2>&1; then
  echo "==> release $TAG already exists on $FORK_REPO — uploading assets"
  gh release upload "$TAG" "${ASSETS[@]}" --repo "$FORK_REPO" --clobber
else
  echo "==> creating release $TAG on $FORK_REPO"
  gh release create "$TAG" --repo "$FORK_REPO" --title "$TAG" --notes-file "$NOTES" "${ASSETS[@]}"
fi

# --- verify ----------------------------------------------------------------

echo "==> verifying latest/download URLs"
failed=0
for name in dsh-bridge-browser.tgz dsh-browser-extension.tgz dsh-browser-extension-firefox.tgz; do
  code=$(curl -sIL -o /dev/null -w '%{http_code}' \
    "https://github.com/$FORK_REPO/releases/latest/download/$name" || true)
  printf '    %s %s\n' "$code" "$name"
  [ "$code" = "200" ] || failed=1
done
[ "$failed" -eq 0 ] || die "one or more release assets are not reachable — see .agents/notes/release.md"

echo "==> done: https://github.com/$FORK_REPO/releases/tag/$TAG"
