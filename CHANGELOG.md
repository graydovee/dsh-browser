# CHANGELOG

**English** | [中文](CHANGELOG.zh-CN.md)

## latest
* 2026-10-17 [Fix] Work with dsh 0.2.1: the plugin loads and runs on the new release again, the plugin page shows its own title, description, and icon, and the page snapshot taken when you follow a tab survives a dsh restart instead of being discarded.

## v0.1.5
* 2026-10-16 [Feature] The side panel's composer can now switch the conversation's permission mode (Read only / Workspace edits / Full access, with a confirmation before Full access), pick the model and its reasoning effort, and run a host command or a skill from a `/` menu. The model control stays usable while a reply is streaming, and an unrecognized slash command is refused with the draft kept instead of being sent as an ordinary message.
* 2026-10-10 [Feature] Add the `browser_screenshot` viewport screenshot tool (approved per call, needs `<all_urls>` host access) and allow pasting or dropping images into the side panel to send with a message.
* 2026-10-09 [Feature] Add the opt-in developer-tools group: inspect and edit page elements and CSS, run JavaScript in the page context, and capture network requests over the Chrome DevTools Protocol. Off by default, approved per call, Chrome only.
