import { afterEach, describe, expect, test } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Landmark, Map, Trees } from '../src'

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

const roots: Array<{ root: ReturnType<typeof createRoot>, host: HTMLElement }> = []
afterEach(() => {
  for (const { root, host } of roots.splice(0)) {
    act(() => root.unmount())
    host.remove()
  }
})

function mount(): { render: (child: ReturnType<typeof createElement> | null) => void } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push({ root, host })
  return {
    render: child => act(() => {
      root.render(createElement(Map, { center: AT, zoom: 17, containerStyle: { width: '400px', height: '400px' } }, child))
    }),
  }
}

describe('@ts-maps/react Landmark', () => {
  test('stands on the map, follows rotation, and is removed on unmount', async () => {
    const { render } = mount()
    let landmark: any
    const props = { model: MODEL as any, position: AT, onReady: (l: any) => (landmark = l) }
    render(createElement(Landmark, { ...props, rotation: 0 }))
    const map = landmark._map
    expect(map._scene3d.landmarks.has(landmark)).toBe(true)
    await act(() => landmark.ready())
    expect(landmark.model.count).toBe(3)
    expect(landmark.options.replace).toBe(true)

    const first = landmark
    render(createElement(Landmark, { ...props, rotation: 45 }))
    expect(landmark).toBe(first)
    expect(landmark.options.rotation).toBe(45)

    // A new `replace` makes the landmark again.
    render(createElement(Landmark, { ...props, rotation: 45, replace: false }))
    expect(landmark).not.toBe(first)
    expect(map._scene3d.landmarks.has(first)).toBe(false)
    expect(landmark.options.replace).toBe(false)
    expect(landmark.options.rotation).toBe(45)

    render(null)
    expect(map._scene3d.landmarks.size).toBe(0)
  })
})

describe('@ts-maps/react Trees', () => {
  test('plants trees on the map, follows its options, and clears them on unmount', () => {
    const { render } = mount()
    let trees: any
    render(createElement(Trees, { spacing: 12, onReady: (t: any) => (trees = t) }))
    const map = trees._map
    expect(map._scene3d.trees).toBe(trees)
    expect(trees.options.spacing).toBe(12)

    render(createElement(Trees, { spacing: 20, colors: ['#336633'] }))
    expect(map._scene3d.trees).toBe(trees)
    expect(trees.options).toMatchObject({ spacing: 20, colors: ['#336633'] })

    render(null)
    expect(map._scene3d.trees).toBeUndefined()
  })
})
