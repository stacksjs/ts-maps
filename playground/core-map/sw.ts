/**
 * The offline demo's service worker, built from `ts-maps/offline-sw`: the
 * page and everything it loads are cached as they are fetched, so after one
 * visit it opens with the network off, and downloads go to Background Fetch
 * where the browser has it.
 */

import { offlineServiceWorker } from '../../packages/ts-maps/src/offline-sw'

offlineServiceWorker({
  shell: ['./14-offline.html'],
  cache: 'ts-maps-playground-v1',
  // The page's scripts are split into hashed chunks, so rather than list
  // them, keep whatever it loads from here.
  runtime: url => !url.pathname.endsWith('/sw.js'),
})
