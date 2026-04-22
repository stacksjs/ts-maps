import { Class } from './Class'

export class Handler extends Class {
  declare _map: any
  _enabled = false

  static addTo(this: any, map: any, name: string): any {
    map.addHandler(name, this)
    return this
  }

  initialize(...args: any[]): void {
    this._map = args[0]
  }

  enable(): this {
    if (this._enabled)
    return this
    this._enabled = true
    this.addHooks()
    return this
  }

  disable(): this {
    if (!this._enabled)
    return this
    this._enabled = false
    this.removeHooks()
    return this
  }

  enabled(): boolean {
    return !!this._enabled
  }

  // Extension methods — subclasses implement.
  addHooks(): void {}
  removeHooks(): void {}
}
