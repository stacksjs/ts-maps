import type { EventRegistry } from './types'

const eventRegistry: EventRegistry = {}
let eventUid = 1

const EventHandler = {
  on(element: HTMLElement, event: string, handler: EventListenerOrEventListenerObject, options: AddEventListenerOptions = {}): void {
    const uid = `jvm:${event}::${eventUid++}`

    eventRegistry[uid] = {
      selector: element,
      handler,
    }

    // Add _uid property to the handler
    if (typeof handler === 'function') {
      (handler as any)._uid = uid
    }
    else {
      (handler as any)._uid = uid
    }

    element.addEventListener(event, handler, options)
  },

  delegate(element: HTMLElement, event: string, selector: string, handler: (e: Event) => void): void {
    const events = event.split(' ')

    events.forEach((eventName) => {
      EventHandler.on(element, eventName, (e: Event) => {
        const target = e.target as Element

        if (target && target.matches && target.matches(selector)) {
          handler.call(target, e)
        }
      })
    })
  },

  off(element: HTMLElement, event: string, handler: EventListenerOrEventListenerObject): void {
    const eventType = event.split(':')[1]

    element.removeEventListener(eventType, handler)

    delete eventRegistry[(handler as any)._uid]
  },

  flush(): void {
    Object.keys(eventRegistry).forEach((event) => {
      EventHandler.off(eventRegistry[event].selector, event, eventRegistry[event].handler)
    })
  },

  getEventRegistry(): EventRegistry {
    return eventRegistry
  },
}

export default EventHandler
