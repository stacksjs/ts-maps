import type { AnimationFrame } from '../src/core-map/dom/Animation'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Animation } from '../src/core-map/dom/Animation'
import { cubicBezier, easeInOutCubic, easeOutCubic, linear } from '../src/core-map/dom/easing'
import { LatLng } from '../src/core-map/geo/LatLng'
import { Point } from '../src/core-map/geometry/Point'
import { TsMap } from '../src/core-map/map/Map'

/**
 * Install a manual-tick stub for `requestAnimationFrame` /
 * `cancelAnimationFrame`. Returns a `tick(ms)` helper that advances virtual
 * time by `ms` and flushes every currently queued rAF callback, and a
 * `restore()` that puts the originals back. One-shot semantics mirror the
 * browser: callbacks scheduled DURING a flush run on the **next** tick.
 */
interface ManualRAF {
  tick: (ms: number) => void
  restore: () => void
}

function installManualRAF(): ManualRAF {
  const cbs = new Map<number, FrameRequestCallback>()
  let nextId = 1
  const origRAF = globalThis.requestAnimationFrame
  const origCAF = globalThis.cancelAnimationFrame
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
    const id = nextId++
    cbs.set(id, cb)
    return id
  }) as typeof globalThis.requestAnimationFrame
  globalThis.cancelAnimationFrame = ((id: number): void => { cbs.delete(id) }) as typeof globalThis.cancelAnimationFrame

  let virtualTime = 0
  const tick = (ms: number): void => {
    virtualTime += ms
    const snapshot = [...cbs.entries()]
    cbs.clear()
    for (const [, cb] of snapshot) cb(virtualTime)
  }
  const restore = (): void => {
    globalThis.requestAnimationFrame = origRAF
    globalThis.cancelAnimationFrame = origCAF
  }
  return { tick, restore }
}

function createContainer(): HTMLElement {
  const container = document.createElement('div')
  container.style.width = '800px'
  container.style.height = '600px'
  document.body.appendChild(container)
  return container
}

/**
 * very-happy-dom does not populate `clientWidth` / `clientHeight` from inline
 * styles, so `TsMap.getSize()` would otherwise return `(0, 0)`. Stamp an
 * explicit size into the map's internal slot, then recompute `_pixelOrigin`
 * using the now-correct size. Mirrors the helper in `bearing.test.ts`.
 */
function stampSize(map: TsMap, width: number, height: number): void {
  map._size = new Point(width, height)
  map._sizeChanged = false
  if (map._loaded && map._lastCenter)
    map._pixelOrigin = map._getNewPixelOrigin(map._lastCenter, map._zoom)
}

describe('Animation', () => {
  let rafStub: ManualRAF

  beforeEach(() => {
    rafStub = installManualRAF()
  })

  afterEach(() => {
    rafStub.restore()
  })

  test('drives onFrame each tick with monotonic t, ends with onEnd(true)', () => {
    const anim = new Animation()
    const frames: AnimationFrame[] = []
    let endCount = 0
    let endCompleted: boolean | undefined

    anim.run({
      duration: 100,
      easing: linear,
      onFrame: (f) => { frames.push(f) },
      onEnd: (c) => { endCount++; endCompleted = c },
    })

    // First tick pins the base time; we haven't fired any frames yet.
    rafStub.tick(0)
    expect(frames.length).toBe(1) // `_pendingStart` branch falls through to the normal emit path → first frame @ t=0
    expect(frames[0].t).toBe(0)
    rafStub.tick(25)
    rafStub.tick(25)
    rafStub.tick(25)
    rafStub.tick(25) // total = 100 → exit branch fires t=1 then finish(true)

    // Final frame is at t === 1 exactly.
    expect(frames[frames.length - 1].t).toBe(1)
    // Monotonic non-decreasing t.
    for (let i = 1; i < frames.length; i++)
      expect(frames[i].t).toBeGreaterThanOrEqual(frames[i - 1].t)
    expect(endCount).toBe(1)
    expect(endCompleted).toBe(true)
    expect(anim.isRunning()).toBe(false)
  })

  test('onStart fires before the first onFrame', () => {
    const anim = new Animation()
    const order: string[] = []

    anim.run({
      duration: 50,
      onStart: () => { order.push('start') },
      onFrame: () => { order.push('frame') },
      onEnd: () => { order.push('end') },
    })

    rafStub.tick(0)
    expect(order[0]).toBe('start')
    expect(order[1]).toBe('frame')
  })

  test('cancel() mid-animation fires onEnd(false); a fresh run starts clean', () => {
    const anim = new Animation()
    const frames: AnimationFrame[] = []
    const ends: boolean[] = []

    anim.run({
      duration: 200,
      onFrame: (f) => { frames.push(f) },
      onEnd: (c) => { ends.push(c) },
    })
    rafStub.tick(0)
    rafStub.tick(50)
    expect(anim.isRunning()).toBe(true)
    const beforeCancelCount = frames.length

    anim.cancel()
    expect(anim.isRunning()).toBe(false)
    expect(ends).toEqual([false])

    // Cancel must not emit more frames.
    rafStub.tick(100)
    expect(frames.length).toBe(beforeCancelCount)

    // Fresh run on the same instance — independent bookkeeping.
    const frames2: AnimationFrame[] = []
    const ends2: boolean[] = []
    anim.run({
      duration: 50,
      easing: linear,
      onFrame: (f) => { frames2.push(f) },
      onEnd: (c) => { ends2.push(c) },
    })
    rafStub.tick(0)
    rafStub.tick(50)
    expect(frames2[frames2.length - 1].t).toBe(1)
    expect(ends2).toEqual([true])
  })

  test('duration === 0 emits a single t=1 frame then onEnd(true)', () => {
    const anim = new Animation()
    const frames: AnimationFrame[] = []
    const ends: boolean[] = []

    anim.run({
      duration: 0,
      onFrame: (f) => { frames.push(f) },
      onEnd: (c) => { ends.push(c) },
    })
    rafStub.tick(0)

    expect(frames.length).toBe(1)
    expect(frames[0].t).toBe(1)
    expect(frames[0].progress).toBe(1)
    expect(ends).toEqual([true])
    expect(anim.isRunning()).toBe(false)
  })

  test('re-entering run() cancels the previous animation (onEnd(false) for old, clean start for new)', () => {
    const anim = new Animation()
    const aFrames: AnimationFrame[] = []
    const aEnds: boolean[] = []
    const bFrames: AnimationFrame[] = []
    const bEnds: boolean[] = []

    anim.run({
      duration: 200,
      onFrame: (f) => { aFrames.push(f) },
      onEnd: (c) => { aEnds.push(c) },
    })
    rafStub.tick(0)
    rafStub.tick(50)

    // Start a second animation while the first is in flight.
    anim.run({
      duration: 100,
      easing: linear,
      onFrame: (f) => { bFrames.push(f) },
      onEnd: (c) => { bEnds.push(c) },
    })

    // The previous animation ended with completed=false.
    expect(aEnds).toEqual([false])

    rafStub.tick(0)
    rafStub.tick(100)
    expect(bFrames[bFrames.length - 1].t).toBe(1)
    expect(bEnds).toEqual([true])
    // The old callback never fired again.
    expect(aEnds).toEqual([false])
  })

  test('isRunning() transitions correctly', () => {
    const anim = new Animation()
    expect(anim.isRunning()).toBe(false)
    anim.run({ duration: 50, onFrame: () => {} })
    expect(anim.isRunning()).toBe(true)
    rafStub.tick(0)
    expect(anim.isRunning()).toBe(true)
    rafStub.tick(50)
    expect(anim.isRunning()).toBe(false)
  })

  test('fires start / frame / end events alongside the callbacks', () => {
    const anim = new Animation()
    const seen: Array<{ type: string, data?: any }> = []

    anim.on('start', () => { seen.push({ type: 'start' }) })
    anim.on('frame', (e: any) => { seen.push({ type: 'frame', data: { t: e.t, progress: e.progress } }) })
    anim.on('end', (e: any) => { seen.push({ type: 'end', data: { completed: e.completed } }) })

    anim.run({ duration: 50, easing: linear, onFrame: () => {} })
    rafStub.tick(0)
    rafStub.tick(50)

    // First event is `start`.
    expect(seen[0].type).toBe('start')
    // At least one `frame` event fired.
    expect(seen.some(s => s.type === 'frame')).toBe(true)
    // Last event is `end` with completed=true.
    const last = seen[seen.length - 1]
    expect(last.type).toBe('end')
    expect(last.data.completed).toBe(true)
  })

  test('stop() is an alias for cancel()', () => {
    const anim = new Animation()
    const ends: boolean[] = []
    anim.run({
      duration: 200,
      onFrame: () => {},
      onEnd: (c) => { ends.push(c) },
    })
    rafStub.tick(0)
    anim.stop()
    expect(anim.isRunning()).toBe(false)
    expect(ends).toEqual([false])
  })
})

describe('easing', () => {
  test('linear is the identity on the unit interval', () => {
    expect(linear(0)).toBe(0)
    expect(linear(0.5)).toBe(0.5)
    expect(linear(1)).toBe(1)
  })

  test('easeInOutCubic fixes endpoints and passes through 0.5 at t=0.5', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
    expect(Math.abs(easeInOutCubic(0.5) - 0.5)).toBeLessThan(1e-9)
  })

  test('easeOutCubic pulls ahead past 0.5 at t=0.5', () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
  })

  test('cubicBezier(0.25, 0.1, 0.25, 1)(0.5) is in (0.6, 0.9) — canonical CSS ease', () => {
    const ease = cubicBezier(0.25, 0.1, 0.25, 1)
    const v = ease(0.5)
    expect(v).toBeGreaterThan(0.6)
    expect(v).toBeLessThan(0.9)
  })

  test('cubicBezier(0, 0, 1, 1) is the identity', () => {
    const id = cubicBezier(0, 0, 1, 1)
    for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      expect(Math.abs(id(t) - t)).toBeLessThan(1e-4)
    }
  })
})

describe('Map camera animations', () => {
  let rafStub: ManualRAF

  beforeEach(() => {
    rafStub = installManualRAF()
  })

  afterEach(() => {
    rafStub.restore()
  })

  test('easeTo interpolates zoom / bearing / pitch and lands exactly on target', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    stampSize(map, 800, 600)

    map.easeTo({ zoom: 10, bearing: 45, pitch: 30, duration: 200 })
    expect(map.isEasing()).toBe(true)

    rafStub.tick(0)
    rafStub.tick(100)
    expect(map.isEasing()).toBe(true)
    rafStub.tick(200) // push well past 200 ms of elapsed virtual time

    expect(map.isEasing()).toBe(false)
    expect(map.getZoom()).toBe(10)
    expect(map.getBearing()).toBe(45)
    expect(map.getPitch()).toBe(30)
  })

  test('isEasing() is true mid-animation and false after it ends', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    stampSize(map, 800, 600)

    expect(map.isEasing()).toBe(false)
    map.easeTo({ bearing: 90, duration: 100 })
    expect(map.isEasing()).toBe(true)
    rafStub.tick(0)
    rafStub.tick(50)
    expect(map.isEasing()).toBe(true)
    rafStub.tick(100)
    expect(map.isEasing()).toBe(false)
  })

  // When a second animated `rotateTo` supersedes the first, the camera
  // animation engine fires `onEnd(completed=false)` for the cancelled one —
  // and `easeTo`'s `onEnd` unconditionally fires `rotateend` in that branch.
  // The fresh `rotateTo` then fires its own `rotatestart` / `rotateend` pair.
  // Net: `rotateend` fires TWICE across the two calls (once for the
  // cancellation, once for the completion). This matches Mapbox GL JS's
  // behavior.
  test('re-entrant rotateTo: second call cancels the first; rotateend fires twice', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    stampSize(map, 800, 600)

    let rotateEndCount = 0
    map.on('rotateend', () => { rotateEndCount++ })

    map.rotateTo(90, { animate: true, duration: 50 })
    rafStub.tick(0)
    rafStub.tick(10)
    // Supersede the first animation.
    map.rotateTo(0, { animate: true, duration: 50 })
    // Cancel path fired the first rotateend.
    expect(rotateEndCount).toBe(1)

    rafStub.tick(0)
    rafStub.tick(50)

    // Second rotateend after the new animation completes naturally.
    expect(rotateEndCount).toBe(2)
    expect(map.getBearing()).toBe(0)
    expect(map.isEasing()).toBe(false)
  })

  test('flyTo lands within 1 meter of the requested center', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    stampSize(map, 800, 600)

    const target = new LatLng(40, -74)
    map.flyTo(target, 8, { duration: 200 })

    rafStub.tick(0)
    // Flush enough frames to blow past the 200 ms budget regardless of
    // per-tick progress accounting.
    rafStub.tick(50)
    rafStub.tick(50)
    rafStub.tick(50)
    rafStub.tick(100)
    rafStub.tick(100)

    expect(map.isEasing()).toBe(false)
    expect(map.getZoom()).toBe(8)
    const dist = map.getCenter().distanceTo(target)
    expect(dist).toBeLessThan(1)
  })

  test('pitchTo animates to the exact target pitch', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    stampSize(map, 800, 600)

    map.pitchTo(60, { animate: true, duration: 100 })
    expect(map.isEasing()).toBe(true)

    rafStub.tick(0)
    rafStub.tick(50)
    rafStub.tick(100)

    expect(map.getPitch()).toBe(60)
    expect(map.isEasing()).toBe(false)
  })

  test('regression: setView on a fresh (unloaded) map still applies synchronously', () => {
    // This mirrors the guarantee asserted in `test/map.test.ts`. We keep it
    // here too because introducing the camera animation engine touches the
    // `_stop()` path that `setView` calls, and we want a dedicated regression
    // test in the animation file.
    const container = createContainer()
    const map = new TsMap(container)
    expect(map._loaded).toBeFalsy()

    map.setView([0, 0], 5)

    expect(map._zoom).toBe(5)
    expect(map._loaded).toBe(true)
  })
})
