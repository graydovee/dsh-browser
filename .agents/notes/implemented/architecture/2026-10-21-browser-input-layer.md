# Agent Note: Browser input layer

Status: implemented

**English** | [中文](2026-10-21-browser-input-layer.zh.md)

## Problem

The browser bridge could read a page and operate elements that the snapshot had
numbered. Anything that did not expose a semantic role — canvas surfaces, SVG
menus, rich-text editors, drag-and-drop panels — stayed out of reach: there was
no pointer movement or press/release, no key chord, no way to put text into an
editor that owns its document model, no clipboard transfer, and no file input.
The gap was a missing input layer, not a missing app integration.

## Decision

**One general input layer, no application-specific code.** Keyboard, pointer,
text, clipboard, and file are addressed by element identity or coordinates;
every page uses the same parameters. The implementation never keys on a domain,
a component class, or an editor implementation, and application recipes live in
documentation only.

**Two delivery channels with one model-facing contract.** Element targeting,
plain text, paste events, and ordinary clicks stay in the content script and
never need a debugger. Real pointer events, wheel gestures, key chords, caret
insertion, system paste, and file attachment need the browser process, so they
run over `chrome.debugger`. The tool result marks the channel (`(trusted)` or
`(synthetic)`) and the platform's inability to deliver is a stable
`input-unavailable` error instead of a silent no-op.

**Input is stateful per tab.** `browser_press { action: down|up }` holds a
modifier, `browser_click { action: down|up }` holds a mouse button, and the next
gesture automatically carries them. This composes Shift+click, Cmd+drag, and
press-drag-release without dedicated combination tools. Navigation, tab close,
and attachment loss reset the state.

**Coordinates are frame-local.** A pointer action addresses a point inside its
target frame's viewport; the content script reports the chain of frame owners
along `window.parent`, and the background sums it into the tab viewport. A
cross-origin ancestor hides `frameElement`, so coordinate actions fail there
while element targeting and paste events keep working.

**One debugger per tab, shared.** A tab can only be attached once, so a small
broker owns the per-tab session, counts the features holding it (developer tools
and input), and detaches immediately for the developer tools or after an idle
window for input. Real input is an ordinary action for consent purposes: it
follows the same per-call approval, trusted-origin, and unrestricted-access
rules as click/type, because it grants the page no authority a DOM click does
not. The isolated consent surface stays reserved for the developer-tools group
(arbitrary page JavaScript, DOM writes, network capture).

**Clipboard has two distinct paths.** A paste event built from a `DataTransfer`
is the default: it works in every supported browser, never touches the user's
clipboard, and HTML is sanitized before it reaches the page. Writing the system
clipboard uses a packaged offscreen document in Chrome (an MV3 worker has no
DOM) or the event page's hidden editable host in Firefox; the platform's paste
shortcut then covers apps that only respond to genuine pastes.

**File attachment reads nothing in the extension.** The content script tags the
file input with a one-shot marker, the background resolves it over CDP, and the
browser process reads the caller-supplied paths. The extension never opens the
files.

## Consequences

- Tool parameters grew on `browser_snapshot`, `browser_click`, `browser_type`,
  `browser_press`, `browser_scroll`, and `browser_follow_tab`; two tools were
  added (`browser_clipboard`, `browser_upload`).
- Chrome gains `clipboardWrite` and `offscreen` permissions plus a packaged
  offscreen page; Firefox keeps its manifest and degrades.
- Input never activates a tab, focuses a window, or moves the system pointer.
  `browser_follow_tab { activate: true }` is the only explicit foreground
  switch, and `browser_screenshot` still requires the active tab.
- A debugger attachment shows Chrome's infobar and blocks DevTools on that tab;
  the idle detach window keeps the cost bounded to one input sequence.
- Attaching can change the viewport height (the infobar): measure coordinates
  after attachment, which the broker's idle window makes the default.
- macOS editing shortcuts are application-menu commands: select-all, copy,
  paste, cut, undo, and redo work only when the key-down names the command, so
  Meta combinations carry `commands` on macOS.
- Wheel input is compositor-driven; a background or frozen page never answers
  it. The tool rejects that case up front with a `follow_tab { activate: true }`
  instruction instead of waiting for a timeout, and works on the active page.
- Screenshots come from the compositor: the tab must be active in a focused
  window, or the capture can be a stale frame. The tool refuses an unfocused
  window; an occluded but focused window remains best-effort.
