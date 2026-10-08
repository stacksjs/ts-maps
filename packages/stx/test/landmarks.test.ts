import { afterEach, describe, expect, test } from 'bun:test'
import { Map as MapInstance } from 'ts-maps'
import { mountChildren } from '../src/runtime'

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

afterEach(() => {
  document.body.replaceChildren()
})

const tick = (): Promise<void> => new Promise(r => setTimeout(r, 0))

function setup(): { root: HTMLElement, map: any } {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const mapEl = document.createElement('div')
  mapEl.style.width = '400px'
  mapEl.style.height = '400px'
  root.appendChild(mapEl)
  return { root, map: new MapInstance(mapEl, { center: AT, zoom: 17 }) }
}

describe('landmark child', () => {
  test('stands on the map, follows rotation, is made again for a new replace, and is removed on unmount', async () => {
    const { root, map } = setup()
    const options = { model: MODEL, position: AT, rotation: 0 }
    root.insertAdjacentHTML('beforeend', `<span hidden data-ts-map-child="landmark" data-options='${JSON.stringify(options)}'></span>`)
    const el = root.querySelector('[data-ts-map-child="landmark"]')!
    let landmark: any = null
    root.addEventListener('landmark:ready', (e: any) => { landmark = e.detail.landmark })

    const unmount = mountChildren(map, root)
    expect(map._scene3d.landmarks.has(landmark)).toBe(true)
    await landmark.ready()
    expect(landmark.model.count).toBe(3)
    expect(landmark.options.replace).toBe(true)

    const first = landmark
    el.setAttribute('data-options', JSON.stringify({ ...options, rotation: 45 }))
    await tick()
    expect(landmark).toBe(first)
    expect(landmark.options.rotation).toBe(45)

    el.setAttribute('data-options', JSON.stringify({ ...options, rotation: 45, replace: false }))
    await tick()
    expect(landmark).not.toBe(first)
    expect(map._scene3d.landmarks.has(first)).toBe(false)
    expect(landmark.options).toMatchObject({ replace: false, rotation: 45 })

    unmount()
    expect(map._scene3d.landmarks.size).toBe(0)
  })
})

describe('trees child', () => {
  test('plants trees on the map, follows its options, and clears them on unmount', async () => {
    const { root, map } = setup()
    root.insertAdjacentHTML('beforeend', `<span hidden data-ts-map-child="trees" data-options='${JSON.stringify({ spacing: 12 })}'></span>`)
    const el = root.querySelector('[data-ts-map-child="trees"]')!
    let trees: any = null
    root.addEventListener('trees:ready', (e: any) => { trees = e.detail.trees })

    const unmount = mountChildren(map, root)
    expect(map._scene3d.trees).toBe(trees)
    expect(trees.options.spacing).toBe(12)

    el.setAttribute('data-options', JSON.stringify({ spacing: 20, colors: ['#336633'] }))
    await tick()
    expect(map._scene3d.trees).toBe(trees)
    expect(trees.options).toMatchObject({ spacing: 20, colors: ['#336633'] })

    unmount()
    expect(map._scene3d.trees).toBeUndefined()
  })
})
