# CHANGELOG

**English** | [中文](CHANGELOG.zh-CN.md)

## latest
* 2026-10-19 [Fix] Fix a test that could make automated checks fail intermittently; no functional change.
* 2026-10-19 [Feature] The page-handoff prompt gains "jump back to the assistant page", which switches the browser back to the page the assistant is working on; the two existing choices are renamed after their subject ("assistant stays on the original page", "assistant follows the current page") so they are easier to tell apart.
* 2026-10-19 [Fix] Security fix: tokenless loopback access is now granted only to this extension (its id is pinned by the installation), so other installed extensions must present the token; upgrading from an older build changes the id once (thanks @chintoleung).
* 2026-10-19 [Fix] The side panel can discover and connect to a local dsh again under Chrome 142 / Edge 143 Local Network Access: discovery answers now carry the CORS headers and preflight the browser requires (thanks @PerryLink).
* 2026-10-19 [Feature] New `browser_open_window` tool opens a URL in a new browser window (optionally in the background) and makes it the controlled target; use `browser_open_tab` for a same-window tab (thanks @zzalancelot).
* 2026-10-19 [Feature] `browser_scroll` can now scroll an app's own scroll container (chat transcripts, side panes, modal bodies) instead of only the page (thanks @happinessisreal).
* 2026-10-19 [Fix] Payment and password fields stay masked even when a checkout form declares a card field with several autofill tokens, so card values no longer reach page snapshots (thanks @chintoleung).
* 2026-10-18 [Feature] The side panel finds a local dsh again even when DSH Desktop moves it to a new random port on every launch, says "No service found" instead of retrying forever, and offers a Detect button that lists every local instance so you can pick one.

## v0.1.6
* 2026-10-17 [Fix] Work with dsh 0.2.1: the plugin loads and runs on the new release again, and the plugin page shows its own title, description, and icon.

## v0.1.5
* 2026-10-16 [Feature] The side panel's composer can now switch the conversation's permission mode (Read only / Workspace edits / Full access, with a confirmation before Full access), pick the model and its reasoning effort, and run a host command or a skill from a `/` menu. The model control stays usable while a reply is streaming, and an unrecognized slash command is refused with the draft kept instead of being sent as an ordinary message.
* 2026-10-10 [Feature] Add the `browser_screenshot` viewport screenshot tool (approved per call, needs `<all_urls>` host access) and allow pasting or dropping images into the side panel to send with a message.
* 2026-10-09 [Feature] Add the opt-in developer-tools group: inspect and edit page elements and CSS, run JavaScript in the page context, and capture network requests over the Chrome DevTools Protocol. Off by default, approved per call, Chrome only.
