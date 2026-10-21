/**
 * System clipboard writes for `browser_clipboard { action: 'write' }`.
 *
 * Chrome runs the write in a packaged offscreen document: an MV3 service
 * worker has no DOM and cannot touch the clipboard itself. Firefox has no
 * offscreen API, but its event page still has a document, so the same payload
 * is copied through a hidden editable host. When neither path is available the
 * call fails with a stable code instead of silently doing nothing.
 *
 * @module
 */

import { InputError } from './input-actions.ts'
import {
  CLIPBOARD_WRITE_MESSAGE,
  OFFSCREEN_CLIPBOARD_URL,
  type ClipboardWriteOutcome,
  type ClipboardWritePayload,
} from '../shared/clipboard.ts'

/** The subset of `chrome.offscreen` used here, structurally typed for tests. */
interface OffscreenApi {
  hasDocument?: () => Promise<boolean>
  createDocument?: (options: { url: string; reasons: string[]; justification: string }) => Promise<void>
}

/** The subset of `chrome.runtime` used here. */
interface RuntimeApi {
  sendMessage?: (message: unknown) => Promise<unknown>
}

function offscreenApi(): OffscreenApi | undefined {
  const candidate = (globalThis as { chrome?: { offscreen?: unknown } }).chrome?.offscreen
  if (candidate === undefined || candidate === null || typeof candidate !== 'object') return undefined
  return candidate as OffscreenApi
}

function runtimeApi(): RuntimeApi | undefined {
  const candidate = (globalThis as { chrome?: { runtime?: unknown } }).chrome?.runtime
  if (candidate === undefined || candidate === null || typeof candidate !== 'object') return undefined
  return candidate as RuntimeApi
}

/** Create the offscreen document unless it already exists. */
async function ensureOffscreenDocument(api: OffscreenApi): Promise<void> {
  if (typeof api.hasDocument === 'function' && await api.hasDocument()) return
  if (typeof api.createDocument !== 'function') {
    throw new InputError('input-unavailable', 'The browser cannot create the offscreen document required for clipboard writes.')
  }
  try {
    await api.createDocument({
      url: OFFSCREEN_CLIPBOARD_URL,
      reasons: ['CLIPBOARD'],
      justification: 'Write text or rich HTML to the clipboard at the user\'s request.',
    })
  } catch (error: unknown) {
    // A concurrent call may have created it first; any other failure is real.
    if (typeof api.hasDocument === 'function' && await api.hasDocument()) return
    throw new InputError(
      'action-failed',
      `The offscreen clipboard document could not be created: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/** Copy inside this document (Firefox event page) through a hidden editable host. */
function copyInThisDocument(payload: ClipboardWritePayload): ClipboardWriteOutcome | undefined {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return undefined
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
    if (selection === null) return undefined
    selection.removeAllRanges()
    selection.addRange(range)
    if (!document.execCommand('copy')) return undefined
    return {
      rich: payload.html !== undefined,
      plainDerived: payload.html !== undefined,
      plainText: (host.innerText ?? host.textContent ?? '').replace(/\s+/g, ' ').trim(),
    }
  } catch {
    return undefined
  } finally {
    host.remove()
  }
}

/**
 * Write text and optional rich HTML to the system clipboard.
 *
 * @param payload - clipboard content.
 * @throws {InputError} with `input-unavailable` when the platform cannot copy.
 */
export async function writeClipboard(payload: ClipboardWritePayload): Promise<ClipboardWriteOutcome> {
  if (payload.text === '' && payload.html === undefined) {
    throw new InputError('bad-args', 'text or html is required for a clipboard write.')
  }
  const offscreen = offscreenApi()
  if (offscreen === undefined) {
    const outcome = copyInThisDocument(payload)
    if (outcome !== undefined) return outcome
    throw new InputError('input-unavailable', 'This browser cannot write the system clipboard from an extension.')
  }
  await ensureOffscreenDocument(offscreen)
  const runtime = runtimeApi()
  if (runtime?.sendMessage === undefined) {
    throw new InputError('input-unavailable', 'The browser runtime cannot reach the offscreen clipboard document.')
  }
  let response: unknown
  try {
    response = await runtime.sendMessage({ type: CLIPBOARD_WRITE_MESSAGE, target: 'offscreen', payload })
  } catch (error: unknown) {
    throw new InputError(
      'action-failed',
      `The clipboard write failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (typeof response === 'object' && response !== null && (response as { ok?: unknown }).ok === true) {
    const outcome = (response as { outcome?: unknown }).outcome
    if (typeof outcome === 'object' && outcome !== null) {
      const record = outcome as { rich?: unknown; plainDerived?: unknown; plainText?: unknown }
      return {
        rich: record.rich === true,
        plainDerived: record.plainDerived === true,
        plainText: typeof record.plainText === 'string' ? record.plainText : payload.text,
      }
    }
    return { rich: payload.html !== undefined, plainDerived: false, plainText: payload.text }
  }
  if (typeof response === 'object' && response !== null && typeof (response as { error?: unknown }).error === 'string') {
    throw new InputError('action-failed', (response as { error: string }).error)
  }
  throw new InputError('action-failed', 'The offscreen document did not confirm the clipboard write.')
}
