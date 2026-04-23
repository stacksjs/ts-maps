// WorkerPool — a tiny fixed-size pool of Web Workers with round-robin
// dispatch, per-task correlation IDs, and a handler registry shared
// between the main thread (fallback path) and the worker script.
//
// The pool ships an inline worker script built from a blob URL: the script
// defines a `registry` of task handlers, listens for `{ id, type, payload }`
// messages, and posts `{ id, ok, result, error }` back. The handler bodies
// are stringified and injected into the worker at construction time, so
// task types added in userland never need a matching bundler entry — the
// runtime loads them by serialising the function.
//
// When `Worker` is unavailable (Node, SSR, very-happy-dom) the pool
// transparently falls back to main-thread execution: `run()` still resolves
// with the handler's result, and `shutdown()` is a no-op.

import { Pbf } from '../proto/Pbf'
import { VectorTile } from '../mvt/VectorTile'

export interface WorkerTask<T = unknown, _R = unknown> {
  type: string
  payload: T
}

// eslint-disable-next-line no-unused-vars
export type WorkerHandler<T = unknown, R = unknown> = (task: WorkerTask<T, R>) => R | Promise<R>

export interface WorkerPoolOptions {
  size?: number
  scriptUrl?: string
}

interface PendingTask {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

// ---------------------------------------------------------------------------
// Main-thread handler registry. Handlers registered here are used for the
// synchronous fallback path and also serialised into the inline worker so
// the worker thread can invoke the same logic on its own.
// ---------------------------------------------------------------------------

const mainThreadHandlers = new Map<string, WorkerHandler>()

export function registerWorkerHandler<T, R>(type: string, fn: WorkerHandler<T, R>): void {
  mainThreadHandlers.set(type, fn as WorkerHandler)
}

export function getWorkerHandler(type: string): WorkerHandler | undefined {
  return mainThreadHandlers.get(type)
}

// ---------------------------------------------------------------------------
// Built-in: mvt-decode. Receives a `Uint8Array` payload, runs the in-house
// Pbf + VectorTile pipeline, and returns a transferable feature summary
// (plain arrays of numbers / strings, no class instances).
// ---------------------------------------------------------------------------

export interface MvtDecodeResult {
  layers: Array<{
    name: string
    extent: number
    features: Array<{
      id?: number
      type: number
      properties: Record<string, string | number | boolean | null>
      geometry: Array<Array<{ x: number, y: number }>>
    }>
  }>
}

registerWorkerHandler<Uint8Array, MvtDecodeResult>('mvt-decode', ({ payload }) => {
  const pbf = new Pbf(payload)
  const tile = new VectorTile(pbf)
  const layers: MvtDecodeResult['layers'] = []
  for (const name of Object.keys(tile.layers)) {
    const layer = tile.layers[name]
    const features: MvtDecodeResult['layers'][number]['features'] = []
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i)
      features.push({
        id: f.id,
        type: f.type,
        properties: f.properties as Record<string, string | number | boolean | null>,
        geometry: f.loadGeometry().map(ring => ring.map(pt => ({ x: pt.x, y: pt.y }))),
      })
    }
    layers.push({ name, extent: layer.extent, features })
  }
  return { layers }
})

// ---------------------------------------------------------------------------
// Inline worker script. Built as a template string so we can inject the
// serialised handler registry verbatim. The worker keeps a mirror of the
// main-thread registry and re-registers on `{ __register, type, source }`
// control messages (used if callers want to ship additional handlers at
// runtime; ignored by tests that only exercise built-ins).
// ---------------------------------------------------------------------------

function buildWorkerScript(): string {
  // Serialise the built-in handlers as an initial registry. Each handler is
  // stringified via `Function.prototype.toString`; the worker rehydrates it
  // through `new Function(...)`. This intentionally mirrors the main-thread
  // logic — if a handler references closure-captured imports, the user must
  // either move it to the payload or supply `scriptUrl`.
  const entries: string[] = []
  for (const [type, fn] of mainThreadHandlers) {
    entries.push(`[${JSON.stringify(type)}, (${fn.toString()})]`)
  }
  return [
    `const registry = new Map([${entries.join(',')}]);`,
    'self.onmessage = async (e) => {',
    '  const data = e.data || {};',
    '  const id = data.id; const type = data.type; const payload = data.payload;',
    '  if (data.__register && type && data.source) {',
    '    try {',
    '      registry.set(type, new Function(`return (${data.source})`)());',
    '    }',
    '    catch (err) {',
    '      self.postMessage({ id: id, ok: false, error: String(err) });',
    '    }',
    '    return;',
    '  }',
    '  const handler = registry.get(type);',
    '  if (!handler) {',
    '    self.postMessage({ id: id, ok: false, error: `unknown task type: ${type}` });',
    '    return;',
    '  }',
    '  try {',
    '    const result = await handler({ type: type, payload: payload });',
    '    self.postMessage({ id: id, ok: true, result: result });',
    '  }',
    '  catch (err) {',
    '    self.postMessage({ id: id, ok: false, error: err && err.message ? err.message : String(err) });',
    '  }',
    '};',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Pool
// ---------------------------------------------------------------------------

export class WorkerPool {
  declare _size: number
  declare _scriptUrl?: string
  declare _workers: Worker[]
  declare _blobUrl?: string
  declare _nextId: number
  declare _pending: Map<number, PendingTask>
  declare _rr: number
  declare _usable: boolean

  constructor(opts?: WorkerPoolOptions) {
    this._size = Math.max(1, opts?.size ?? 2)
    this._scriptUrl = opts?.scriptUrl
    this._workers = []
    this._nextId = 1
    this._pending = new Map()
    this._rr = 0
    this._usable = this._canUseWorkers()

    if (this._usable)
      this._spawn()
  }

  size(): number {
    return this._usable ? this._workers.length : 0
  }

  _canUseWorkers(): boolean {
    if (typeof globalThis === 'undefined')
      return false
    const g = globalThis as any
    if (typeof g.Worker !== 'function')
      return false
    // We need Blob + URL.createObjectURL when no scriptUrl is supplied.
    if (!this._scriptUrl) {
      if (typeof g.Blob !== 'function')
        return false
      if (typeof g.URL === 'undefined' || typeof g.URL.createObjectURL !== 'function')
        return false
    }
    return true
  }

  _spawn(): void {
    const g = globalThis as any
    let url = this._scriptUrl
    if (!url) {
      const blob = new g.Blob([buildWorkerScript()], { type: 'application/javascript' })
      url = g.URL.createObjectURL(blob) as string
      this._blobUrl = url
    }
    for (let i = 0; i < this._size; i++) {
      try {
        const w = new g.Worker(url) as Worker
        w.onmessage = (e: MessageEvent) => this._onMessage(e)
        w.onerror = () => { /* individual errors surface via the pending task */ }
        this._workers.push(w)
      }
      catch {
        // If we can't actually spawn a worker, bail out and use the sync
        // fallback — matches the Node/very-happy-dom story.
        this._usable = false
        for (const existing of this._workers)
          existing.terminate()
        this._workers = []
        if (this._blobUrl && typeof g.URL?.revokeObjectURL === 'function') {
          g.URL.revokeObjectURL(this._blobUrl)
          this._blobUrl = undefined
        }
        return
      }
    }
  }

  _onMessage(e: MessageEvent): void {
    const { id, ok, result, error } = e.data || {}
    const pending = this._pending.get(id)
    if (!pending)
      return
    this._pending.delete(id)
    if (ok)
      pending.resolve(result)
    else
      pending.reject(new Error(error ?? 'worker task failed'))
  }

  async run<T, R>(task: WorkerTask<T, R>): Promise<R> {
    if (!this._usable || this._workers.length === 0) {
      const handler = mainThreadHandlers.get(task.type)
      if (!handler)
        throw new Error(`unknown task type: ${task.type}`)
      return await handler(task as WorkerTask) as R
    }

    const id = this._nextId++
    const worker = this._workers[this._rr % this._workers.length]
    this._rr++

    return await new Promise<R>((resolve, reject) => {
      this._pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      })
      try {
        worker.postMessage({ id, type: task.type, payload: task.payload })
      }
      catch (err) {
        this._pending.delete(id)
        reject(err)
      }
    })
  }

  async shutdown(): Promise<void> {
    for (const worker of this._workers)
      worker.terminate()
    this._workers = []
    const g = globalThis as any
    if (this._blobUrl && typeof g.URL?.revokeObjectURL === 'function') {
      g.URL.revokeObjectURL(this._blobUrl)
      this._blobUrl = undefined
    }
    for (const [, pending] of this._pending)
      pending.reject(new Error('pool shut down'))
    this._pending.clear()
  }
}
