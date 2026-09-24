import { describe, expect, test } from 'bun:test'
import { offlineMaps, TsMap } from 'ts-maps'
import { mountChildren } from '../src/runtime'

describe('offline-maps child', () => {
  test('is built from markup, opens as asked, and reports through DOM events', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const mapEl = document.createElement('div')
    mapEl.style.width = '430px'
    mapEl.style.height = '800px'
    root.appendChild(mapEl)
    const map = new TsMap(mapEl, { center: [37.78, -122.42], zoom: 15 })

    root.insertAdjacentHTML('beforeend', `<span hidden data-ts-map-child="offline-maps" data-options='${JSON.stringify({ open: true, position: 'topleft' })}'></span>`)

    let control: any = null
    const seen: Array<[string, unknown]> = []
    root.addEventListener('offlinemaps:ready', (e: any) => {
      control = e.detail.control
    })
    for (const name of ['openchange', 'modechange', 'complete'])
      root.addEventListener(`offlinemaps:${name}`, (e: any) => seen.push([name, name === 'openchange' ? e.detail.open : e.detail.onlyOffline]))

    const unmount = mountChildren(map, root)
    expect(control).not.toBeNull()
    expect(root.querySelector('.tsmap-top.tsmap-left .tsmap-offline-button')).not.toBeNull()
    expect(root.querySelector('.tsmap-offline-card')).not.toBeNull()
    expect(seen).toContainEqual(['openchange', true])

    control.sync({ onlyOffline: true })
    expect(seen).toContainEqual(['modechange', true])
    expect(control.maps).toBe(offlineMaps())
    control.sync({ onlyOffline: false })

    unmount()
    expect(root.querySelector('.tsmap-offline-button')).toBeNull()
    root.remove()
  })
})
