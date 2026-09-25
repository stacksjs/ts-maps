import * as DomEvent from './DomEvent'

function makeDblclick(ev: MouseEvent | PointerEvent): Event {
  let init: any = {
    bubbles: ev.bubbles,
    cancelable: ev.cancelable,
    composed: ev.composed,
    detail: 2,
    view: (ev as any).view,
    screenX: ev.screenX,
    screenY: ev.screenY,
    clientX: ev.clientX,
    clientY: ev.clientY,
    ctrlKey: ev.ctrlKey,
    shiftKey: ev.shiftKey,
    altKey: ev.altKey,
    metaKey: ev.metaKey,
    button: ev.button,
    buttons: ev.buttons,
    relatedTarget: ev.relatedTarget,
  }

  if (typeof PointerEvent !== 'undefined' && ev instanceof PointerEvent) {
    init = {
      ...init,
      pointerId: ev.pointerId,
      width: ev.width,
      height: ev.height,
      pressure: ev.pressure,
      tangentialPressure: ev.tangentialPressure,
      tiltX: ev.tiltX,
      tiltY: ev.tiltY,
      twist: ev.twist,
      pointerType: ev.pointerType,
      isPrimary: ev.isPrimary,
    }
    return new PointerEvent('dblclick', init)
  }
  return new MouseEvent('dblclick', init)
}

const delay = 200
/**
 * How far apart two taps may land and still be one double-tap. Two quick taps
 * in different places are two taps: on a map, a tap on one thing and then
 * another must not zoom it.
 */
const slop = 30

export interface DoubleTapHandlers {
  dblclick: EventListener
  simDblclick: (ev: Event) => void
}

export function addDoubleTapListener(obj: any, handler: EventListener): DoubleTapHandlers {
  obj.addEventListener('dblclick', handler)

  let last = 0
  let lastX = 0
  let lastY = 0
  let detail: number

  function simDblclick(ev: any): void {
    if (ev.detail !== 1) {
      detail = ev.detail
      return
    }

    if (ev.pointerType === 'mouse' || (ev.sourceCapabilities && !ev.sourceCapabilities.firesTouchEvents))
    return

    const path = DomEvent.getPropagationPath(ev)
    if (
    path.some((el: any) => el instanceof HTMLLabelElement && el.attributes.getNamedItem('for'))
    && !path.some((el: any) => (el instanceof HTMLInputElement || el instanceof HTMLSelectElement))
    ) {
      return
    }

    // A tap on a marker is the marker's: it does not start or finish a
    // double-tap on whatever the marker sits on.
    if (path.some((el: any) => el.classList?.contains('tsmap-marker-icon'))) {
      last = 0
      return
    }

    const now = Date.now()
    const near = Math.abs(ev.clientX - lastX) <= slop && Math.abs(ev.clientY - lastY) <= slop
    if (now - last <= delay && near) {
      detail++
      if (detail === 2) {
        ev.target.dispatchEvent(makeDblclick(ev))
      }
    }
    else {
      detail = 1
    }
    last = now
    lastX = ev.clientX
    lastY = ev.clientY
  }

  obj.addEventListener('click', simDblclick)

  return { dblclick: handler, simDblclick }
}

export function removeDoubleTapListener(obj: any, handlers: DoubleTapHandlers): void {
  obj.removeEventListener('dblclick', handlers.dblclick)
  obj.removeEventListener('click', handlers.simDblclick)
}
