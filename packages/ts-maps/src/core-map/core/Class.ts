import * as Util from './Util'

export class Class {
  static include(props: Record<string, any>): typeof Class {
    const parentOptions = (this.prototype as any).options
    for (const k of getAllMethodNames(props)) {
      (this.prototype as any)[k] = props[k]
    }
    if (props.options) {
      (this.prototype as any).options = parentOptions
      this.mergeOptions(props.options)
    }
    return this

    function* getAllMethodNames(obj: any): Generator < string> {
      do {
        if (obj === Object || obj === Object.prototype)
        break
        for (const k of Object.getOwnPropertyNames(obj)) {
          yield k
        }
      } while ((obj = Object.getPrototypeOf(obj)) !== undefined)
    }
  }

  static setDefaultOptions(options: Record<string, any>): typeof Class {
    Util.setOptions(this.prototype as any, options)
    return this
  }

  static mergeOptions(options: Record<string, any>): typeof Class {
    (this.prototype as any).options ??= {}
    Object.assign((this.prototype as any).options, options)
    return this
  }

  static addInitHook(fn: string | (() => void), ...args: any[]): typeof Class {
    const init = typeof fn === 'function'
    ? fn
    : function (this: any) {
      this[fn].apply(this, args)
    }

    if (!Object.hasOwn(this.prototype, '_initHooks')) {
      (this.prototype as any)._initHooks = []
    }
    (this.prototype as any)._initHooks.push(init)
    return this
  }

  declare options?: Record<string, any>
  _initHooksCalled = false
  declare _initHooks?: Array<() => void>

  initialize(..._args: any[]): void {}

  constructor(...args: any[]) {
    Util.setOptions(this as any)
    this.initialize(...args)
    this.callInitHooks()
  }

  callInitHooks(): void {
    if (this._initHooksCalled)
    return

    const prototypes: any[] = []
    let current: any = this
    while ((current = Object.getPrototypeOf(current)) !== null) {
      prototypes.push(current)
    }
    prototypes.reverse()

    for (const proto of prototypes) {
      for (const hook of proto._initHooks ?? []) {
        hook.call(this)
      }
    }

    this._initHooksCalled = true
  }
}
