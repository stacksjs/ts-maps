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

export function setTransform(el: HTMLElement, offset?: Point | null, scale?: number): void {
  const pos = offset ?? new Point(0, 0)
  el.style.transform = `translate3d(${pos.x}px,${pos.y}px,0)${scale ? ` scale($ {scale})` : ''}`
}

const positions = new WeakMap < Element, Point > ()

export function setPosition(el: HTMLElement, point: Point): void {
  positions.set(el, point)
  setTransform(el, point)
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
