import { describe, expect, test } from 'bun:test'
import { Map as MapInstance } from 'ts-maps'
import { mapOptionsFrom, mountChildren } from '../src/runtime'

function mapIn(root: HTMLElement, locale?: string): MapInstance {
  const mapEl = document.createElement('div')
  mapEl.style.width = '430px'
  mapEl.style.height = '800px'
  root.appendChild(mapEl)
  return new MapInstance(mapEl, mapOptionsFrom({ center: [37.79, -122.4], zoom: 15, locale }))
}

describe('locale', () => {
  test('a map in German speaks German in the controls its markup declares', () => {
    expect(mapOptionsFrom({ locale: 'de' }).locale).toBe('de')
    const root = document.createElement('div')
    document.body.appendChild(root)
    const map = mapIn(root, 'de')
    root.insertAdjacentHTML('beforeend', `<span hidden data-ts-map-child="search" data-options='${JSON.stringify({ recents: false })}'></span>`)
    root.insertAdjacentHTML('beforeend', `<span hidden data-ts-map-child="control" data-type="zoom" data-options='${JSON.stringify({ position: 'topright' })}'></span>`)
    root.insertAdjacentHTML('beforeend', `<span hidden data-ts-map-child="offline-maps" data-options='{}'></span>`)
    root.addEventListener('search:ready', (e: any) => e.detail.control.sync({ provider: null, offline: null, details: null }))

    const unmount = mountChildren(map, root)
    expect(root.querySelector('.tsmap-search-input')?.getAttribute('placeholder')).toBe('Karten durchsuchen')
    // The map's own zoom control, and one the markup declares.
    expect(root.querySelector('.tsmap-top.tsmap-left .tsmap-control-zoom-in')?.getAttribute('title')).toBe('Vergrößern')
    expect(root.querySelector('.tsmap-top.tsmap-right .tsmap-control-zoom-in')?.getAttribute('title')).toBe('Vergrößern')
    expect(root.querySelector('.tsmap-offline-button')?.getAttribute('title')).toBe('Karten offline')

    unmount()
    map.remove()
    root.remove()
  })

  test('a control\'s own locale wins, and is followed after mount', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const map = mapIn(root, 'de')
    root.insertAdjacentHTML('beforeend', `<span hidden data-ts-map-child="search" data-options='${JSON.stringify({ recents: false, locale: 'en' })}'></span>`)
    root.insertAdjacentHTML('beforeend', `<span hidden data-ts-map-child="control" data-type="zoom" data-options='${JSON.stringify({ position: 'topright', locale: 'en' })}'></span>`)
    root.addEventListener('search:ready', (e: any) => e.detail.control.sync({ provider: null, offline: null, details: null }))

    const unmount = mountChildren(map, root)
    const input = (): Element | null => root.querySelector('.tsmap-search-input')
    expect(input()?.getAttribute('placeholder')).toBe('Search Maps')
    expect(root.querySelector('.tsmap-top.tsmap-right .tsmap-control-zoom-in')?.getAttribute('title')).toBe('Zoom in')

    root.querySelector('[data-ts-map-child="search"]')!.setAttribute('data-options', JSON.stringify({ recents: false, locale: 'de' }))
    await new Promise(r => setTimeout(r, 0))
    expect(input()?.getAttribute('placeholder')).toBe('Karten durchsuchen')

    unmount()
    map.remove()
    root.remove()
  })
})
