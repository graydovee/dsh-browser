/**
 * Rich clipboard paste for `browser_clipboard { action: 'paste' }`.
 *
 * The system clipboard is not touched here: the payload is placed on a
 * `DataTransfer` and delivered as a `paste` event, which is exactly the event
 * rich editors and canvas apps listen for. HTML is sanitized first so a page
 * cannot be handed active content through the model's clipboard.
 *
 * @module
 */

/** What the caller wants to paste. */
export interface PastePayload {
  text: string
  html?: string
}

/** Elements that can execute code or replace the embedding document. */
const BLOCKED_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'template',
  'noscript',
])

/** Attributes that execute code or navigate where HTML cannot. */
const BLOCKED_ATTRIBUTES = new Set(['srcdoc', 'formaction'])

/** URL schemes that must never survive into the page. */
const BLOCKED_URL = /^\s*(?:javascript|vbscript|data:text\/html)/i

/**
 * Strip active content from pasted HTML while keeping presentational markup.
 *
 * @param html - untrusted HTML supplied by the caller.
 * @returns sanitized HTML.
 */
export function sanitizePasteHtml(html: string): string {
  if (html === '') return ''
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch {
    // A parser that refuses the input gets no HTML at all; text still pastes.
    return ''
  }
  for (const element of [...doc.body.querySelectorAll('*')]) {
    const tag = element.tagName.toLowerCase()
    if (BLOCKED_TAGS.has(tag)) {
      element.remove()
      continue
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      if (name.startsWith('on') || BLOCKED_ATTRIBUTES.has(name)) {
        element.removeAttribute(attribute.name)
        continue
      }
      if ((name === 'href' || name === 'src' || name === 'xlink:href' || name === 'action')
        && BLOCKED_URL.test(attribute.value)) {
        element.removeAttribute(attribute.name)
      }
    }
  }
  return doc.body.innerHTML
}

/** The minimum clipboard surface a paste event needs. */
interface ClipboardDataLike {
  setData(type: string, data: string): void
  getData(type: string): string
}

/** Build the `clipboardData` payload, with a duck-typed fallback for test shells. */
function createClipboardData(payload: PastePayload): ClipboardDataLike {
  const html = payload.html === undefined ? undefined : sanitizePasteHtml(payload.html)
  if (typeof DataTransfer === 'function') {
    const transfer = new DataTransfer()
    transfer.setData('text/plain', payload.text)
    if (html !== undefined) transfer.setData('text/html', html)
    return transfer
  }
  const values = new Map<string, string>([['text/plain', payload.text]])
  if (html !== undefined) values.set('text/html', html)
  return {
    setData: (type, data) => { values.set(type, data) },
    getData: (type) => values.get(type) ?? '',
  }
}

/** Build a cancelable paste event carrying the payload. */
export function createPasteEvent(payload: PastePayload): Event {
  const clipboardData = createClipboardData(payload)
  if (typeof ClipboardEvent === 'function') {
    try {
      return new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboardData as DataTransfer,
      })
    } catch {
      // Fall through to the generic event below.
    }
  }
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: clipboardData })
  return event
}

/**
 * Dispatch a paste event at one element.
 *
 * @param target - element whose paste handler should run.
 * @param payload - text plus optional rich HTML.
 * @returns whether the page called `preventDefault` (a handler accepted it).
 */
export function dispatchPaste(target: Element, payload: PastePayload): boolean {
  const event = createPasteEvent(payload)
  target.dispatchEvent(event)
  return event.defaultPrevented
}
