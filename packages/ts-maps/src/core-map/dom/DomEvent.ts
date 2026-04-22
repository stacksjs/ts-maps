import Browser from '../core/Browser'
import * as Util from '../core/Util'
import * as PointerEvents from './DomEvent.PointerEvents'
import { Point } from '../geometry/Point'
import { addDoubleTapListener, removeDoubleTapListener } from './DomEvent.DoubleTap'
import { getScale } from './DomUtil'

export { PointerEvents }

export function on(this: any, obj: any, types: any, fn?: any, context?: any): any {
  if (types && typeof types === 'object') {
    for (const [type, listener] of Object.entries(types)) {
      addOne(obj, type, listener as any, fn)
    }
  }
  else {
    for (const type of Util.splitWords(types)) {
      addOne(obj, type, fn, context)
    }
  }
  return this
}

const eventsKey = '_tsmap_events'

export function off(this: any, obj: any, types?: any, fn?: any, context?: any): any {
  if (arguments.length === 1) {
    batchRemove(obj)
    delete obj[eventsKey]
  }
  else if (types && typeof types === 'object') {
    for (const [type, listener] of Object.entries(types)) {
      removeOne(obj, type, listener as any, fn)
    }
  }
  else {
    const typesArr = Util.splitWords(types as string)
    if (arguments.length === 2) {
      batchRemove(obj, (type: string) => typesArr.includes(type))
    }
    else {
      for (const type of typesArr) {
        removeOne(obj, type, fn, context)
      }
    }
  }
  return this
}

function batchRemove(obj: any, filterFn?: (type: string) => boolean): void {
  for (const id of Object.keys(obj[eventsKey] ?? {})) {
    const type = id.split(/\d/)[0]
    if (!filterFn || filterFn(type)) {
      removeOne(obj, type, null, null, id)
    }
  }
}

const pointerSubst: Record<string, string | false> = {
  pointerenter: 'pointerover',
  pointerleave: 'pointerout',
  wheel: typeof window === 'undefined' ? false : !('onwheel' in window) && 'mousewheel',
}

function addOne(obj: any, type: string, fn: any, context?: any): void {
  const id = type + Util.stamp(fn) + (context ? `_${Util.stamp(context)}` : '')

  if (obj[eventsKey] && obj[eventsKey][id])
  return

  let handler: any = function (e: any): any {
    return fn.call(context || obj, e)
  }

  const originalHandler = handler

  if (Browser.touch && type === 'dblclick') {
    handler = addDoubleTapListener(obj, handler)
  }
  else if ('addEventListener' in obj) {
    if (type === 'wheel' || type === 'mousewheel') {
      obj.addEventListener(pointerSubst[type] || type, handler, { passive: false })
    }
    else if (type === 'pointerenter' || type === 'pointerleave') {
      handler = function (e: any): void {
        if (isExternalTarget(obj, e))
        originalHandler(e)
      }
      obj.addEventListener(pointerSubst[type], handler, false)
    }
    else {
      obj.addEventListener(type, originalHandler, false)
    }
  }
  else {
    obj.attachEvent(`on${type}`, handler)
  }

  obj[eventsKey] ??= {}
  obj[eventsKey][id] = handler
}

function removeOne(obj: any, type: string, fn: any, context?: any, id?: string): void {
  id ??= type + Util.stamp(fn) + (context ? `_${Util.stamp(context)}` : '')
  const handler = obj[eventsKey] && obj[eventsKey][id]

  if (!handler)
  return

  if (Browser.touch && type === 'dblclick') {
    removeDoubleTapListener(obj, handler)
  }
  else if ('removeEventListener' in obj) {
    obj.removeEventListener(pointerSubst[type] || type, handler, false)
  }
  else {
    obj.detachEvent(`on${type}`, handler)
  }

  obj[eventsKey][id] = null
}

export function stopPropagation(this: any, e: any): any {
  if (e.stopPropagation)
  e.stopPropagation()
  else if (e.originalEvent)
  e.originalEvent._stopped = true
  else
  e.cancelBubble = true
  return this
}

export function disableScrollPropagation(this: any, el: any): any {
  addOne(el, 'wheel', stopPropagation)
  return this
}

export function disableClickPropagation(this: any, el: any): any {
  on(el, 'pointerdown dblclick contextmenu', stopPropagation)
  el._tsmap_disable_click = true
  return this
}

export function preventDefault(this: any, e: any): any {
  e.preventDefault?.()
  return this
}

export function stop(this: any, e: any): any {
  preventDefault(e)
  stopPropagation(e)
  return this
}

export function getPropagationPath(ev: any): any[] {
  return ev.composedPath()
}

export function getPointerPosition(e: any, container?: HTMLElement): Point {
  if (!container)
  return new Point(e.clientX, e.clientY)

  const scale = getScale(container)
  const offset = scale.boundingClientRect

  return new Point(
  (e.clientX - offset.left) / scale.x - container.clientLeft,
  (e.clientY - offset.top) / scale.y - container.clientTop,
  )
}

export function getWheelPxFactor(): number {
  const ratio = window.devicePixelRatio
  return Browser.linux && Browser.chrome
  ? ratio
  : Browser.mac
  ? ratio * 3
  : ratio > 0 ? 2 * ratio : 1
}

export function getWheelDelta(e: any): number {
  return (e.deltaY && e.deltaMode === 0)
  ? -e.deltaY / getWheelPxFactor()
  : (e.deltaY && e.deltaMode === 1)
  ? -e.deltaY * 20
  : (e.deltaY && e.deltaMode === 2)
  ? -e.deltaY * 60
  : (e.deltaX || e.deltaZ) ? 0 : 0
}

export function isExternalTarget(el: Element, e: any): boolean {
  let related = e.relatedTarget
  if (!related)
  return true
  try {
    while (related && (related !== el)) {
      related = related.parentNode
    }
  }
  catch {
    return false
  }
  return related !== el
}
