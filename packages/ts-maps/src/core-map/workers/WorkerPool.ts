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

import type { FlatTile } from './decodeMvtFlat'
import { decodeMvtFlat, flatTileBuffers } from './decodeMvtFlat'

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
//
// Serialisation is the constraint that shapes everything below: a handler
// reaches the worker as source text, so anything it closes over — an import,
// a module constant, a sibling function — is undefined by the time it runs.
// Handlers may declare the functions they need as `deps`; those are
// stringified alongside and evaluated in the worker's own scope first.
// ---------------------------------------------------------------------------

interface RegisteredHandler {
  fn: WorkerHandler
  deps: Array<(...args: any[]) => any>
  /** Buffers to hand over rather than copy, given a result. */
  transfer?: (result: any) => ArrayBuffer[]
}

const mainThreadHandlers = new Map<string, RegisteredHandler>()

export interface RegisterOptions {
  /**
   * Functions the handler references. Each is emitted into the worker under
   * its own name before the handler runs, so a handler can call them exactly
   * as it does on the main thread. They are subject to the same rule: a dep
   * that closes over an import will not work in the worker.
   */
  deps?: Array<(...args: any[]) => any>
  /** Given a result, the buffers to transfer instead of copying. */
  transfer?: (result: any) => ArrayBuffer[]
}

export function registerWorkerHandler<T, R>(
  type: string,
  fn: WorkerHandler<T, R>,
  options: RegisterOptions = {},
): void {
  mainThreadHandlers.set(type, {
    fn: fn as WorkerHandler,
    deps: options.deps ?? [],
    transfer: options.transfer,
  })
}

export function getWorkerHandler(type: string): WorkerHandler | undefined {
  return mainThreadHandlers.get(type)?.fn
}

// ---------------------------------------------------------------------------
// Built-in: mvt-decode. Takes the raw `.pbf` bytes and returns flat typed
// arrays, whose buffers are transferred rather than copied.
//
// The shape matters as much as the threading. An earlier version of this
// handler returned features as arrays of `{ x, y }` objects, which is a
// straightforward way to lose the entire benefit: a decoded tile is hundreds
// of thousands of small objects, and structured-clone has to walk and rebuild
// every one of them on the way back. The clone then costs more than the
// decode it was meant to move off the main thread. Typed arrays are handed
// over by reference, so what crosses the boundary is a pointer.
// ---------------------------------------------------------------------------

registerWorkerHandler<Uint8Array, FlatTile>(
  'mvt-decode',
  ({ payload }) => decodeMvtFlat(payload),
  { deps: [decodeMvtFlat], transfer: (result: FlatTile) => flatTileBuffers(result) },
)

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
  const deps: string[] = []
  const seen = new Set<string>()
  for (const [type, handler] of mainThreadHandlers) {
    for (const dep of handler.deps) {
      // Named, and emitted once: two handlers may legitimately share one.
      if (!dep.name || seen.has(dep.name))
        continue
      seen.add(dep.name)
      deps.push(`const ${dep.name} = ${dep.toString()};`)
    }
    entries.push(`[${JSON.stringify(type)}, (${handler.fn.toString()})]`)
  }
  return [
    ...deps,
    // Buffers are handed over rather than copied. Found by walking the
    // result, so a handler does not have to describe its own layout twice.
    'function collectTransferables(value) {',
    '  const out = []; const seen = new Set();',
    '  const walk = (v) => {',
    '    if (!v || typeof v !== "object" || seen.has(v)) return;',
    '    seen.add(v);',
    '    if (ArrayBuffer.isView(v)) { out.push(v.buffer); return; }',
    '    if (v instanceof ArrayBuffer) { out.push(v); return; }',
    '    if (Array.isArray(v)) { for (const item of v) walk(item); return; }',
    '    for (const key of Object.keys(v)) walk(v[key]);',
    '  };',
    '  walk(value);',
    '  return out;',
    '}',
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
    '    const transfer = collectTransferables(result);',
    '    self.postMessage({ id: id, ok: true, result: result }, transfer);',
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
      return await handler.fn(task as WorkerTask) as R
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
