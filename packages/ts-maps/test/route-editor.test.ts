import { describe, expect, test } from 'bun:test'
import { RouteEditor, TsMap } from '../src/core-map'
import { Point } from '../src/core-map/geometry/Point'
import { RouteBuilder } from '../src/core-map/services'

const a = { lat: 32.9209, lng: -117.2528 }
const b = { lat: 32.9265, lng: -117.2555 }
const c = { lat: 32.9300, lng: -117.2500 }

function createMap(): TsMap {
  const container = document.createElement('div')
  container.style.width = '800px'
  container.style.height = '600px'
  document.body.appendChild(container)
  const map = new TsMap(container, { center: [a.lat, a.lng], zoom: 15 })
  map._size = new Point(800, 600)
  map._sizeChanged = false
  return map
}

async function editorWith(points: typeof a[]): Promise<{ map: TsMap, builder: RouteBuilder, editor: RouteEditor }> {
  const map = createMap()
  const builder = new RouteBuilder()
  for (const p of points)
    await builder.add(p)
  const editor = new RouteEditor(builder).addTo(map)
  return { map, builder, editor }
}

function handleKinds(editor: RouteEditor): string[] {
  return editor._handles.map(m => (m as any)._route.kind)
}

describe('RouteEditor', () => {
  test('a tap on the map adds a waypoint at the end', async () => {
    const { map, builder, editor } = await editorWith([])
    const edits: string[] = []
    editor.on('edit', (e: any) => edits.push(e.action))
    map.fire('click', { latlng: a })
    map.fire('click', { latlng: b })
    await builder.settled()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(builder.waypoints).toEqual([a, b])
    expect(edits).toEqual(['add', 'add'])
    expect(handleKinds(editor)).toEqual(['start', 'end'])
    map.fire('click', { latlng: c })
    await builder.settled()
    await new Promise(resolve => setTimeout(resolve, 0))
    // The old end is a waypoint now, and says so to a screen reader.
    expect(editor._handles[1].getElement()!.getAttribute('title')).toMatch(/^Waypoint/)
  })

  test('draws one handle per distinct point, and a halfway handle on legs long enough to pull', async () => {
    const { builder, editor } = await editorWith([a, b, c])
    expect(handleKinds(editor)).toEqual(['start', 'via', 'end'])
    expect(editor._midpoints).toHaveLength(2)
    await builder.closeLoop()
    await builder.settled()
    // The loop's end is its start: no second handle on top of the first.
    expect(handleKinds(editor)).toEqual(['start', 'via', 'via'])
    expect(editor._midpoints).toHaveLength(3)
  })

  test('dragging a waypoint moves it', async () => {
    const { builder, editor } = await editorWith([a, b, c])
    const handle = editor._handles[1]
    const to = { lat: 32.9280, lng: -117.2600 }
    handle.fire('dragstart')
    handle.setLatLng([to.lat, to.lng])
    handle.fire('drag', { latlng: to })
    // The preview joins both neighbours to the dragged point.
    expect(editor._preview.getLatLngs()).toHaveLength(2)
    handle.fire('dragend')
    await new Promise(resolve => setTimeout(resolve, 0))
    await builder.settled()
    expect(builder.waypoints[1].lat).toBeCloseTo(to.lat, 6)
    expect(builder.waypoints[1].lng).toBeCloseTo(to.lng, 6)
    expect(editor._preview.getLatLngs()).toHaveLength(0)
  })

  test('dragging a halfway handle routes through a new waypoint', async () => {
    const { builder, editor } = await editorWith([a, c])
    const midpoint = editor._midpoints[0]
    const through = { lat: 32.9250, lng: -117.2600 }
    midpoint.fire('dragstart')
    midpoint.setLatLng([through.lat, through.lng])
    midpoint.fire('dragend')
    await new Promise(resolve => setTimeout(resolve, 0))
    await builder.settled()
    expect(builder.waypoints).toHaveLength(3)
    expect(builder.waypoints[0]).toEqual(a)
    expect(builder.waypoints[2]).toEqual(c)
    expect(handleKinds(editor)).toEqual(['start', 'via', 'end'])
  })

  test('tapping a waypoint removes it, unless removal is off', async () => {
    const { builder, editor } = await editorWith([a, b, c])
    editor._handles[1].fire('click')
    await new Promise(resolve => setTimeout(resolve, 0))
    await builder.settled()
    expect(builder.waypoints).toEqual([a, c])

    const kept = await editorWith([a, b, c])
    kept.editor.options!.removeOnTap = false
    kept.editor._handles[1].fire('click')
    await kept.builder.settled()
    expect(kept.builder.waypoints).toEqual([a, b, c])
  })

  test('removing the editor takes its layers off the map', async () => {
    const { map, editor } = await editorWith([a, b])
    const layers = [editor._line, editor._casing, editor._hit, ...editor._handles]
    editor.remove()
    for (const layer of layers)
      expect(map.hasLayer(layer)).toBe(false)
  })
})
