import { describe, expect, test } from 'bun:test'
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
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

const settle = (): Promise<void> => new Promise(r => setTimeout(r, 0))

describe('@ts-maps/solid Landmark and Trees', () => {
  test('stand on the map, follow their props, and are removed on unmount', async () => {
    const el = document.createElement('div')
    el.style.width = '400px'
    el.style.height = '400px'
    document.body.appendChild(el)
    const [rotation, setRotation] = createSignal(0)
    const [replace, setReplace] = createSignal<boolean | undefined>(undefined)
    const [spacing, setSpacing] = createSignal(12)
    let landmark: any
    let trees: any
    const dispose = render(() => (
      <Map class="map" center={AT} zoom={17}>
        <Landmark model={MODEL} position={AT} rotation={rotation()} replace={replace()} onReady={(l) => { landmark = l }} />
        <Trees spacing={spacing()} onReady={(t) => { trees = t }} />
      </Map>
    ), el)

    await settle()
    const first = landmark
    const map = first._map
    expect(map._scene3d.landmarks.has(first)).toBe(true)
    await first.ready()
    expect(first.model.count).toBe(3)
    expect(first.options.replace).toBe(true)
    expect(map._scene3d.trees).toBe(trees)
    expect(trees.options.spacing).toBe(12)

    setRotation(45)
    setSpacing(20)
    expect(landmark).toBe(first)
    expect(first.options.rotation).toBe(45)
    expect(trees.options.spacing).toBe(20)
    expect(map._scene3d.trees).toBe(trees)

    // A new `replace` makes the landmark again.
    setReplace(false)
    expect(landmark).not.toBe(first)
    expect(map._scene3d.landmarks.has(first)).toBe(false)
    expect(landmark.options).toMatchObject({ replace: false, rotation: 45 })

    dispose()
    expect(map._scene3d.landmarks.size).toBe(0)
    expect(map._scene3d.trees).toBeUndefined()
    el.remove()
  })
})
