import { describe, expect, test } from 'bun:test'
import { flushSync, mount, unmount } from 'svelte'

// A 10 m wedge as glTF, its buffer inline: no fetch.
const positions = new Float32Array([-1, 0, 0, 1, 0, 0, 0, 10, 0])
const MODEL = {
  asset: { version: '2.0' },
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
  bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
  buffers: [{ byteLength: positions.byteLength, uri: `data:application/octet-stream;base64,${Buffer.from(positions.buffer).toString('base64')}` }],
}
const AT: [number, number] = [37.7952, -122.4028]

const settle = async (): Promise<void> => {
  flushSync()
  await new Promise(r => setTimeout(r, 0))
  flushSync()
}

describe('@ts-maps/svelte Landmark and Trees', () => {
  test('stand on the map, follow their props, and are removed on unmount', async () => {
    const WithLandmarks = (await import('./fixtures/WithLandmarks.svelte')).default
    const el = document.createElement('div')
    el.style.width = '400px'
    el.style.height = '400px'
    document.body.appendChild(el)
    const app = mount(WithLandmarks, { target: el, props: { model: MODEL, center: AT, rotation: 0, spacing: 12 } }) as any

    await settle()
    const first = app.getLandmark()
    const trees = app.getTrees()
    const map = first._map
    expect(map._scene3d.landmarks.has(first)).toBe(true)
    await first.ready()
    expect(first.model.count).toBe(3)
    expect(first.options.replace).toBe(true)
    expect(map._scene3d.trees).toBe(trees)
    expect(trees.options.spacing).toBe(12)

    app.set({ rotation: 45, spacing: 20 })
    await settle()
    expect(app.getLandmark()).toBe(first)
    expect(first.options.rotation).toBe(45)
    expect(app.getTrees()).toBe(trees)
    expect(trees.options.spacing).toBe(20)

    // A new `replace` makes the landmark again.
    app.set({ replace: false })
    await settle()
    const second = app.getLandmark()
    expect(second).not.toBe(first)
    expect(map._scene3d.landmarks.has(first)).toBe(false)
    expect(second.options).toMatchObject({ replace: false, rotation: 45 })

    unmount(app)
    flushSync()
    expect(map._scene3d.landmarks.size).toBe(0)
    expect(map._scene3d.trees).toBeUndefined()
    el.remove()
  })
})
