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

export interface DoubleTapHandlers {
  dblclick: EventListener
  simDblclick: (ev: Event) => void
}

export function addDoubleTapListener(obj: any, handler: EventListener): DoubleTapHandlers {
  obj.addEventListener('dblclick', handler)

  let last = 0
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

    const now = Date.now()
    if (now - last <= delay) {
      detail++
      if (detail === 2) {
        ev.target.dispatchEvent(makeDblclick(ev))
      }
    }
    else {
      detail = 1
    }
    last = now
  }

  obj.addEventListener('click', simDblclick)

  return { dblclick: handler, simDblclick }
}

export function removeDoubleTapListener(obj: any, handlers: DoubleTapHandlers): void {
  obj.removeEventListener('dblclick', handlers.dblclick)
  obj.removeEventListener('click', handlers.simDblclick)
}
