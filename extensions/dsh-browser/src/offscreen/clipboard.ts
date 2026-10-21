/**
 * Offscreen clipboard writer.
 *
 * Chrome MV3 service workers have no DOM and no clipboard access, but an
 * offscreen document with the `CLIPBOARD` reason can perform the copy on the
 * extension's behalf. The background creates this document on demand and sends
 * one message per write; the document never runs page code.
 *
 * @module
 */

import {
  CLIPBOARD_WRITE_MESSAGE,
  type ClipboardWriteOutcome,
  type ClipboardWritePayload,
} from '../shared/clipboard.ts'

/** Copy text plus optional rich HTML through the async clipboard API. */
async function writeWithClipboardApi(payload: ClipboardWritePayload): Promise<boolean> {
  if (typeof navigator === 'undefined' || navigator.clipboard === undefined) return false
  if (payload.html !== undefined && typeof ClipboardItem === 'function') {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([payload.text], { type: 'text/plain' }),
        'text/html': new Blob([payload.html], { type: 'text/html' }),
      })])
      return true
    } catch {
      // Fall back to plain text below.
    }
  }
  try {
    await navigator.clipboard.writeText(payload.text)
    return true
  } catch {
    return false
  }
}

/** Copy through a hidden editable host when the async API is unavailable. */
function writeWithExecCommand(payload: ClipboardWritePayload): boolean {
  const host = document.createElement('div')
  host.contentEditable = 'true'
  host.style.position = 'fixed'
  host.style.left = '-9999px'
  host.style.top = '0'
  if (payload.html !== undefined) host.innerHTML = payload.html
  else host.textContent = payload.text
  document.body.appendChild(host)
  try {
    const range = document.createRange()
    range.selectNodeContents(host)
    const selection = document.getSelection()
    if (selection === null) return false
    selection.removeAllRanges()
    selection.addRange(range)
    return document.execCommand('copy')
  } finally {
    host.remove()
  }
}

/** Write one payload, preferring rich content, and report what landed. */
export async function writeClipboardPayload(payload: ClipboardWritePayload): Promise<ClipboardWriteOutcome> {
  if (await writeWithClipboardApi(payload)) {
    // The async API writes both flavors exactly as provided.
    return { rich: payload.html !== undefined, plainDerived: false, plainText: payload.text }
  }
  if (writeWithExecCommand(payload)) {
    // execCommand copies the selected DOM: with HTML the plain flavor is the
    // HTML's text content, not the caller's text fallback.
    return {
      rich: payload.html !== undefined,
      plainDerived: payload.html !== undefined,
      plainText: payload.html === undefined ? payload.text : htmlText(payload.html),
    }
  }
  throw new Error('The clipboard write was rejected by the browser.')
}

/** Text content of an HTML fragment (used to report what the clipboard holds). */
function htmlText(html: string): string {
  const host = document.createElement('div')
  host.innerHTML = html
  return (host.innerText ?? host.textContent ?? '').replace(/\s+/g, ' ').trim()
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (response: unknown) => void) => {
  if (typeof message !== 'object' || message === null) return
  const request = message as { type?: unknown; target?: unknown; payload?: ClipboardWritePayload }
  if (request.type !== CLIPBOARD_WRITE_MESSAGE || request.target !== 'offscreen' || request.payload === undefined) return
  void writeClipboardPayload(request.payload).then(
    (outcome) => { sendResponse({ ok: true, outcome }) },
    (error: unknown) => { sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }) },
  )
  return true
})
