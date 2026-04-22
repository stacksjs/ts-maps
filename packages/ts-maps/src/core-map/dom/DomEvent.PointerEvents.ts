// Detects the pointers that are currently active on the document.

const activePointers = new Map < number, PointerEvent > ()

export function enablePointerDetection(el: Element): void {
  el.addEventListener('pointerdown', _onSet as EventListener, { capture: true })
  el.addEventListener('pointermove', _onUpdate as EventListener, { capture: true })
  el.addEventListener('pointerup', _onDelete as EventListener, { capture: true })
  el.addEventListener('pointercancel', _onDelete as EventListener, { capture: true })
  activePointers.clear()
}

export function disablePointerDetection(el: Element): void {
  el.removeEventListener('pointerdown', _onSet as EventListener, { capture: true } as any)
  el.removeEventListener('pointermove', _onUpdate as EventListener, { capture: true } as any)
  el.removeEventListener('pointerup', _onDelete as EventListener, { capture: true } as any)
  el.removeEventListener('pointercancel', _onDelete as EventListener, { capture: true } as any)
}

function _onSet(e: PointerEvent): void {
  (e.target as Element).setPointerCapture(e.pointerId)
  activePointers.set(e.pointerId, e)
}

function _onUpdate(e: PointerEvent): void {
  if (activePointers.has(e.pointerId))
  activePointers.set(e.pointerId, e)
}

function _onDelete(e: PointerEvent): void {
  (e.target as Element).releasePointerCapture(e.pointerId)
  activePointers.delete(e.pointerId)
}

export function getPointers(): PointerEvent[] {
  return [...activePointers.values()]
}

export function cleanupPointers(): void {
  activePointers.clear()
}
