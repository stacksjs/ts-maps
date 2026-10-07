import { describe, expect, test } from 'bun:test'
import { createApp, h, nextTick, ref } from 'vue'
import { Landmark } from '../src/Landmark'
import { Map } from '../src/Map'
import { Trees } from '../src/Trees'

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
  await nextTick()
  await new Promise(r => setTimeout(r, 0))
  await nextTick()
}

describe('@ts-maps/vue Landmark', () => {
  test('stands on the map, follows rotation, and is removed on unmount', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const rotation = ref(0)
    const replace = ref<boolean | undefined>(undefined)
    let landmark: any
    const app = createApp({
      render: () => h(Map as any, { containerClass: 'ts-map-host', center: AT, zoom: 17 }, () => [
        h(Landmark as any, { model: MODEL, position: AT, rotation: rotation.value, replace: replace.value, onReady: (l: any) => (landmark = l) }),
      ]),
    })
    app.mount(host)
    await settle()
    const map = landmark._map
    expect(map._scene3d.landmarks.has(landmark)).toBe(true)
    await landmark.ready()
    expect(landmark.model.count).toBe(3)
    expect(landmark.options.replace).toBe(true)

    const first = landmark
    rotation.value = 45
    await settle()
    expect(landmark).toBe(first)
    expect(landmark.options.rotation).toBe(45)

    // A new `replace` makes the landmark again.
    replace.value = false
    await settle()
    expect(landmark).not.toBe(first)
    expect(map._scene3d.landmarks.has(first)).toBe(false)
    expect(landmark.options).toMatchObject({ replace: false, rotation: 45 })

    app.unmount()
    expect(map._scene3d.landmarks.size).toBe(0)
    host.remove()
  })
})

describe('@ts-maps/vue Trees', () => {
  test('plants trees on the map, follows its options, and clears them on unmount', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const spacing = ref(12)
    let trees: any
    const app = createApp({
      render: () => h(Map as any, { containerClass: 'ts-map-host', center: AT, zoom: 17 }, () => [
        h(Trees as any, { spacing: spacing.value, onReady: (t: any) => (trees = t) }),
      ]),
    })
    app.mount(host)
    await settle()
    const map = trees._map
    expect(map._scene3d.trees).toBe(trees)
    expect(trees.options.spacing).toBe(12)

    spacing.value = 20
    await settle()
    expect(map._scene3d.trees).toBe(trees)
    expect(trees.options.spacing).toBe(20)

    app.unmount()
    expect(map._scene3d.trees).toBeUndefined()
    host.remove()
  })
})
