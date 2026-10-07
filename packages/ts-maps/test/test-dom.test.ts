import { describe, expect, test } from 'bun:test'

// Pins the behaviour of the test DOM (very-happy-dom, registered in
// preload.ts) that the controls rely on. Before 0.3, `toggle(name, false)`
// added the class, so a control that hides itself that way looked shown in
// tests and right only in a browser.

describe('test DOM classList', () => {
  test('toggle(name, false) removes the class, or leaves it absent', () => {
    const el = document.createElement('div')
    expect(el.classList.toggle('a', false)).toBe(false)
    expect(el.className).toBe('')
    el.className = 'a b'
    expect(el.classList.toggle('a', false)).toBe(false)
    expect(el.className).toBe('b')
  })

  test('toggle(name, true) adds the class once', () => {
    const el = document.createElement('div')
    expect(el.classList.toggle('a', true)).toBe(true)
    expect(el.classList.toggle('a', true)).toBe(true)
    expect(el.className).toBe('a')
  })

  test('toggle(name) flips it', () => {
    const el = document.createElement('div')
    expect(el.classList.toggle('a')).toBe(true)
    expect(el.classList.contains('a')).toBe(true)
    expect(el.classList.toggle('a')).toBe(false)
    expect(el.classList.contains('a')).toBe(false)
  })
})
