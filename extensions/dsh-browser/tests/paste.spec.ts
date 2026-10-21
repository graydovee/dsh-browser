// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createPasteEvent, dispatchPaste, sanitizePasteHtml } from '../src/content/paste.ts'

function clipboardOf(event: Event): { getData(type: string): string } {
  return (event as Event & { clipboardData: { getData(type: string): string } }).clipboardData
}

describe('sanitizePasteHtml', () => {
  it('removes executable elements and event handlers', () => {
    const cleaned = sanitizePasteHtml(
      '<p onclick="steal()">Hi</p><script>alert(1)</script><iframe src="x"></iframe>'
      + '<img src="x" onerror="alert(2)"><a href="javascript:alert(3)">link</a>',
    )
    expect(cleaned).not.toContain('<script')
    expect(cleaned).not.toContain('<iframe')
    expect(cleaned).not.toContain('onclick')
    expect(cleaned).not.toContain('onerror')
    expect(cleaned).not.toContain('javascript:')
    expect(cleaned).toContain('Hi')
    expect(cleaned).toContain('link')
  })

  it('keeps presentational markup and inline styles', () => {
    const cleaned = sanitizePasteHtml('<h2 style="color:red">Title</h2><table><tr><td>A</td></tr></table>')
    expect(cleaned).toContain('<h2 style="color:red">Title</h2>')
    expect(cleaned).toContain('<table>')
    expect(cleaned).toContain('<td>A</td>')
  })

  it('returns an empty string for empty input', () => {
    expect(sanitizePasteHtml('')).toBe('')
  })
})

describe('createPasteEvent', () => {
  it('carries text/plain and sanitized text/html', () => {
    const event = createPasteEvent({ text: 'plain', html: '<b onclick="x()">rich</b>' })
    expect(event.type).toBe('paste')
    expect(event.bubbles).toBe(true)
    expect(event.cancelable).toBe(true)
    expect(clipboardOf(event).getData('text/plain')).toBe('plain')
    expect(clipboardOf(event).getData('text/html')).toBe('<b>rich</b>')
  })

  it('omits text/html when no HTML is supplied', () => {
    const event = createPasteEvent({ text: 'plain' })
    expect(clipboardOf(event).getData('text/html')).toBe('')
  })
})

describe('dispatchPaste', () => {
  it('delivers a cancelable paste event the page handler can consume', () => {
    document.body.innerHTML = '<div id="editor" contenteditable="true"></div>'
    const target = document.getElementById('editor')!
    let received = ''
    target.addEventListener('paste', (event) => {
      received = clipboardOf(event).getData('text/html')
      event.preventDefault()
    })
    expect(dispatchPaste(target, { text: 'plain', html: '<h1>Title</h1>' })).toBe(true)
    expect(received).toBe('<h1>Title</h1>')
  })

  it('reports an unhandled paste', () => {
    document.body.innerHTML = '<div id="plain"></div>'
    const target = document.getElementById('plain')!
    const listener = vi.fn()
    target.addEventListener('paste', listener)
    expect(dispatchPaste(target, { text: 'plain' })).toBe(false)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
