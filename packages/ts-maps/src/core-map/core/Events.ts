import * as Util from './Util'
import { Class } from './Class'

export interface EventListener {
  fn: (event?: any) => void
  ctx?: any
  once?: boolean
}

export type EventHandler = (event?: any) => void

// A set of methods shared between event-powered classes (like Map and Marker).
export class Evented extends Class {
  static __REMOVED_EVENTS: string[] = ['mousedown', 'mouseup', 'mouseover', 'mouseout', 'mousemove']

  declare _events?: Record<string, EventListener[]>
  declare _eventParents?: Record<number, Evented>
  declare _firingCount?: number

  on(types: string | Record<string, EventHandler>, fn?: EventHandler | any, context?: any): this {
    if (typeof types === 'object') {
      for (const [type, f] of Object.entries(types)) {
        this._on(type, f as EventHandler, fn)
      }
    }
    else {
      for (const type of Util.splitWords(types)) {
        this._on(type, fn as EventHandler, context)
      }
    }
    return this
  }

  off(types?: string | Record<string, EventHandler>, fn?: EventHandler | any, context?: any): this {
    if (!arguments.length) {
      delete this._events
    }
    else if (typeof types === 'object') {
      for (const [type, f] of Object.entries(types)) {
        this._off(type, f as EventHandler, fn)
      }
    }
    else {
      const removeAll = arguments.length === 1
      for (const type of Util.splitWords(types as string)) {
        if (removeAll) {
          this._off(type)
        }
        else {
          this._off(type, fn as EventHandler, context)
        }
      }
    }
    return this
  }

  _on(type: string, fn: EventHandler, context?: any, _once?: boolean): void {
    if (Evented.__REMOVED_EVENTS.includes(type)) {
      // eslint-disable-next-line no-console
      console.error(`The event ${type} has been removed. Use the PointerEvent variant instead.`)
    }

    if (typeof fn !== 'function') {
      // eslint-disable-next-line no-console
      console.warn(`wrong listener type: ${typeof fn}`)
      return
    }

    if (this._listens(type, fn, context) !== false)
    return

    if (context === this)
    context = undefined

    const newListener: EventListener = { fn, ctx: context }
    if (_once)
    newListener.once = true

    this._events ??= {}
    this._events[type] ??= []
    this._events[type].push(newListener)
  }

  _off(type: string, fn?: EventHandler, context?: any): void {
    if (!this._events)
    return

    let listeners = this._events[type]
    if (!listeners)
    return

    if (arguments.length === 1) {
      if (this._firingCount) {
        for (const listener of listeners) {
          listener.fn = Util.falseFn as any
        }
      }
      delete this._events[type]
      return
    }

    if (typeof fn !== 'function') {
      // eslint-disable-next-line no-console
      console.warn(`wrong listener type: ${typeof fn}`)
      return
    }

    const index = this._listens(type, fn, context)
    if (index !== false && typeof index === 'number') {
      const listener = listeners[index]
      if (this._firingCount) {
        listener.fn = Util.falseFn as any
        this._events[type] = listeners = listeners.slice()
      }
      listeners.splice(index, 1)
    }
  }

  fire(type: string, data?: Record<string, any>, propagate?: boolean): this {
    if (!this.listens(type, propagate))
    return this

    const event = {
      ...data,
      type,
      target: this,
      sourceTarget: data?.sourceTarget || this,
    }

    if (this._events) {
      const listeners = this._events[type]
      if (listeners) {
        this._firingCount = (this._firingCount || 0) + 1
        for (const l of listeners) {
          const fn = l.fn
          if (l.once)
          this.off(type, fn, l.ctx)
          fn.call(l.ctx || this, event)
        }
        this._firingCount--
      }
    }

    if (propagate)
    this._propagateEvent(event)

    return this
  }

  listens(type: string, fn?: EventHandler | boolean, context?: any, propagate?: boolean): boolean {
    if (typeof type !== 'string') {
      // eslint-disable-next-line no-console
      console.warn('"string" type argument expected')
    }

    let _fn = fn as EventHandler | undefined
    if (typeof fn !== 'function') {
      propagate = !!fn
      _fn = undefined
      context = undefined
    }

    if (this._events?.[type]?.length) {
      if (this._listens(type, _fn, context) !== false)
      return true
    }

    if (propagate) {
      for (const p of Object.values(this._eventParents ?? {})) {
        if (p.listens(type, fn as any, context, propagate))
        return true
      }
    }
    return false
  }

  _listens(type: string, fn?: EventHandler, context?: any): number | false {
    if (!this._events)
    return false

    const listeners = this._events[type] ?? []
    if (!fn)
    return listeners.length ? 0 : false

    if (context === this)
    context = undefined

    const index = listeners.findIndex(l => l.fn === fn && l.ctx === context)
    return index === -1 ? false : index
  }

  once(types: string | Record<string, EventHandler>, fn?: EventHandler | any, context?: any): this {
    if (typeof types === 'object') {
      for (const [type, f] of Object.entries(types)) {
        this._on(type, f as EventHandler, fn, true)
      }
    }
    else {
      for (const type of Util.splitWords(types)) {
        this._on(type, fn as EventHandler, context, true)
      }
    }
    return this
  }

  addEventParent(obj: Evented): this {
    this._eventParents ??= {}
    this._eventParents[Util.stamp(obj)] = obj
    return this
  }

  removeEventParent(obj: Evented): this {
    if (this._eventParents)
    delete this._eventParents[Util.stamp(obj)]
    return this
  }

  _propagateEvent(e: any): void {
    for (const p of Object.values(this._eventParents ?? {})) {
      p.fire(e.type, { propagatedFrom: e.target, ...e }, true)
    }
  }

  // Aliases that match the classic Evented API
  addEventListener: Evented['on'] = this.on
  removeEventListener: Evented['off'] = this.off
  clearAllEventListeners: Evented['off'] = this.off
  addOneTimeEventListener: Evented['once'] = this.once
  fireEvent: Evented['fire'] = this.fire
  hasEventListeners: Evented['listens'] = this.listens
}
