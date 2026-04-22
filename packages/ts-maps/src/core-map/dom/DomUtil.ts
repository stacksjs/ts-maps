import * as DomEvent from './DomEvent'
import { Point } from '../geometry/Point'

export function get(id: string | HTMLElement): HTMLElement | null {
  return typeof id === 'string' ? document.getElementById(id) : id
}

export function create < K extends keyof HTMLElementTagNameMap > (tagName: K, className?: string, container?: HTMLElement | null): HTMLElementTagNameMap[K]
export function create(tagName: string, className?: string, container?: HTMLElement | null): HTMLElement
export function create(tagName: string, className?: string, container?: HTMLElement | null): HTMLElement {
  const el = document.createElement(tagName)
  el.className = className ?? ''
  container?.appendChild(el)
  return el
}

export function toFront(el: Element): void {
  const parent = el.parentNode
  if (parent && parent.lastChild !== el)
  parent.appendChild(el)
}

export function toBack(el: Element): void {
  const parent = el.parentNode
  if (parent && parent.firstChild !== el)
  parent.insertBefore(el, parent.firstChild)
}

export function setTransform(el: HTMLElement, offset?: Point | null, scale?: number, rotation?: number, pitch?: number): void {
  const pos = offset ?? new Point(0, 0)
  // Order is load-bearing. CSS applies transforms right-to-left to a local
  // point (inner-most is applied first), so the string
  //   translate3d → rotateX(pitch) → rotate(bearing) → scale
  // means: a local point is first scaled, then bearing-rotated around the
  // element's Z axis, then pitch-tilted around the SCREEN X axis (because
  // rotateX happens in the parent's frame AFTER the bearing spin is baked
  // in), then translated. This matches Mapbox: pitch tilts the post-bearing
  // plane toward the viewer, regardless of the map's bearing.
  const rotationPart = rotation ? ` rotate(${rotation}deg)` : ''
  const pitchPart = pitch ? ` rotateX(${pitch}deg)` : ''
  const scalePart = scale ? ` scale(${scale})` : ''
  el.style.transform = `translate3d(${pos.x}px,${pos.y}px,0)${pitchPart}${rotationPart}${scalePart}`
}

const positions = new WeakMap < Element, Point > ()
const rotations = new WeakMap < Element, number > ()
const pitches = new WeakMap < Element, number > ()

export function setPosition(el: HTMLElement, point: Point, rotation?: number, pitch?: number): void {
  positions.set(el, point)
  if (rotation !== undefined)
  rotations.set(el, rotation)
  if (pitch !== undefined)
  pitches.set(el, pitch)
  const storedRotation = rotation ?? rotations.get(el) ?? 0
  const storedPitch = pitch ?? pitches.get(el) ?? 0
  setTransform(el, point, undefined, storedRotation || undefined, storedPitch || undefined)
}

export function getPosition(el: HTMLElement): Point {
  return positions.get(el) ?? new Point(0, 0)
}

const documentStyle: any = typeof document === 'undefined' ? {} : document.documentElement.style
const userSelectProp = ['userSelect', 'WebkitUserSelect'].find(prop => prop in documentStyle) as string
let prevUserSelect: string | undefined

export function disableTextSelection(): void {
  const value = documentStyle[userSelectProp]
  if (value === 'none')
  return
  prevUserSelect = value
  documentStyle[userSelectProp] = 'none'
}

export function enableTextSelection(): void {
  if (typeof prevUserSelect === 'undefined')
  return
  documentStyle[userSelectProp] = prevUserSelect
  prevUserSelect = undefined
}

export function disableImageDrag(): void {
  DomEvent.on(window, 'dragstart', DomEvent.preventDefault)
}

export function enableImageDrag(): void {
  DomEvent.off(window, 'dragstart', DomEvent.preventDefault)
}

let _outlineElement: HTMLElement | undefined
let _outlineStyle: string | undefined

export function preventOutline(element: HTMLElement): void {
  let el: any = element
  while (el.tabIndex === -1) {
    el = el.parentNode
  }
  if (!el.style)
  return
  restoreOutline()
  _outlineElement = el
  _outlineStyle = el.style.outlineStyle
  el.style.outlineStyle = 'none'
  DomEvent.on(window, 'keydown', restoreOutline)
}

export function restoreOutline(): void {
  if (!_outlineElement)
  return
  _outlineElement.style.outlineStyle = _outlineStyle as string
  _outlineElement = undefined
  _outlineStyle = undefined
  DomEvent.off(window, 'keydown', restoreOutline)
}

export function getSizedParentNode(element: HTMLElement): HTMLElement {
  let el: any = element
  do {
    el = el.parentNode
  } while ((!el.offsetWidth || !el.offsetHeight) && el !== document.body)
  return el
}

export interface ScaleInfo {
  x: number
  y: number
  boundingClientRect: DOMRect
}

export function getScale(element: HTMLElement): ScaleInfo {
  const rect = element.getBoundingClientRect()
  return {
    x: rect.width / element.offsetWidth || 1,
    y: rect.height / element.offsetHeight || 1,
    boundingClientRect: rect,
  }
}
