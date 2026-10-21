/**
 * Frame geometry shared by the content script and the background.
 *
 * A pointer action addresses coordinates inside one frame's viewport, while
 * the browser's trusted input dispatcher expects coordinates in the tab's
 * top-level viewport. Each frame reports the placement of its own `<iframe>`
 * inside its parent, innermost first; the background sums the chain.
 *
 * @module
 */

/** Placement of one frame's owner element inside its parent's viewport. */
export interface FrameEdge {
  /** Owner border box's left edge in the parent viewport (CSS pixels). */
  left: number
  /** Owner border box's top edge in the parent viewport (CSS pixels). */
  top: number
  /** Left border width of the owner element. */
  clientLeft: number
  /** Top border width of the owner element. */
  clientTop: number
}

/** A point in CSS pixels. */
export interface Point {
  x: number
  y: number
}

/**
 * Sum a frame-owner chain into the tab's top-level viewport offset.
 *
 * @param edges - placements from the target frame outwards (order is irrelevant to the sum).
 * @returns the offset to add to a frame-local coordinate.
 */
export function accumulateOffset(edges: readonly FrameEdge[]): Point {
  let x = 0
  let y = 0
  for (const edge of edges) {
    x += edge.left + edge.clientLeft
    y += edge.top + edge.clientTop
  }
  return { x, y }
}

/**
 * Translate a frame-local point into top-level viewport coordinates.
 *
 * @param edges - frame-owner chain for the point's frame.
 * @param point - coordinates inside that frame's viewport.
 * @returns top-level viewport coordinates.
 */
export function toViewportPoint(edges: readonly FrameEdge[], point: Point): Point {
  const offset = accumulateOffset(edges)
  return { x: offset.x + point.x, y: offset.y + point.y }
}
