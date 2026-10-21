// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { BUTTON_BITS, InputState, InputStateStore } from '../src/background/input-state.ts'
import { MODIFIER_BITS } from '../src/background/keys.ts'

describe('InputState', () => {
  it('tracks held modifiers until released', () => {
    const state = new InputState()
    state.setModifier('Shift', true)
    state.setModifier('Meta', true)
    expect(state.modifiersMask()).toBe(MODIFIER_BITS.Shift | MODIFIER_BITS.Meta)
    expect(state.modifiers()).toEqual(['Shift', 'Meta'])
    state.setModifier('Shift', false)
    expect(state.modifiersMask()).toBe(MODIFIER_BITS.Meta)
    expect(state.isModifierHeld('Shift')).toBe(false)
  })

  it('tracks pressed mouse buttons', () => {
    const state = new InputState()
    state.setButton('left', true)
    expect(state.buttonsMask()).toBe(BUTTON_BITS.left)
    state.setButton('right', true)
    expect(state.buttonsMask()).toBe(BUTTON_BITS.left | BUTTON_BITS.right)
    state.setButton('left', false)
    expect(state.buttons()).toEqual(['right'])
  })

  it('remembers the last pointer position by value', () => {
    const state = new InputState()
    state.setPointer({ x: 10, y: 20 })
    const copy = state.pointer()!
    copy.x = 99
    expect(state.pointer()).toEqual({ x: 10, y: 20 })
  })

  it('resets modifiers, buttons, and pointer together', () => {
    const state = new InputState()
    state.setModifier('Control', true)
    state.setButton('middle', true)
    state.setPointer({ x: 1, y: 2 })
    state.reset()
    expect(state.modifiersMask()).toBe(0)
    expect(state.buttonsMask()).toBe(0)
    expect(state.pointer()).toBeUndefined()
  })
})

describe('InputStateStore', () => {
  it('keeps one state per tab', () => {
    const store = new InputStateStore()
    store.get(1).setModifier('Alt', true)
    expect(store.get(1).modifiersMask()).toBe(MODIFIER_BITS.Alt)
    expect(store.get(2).modifiersMask()).toBe(0)
    store.reset(1)
    expect(store.get(1).modifiersMask()).toBe(0)
  })

  it('clears every tab', () => {
    const store = new InputStateStore()
    store.get(1).setButton('left', true)
    store.get(2).setButton('right', true)
    store.clear()
    expect(store.get(1).buttonsMask()).toBe(0)
    expect(store.get(2).buttonsMask()).toBe(0)
  })
})
