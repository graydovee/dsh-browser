// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { accumulateOffset, toViewportPoint } from '../src/shared/frame-geometry.ts'

describe('accumulateOffset', () => {
  it('is zero without frames', () => {
    expect(accumulateOffset([])).toEqual({ x: 0, y: 0 })
  })

  it('adds each frame placement including its borders', () => {
    expect(accumulateOffset([
      { left: 120, top: 40, clientLeft: 1, clientTop: 1 },
      { left: 10, top: 20, clientLeft: 2, clientTop: 0 },
    ])).toEqual({ x: 133, y: 61 })
  })
})

describe('toViewportPoint', () => {
  it('translates a frame-local point into the top-level viewport', () => {
    const edges = [{ left: 100, top: 50, clientLeft: 0, clientTop: 0 }]
    expect(toViewportPoint(edges, { x: 5, y: 7 })).toEqual({ x: 105, y: 57 })
  })

  it('keeps top-level coordinates unchanged', () => {
    expect(toViewportPoint([], { x: 5, y: 7 })).toEqual({ x: 5, y: 7 })
  })
})
