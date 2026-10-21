/**
 * Per-tab input state: held modifiers, pressed buttons, last pointer position.
 *
 * Trusted input is stateful. A caller presses Shift, then clicks, then releases
 * it — three separate tool calls. Keeping the state per tab makes modifier
 * chords and drags compose without dedicated combination tools, and makes the
 * automatic reset on navigation or re-attach a single decision point.
 *
 * @module
 */

import { MODIFIER_BITS, modifierMask, type ModifierName } from './keys.ts'
import type { Point } from '../shared/frame-geometry.ts'

/** Mouse buttons the pointer tool accepts. */
export type MouseButton = 'left' | 'right' | 'middle'

/** CDP `buttons` bitmask values for pressed mouse buttons. */
export const BUTTON_BITS: Readonly<Record<MouseButton, number>> = {
  left: 1,
  right: 2,
  middle: 4,
}

/** One tab's input state. */
export class InputState {
  private heldModifiers = new Set<ModifierName>()
  private pressedButtons = 0
  private lastPointer: Point | undefined

  /** Record a modifier key going down or up. */
  setModifier(modifier: ModifierName, pressed: boolean): void {
    if (pressed) this.heldModifiers.add(modifier)
    else this.heldModifiers.delete(modifier)
  }

  /** @returns whether the modifier is currently held. */
  isModifierHeld(modifier: ModifierName): boolean {
    return this.heldModifiers.has(modifier)
  }

  /** @returns the held modifiers as a CDP bitmask. */
  modifiersMask(): number {
    return modifierMask([...this.heldModifiers])
  }

  /** @returns held modifier names (for status text). */
  modifiers(): ModifierName[] {
    return [...this.heldModifiers]
  }

  /** Record a mouse button going down or up. */
  setButton(button: MouseButton, pressed: boolean): void {
    const bit = BUTTON_BITS[button]
    if (pressed) this.pressedButtons |= bit
    else this.pressedButtons &= ~bit
  }

  /** @returns the pressed buttons as a CDP bitmask. */
  buttonsMask(): number {
    return this.pressedButtons
  }

  /** @returns pressed button names, in a stable order. */
  buttons(): MouseButton[] {
    return (Object.keys(BUTTON_BITS) as MouseButton[]).filter((button) => (this.pressedButtons & BUTTON_BITS[button]) !== 0)
  }

  /** Remember where the pointer was last dispatched. */
  setPointer(point: Point): void {
    this.lastPointer = { ...point }
  }

  /** @returns the last pointer position, when one was recorded. */
  pointer(): Point | undefined {
    return this.lastPointer === undefined ? undefined : { ...this.lastPointer }
  }

  /** Drop every held key, button, and position (navigation, detach, tab close). */
  reset(): void {
    this.heldModifiers.clear()
    this.pressedButtons = 0
    this.lastPointer = undefined
  }
}

/** One `InputState` per tab, created on demand. */
export class InputStateStore {
  private readonly states = new Map<number, InputState>()

  /** @returns the state for a tab, creating an empty one when needed. */
  get(tabId: number): InputState {
    let state = this.states.get(tabId)
    if (state === undefined) {
      state = new InputState()
      this.states.set(tabId, state)
    }
    return state
  }

  /** Reset and forget one tab's state. */
  reset(tabId: number): void {
    this.states.delete(tabId)
  }

  /** Reset and forget every tab's state. */
  clear(): void {
    this.states.clear()
  }
}

/** Modifier bitmask constant re-exported for callers that build chords. */
export { MODIFIER_BITS }
