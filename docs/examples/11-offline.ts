/**
 * Example 11 — Offline tiles.
 *
 * Download every tile inside the current viewport over zooms 10–12 into a
 * TileCache, then switch to a cache-only TileLayer so the map keeps
 * rendering with the network disabled.
 */

import { saveOfflineRegion, TileCache, tileLayer, TsMap } from '../../packages/ts-maps/src/core-map'

const map = new TsMap('map', { center: [51.5074, -0.1278], zoom: 11, maxZoom: 14 })

const cache = new TileCache({ dbName: 'ts-maps-docs-offline' })

let live = tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  cache,
})
live.addTo(map)

const info = document.getElementById('info') as HTMLDivElement
const dlBtn = document.getElementById('download') as HTMLButtonElement
const offBtn = document.getElementById('toggle') as HTMLButtonElement

let offline = false

async function download(): Promise<void> {
  dlBtn.disabled = true
  const b = map.getBounds()
  info.textContent = 'Downloading tiles…'
  try {
    const result = await saveOfflineRegion({
      bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
      zoomRange: [10, 12],
      tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      cache,
      concurrency: 4,
    })
    info.textContent = `Saved ${result.saved}, skipped ${result.skipped}, failed ${result.failed}`
  }
  catch (err) {
    info.textContent = `Error: ${(err as Error).message}`
  }
  dlBtn.disabled = false
}

function toggleOffline(): void {
  offline = !offline
  // Swap the fetch. In offline mode, only the cache can answer.
  if (offline) {
    const original = window.fetch.bind(window);
    (window as any).__originalFetch = original
    window.fetch = (function killed(): Promise<Response> {
      return Promise.reject(new TypeError('network disabled'))
    }) as unknown as typeof fetch
    offBtn.textContent = 'Re-enable network'
    info.textContent = 'Network off — panning now serves from cache only.'
  }
  else {
    const original = (window as any).__originalFetch as typeof fetch | undefined
    if (original) window.fetch = original
    offBtn.textContent = 'Disable network'
    info.textContent = 'Network on.'
  }
  // Force a redraw so tiles refetch (and cache-misses stay blank).
  live.remove()
  live = tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    cache,
  })
  live.addTo(map)
}

dlBtn.addEventListener('click', download)
offBtn.addEventListener('click', toggleOffline)
