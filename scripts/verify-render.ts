#!/usr/bin/env bun
/* eslint-disable no-console, ts/no-top-level-await */
/**
 * End-to-end visual smoke test. Boots the core-map playground server on
 * a random port, opens one of the demo pages in a `Bun.WebView`, lets
 * the map paint (tiles are best-effort — the chrome renders regardless),
 * then screenshots and verifies the returned buffer is a valid PNG of
 * nontrivial size. Written so it can be run locally before a release;
 * not wired into CI because the webkit backend needs a GUI session.
 *
 * Usage:
 *   bun scripts/verify-render.ts                # screenshot 0-basics
 *   bun scripts/verify-render.ts 2-vector-tiles # pick a specific demo
 *
 * Artifacts:
 *   .render-check/<demo>.png — the captured image.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = new URL('..', import.meta.url).pathname
const PLAYGROUND = resolve(REPO_ROOT, 'playground', 'core-map')
const OUT_DIR = resolve(REPO_ROOT, '.render-check')

const DEMO = process.argv[2] ?? '0-basics'
const HTML = `${DEMO}.html`
const VIEWPORT_W = 1024
const VIEWPORT_H = 720
const SETTLE_MS = Number(Bun.env.RENDER_SETTLE_MS ?? 4000)

if (!existsSync(resolve(PLAYGROUND, HTML))) {
  console.error(`[verify-render] unknown demo: ${DEMO} (expected playground/core-map/${HTML})`)
  process.exit(2)
}

if (!existsSync(OUT_DIR))
  mkdirSync(OUT_DIR, { recursive: true })

// Boot the playground server on :0 so the OS picks a free port.
const serverProc = Bun.spawn({
  cmd: ['bun', '--bun', 'scripts/../playground/core-map/serve.ts'],
  cwd: REPO_ROOT,
  env: { ...process.env, PORT: '0' },
  stdout: 'pipe',
  stderr: 'pipe',
})

// Drain the server's stdout until we see the "running at http://..." line.
const port = await new Promise<number>((accept, reject) => {
  const reader = serverProc.stdout.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  const t = setTimeout(() => reject(new Error('server did not report its port in time')), 15000)
  ;(async () => {
    while (true) {
      const { value, done } = await reader.read()
      if (done)
        break
      buf += decoder.decode(value, { stream: true })
      const match = buf.match(/http:\/\/localhost:(\d+)/)
      if (match) {
        clearTimeout(t)
        accept(Number.parseInt(match[1]!, 10))
        reader.releaseLock()
        return
      }
    }
    clearTimeout(t)
    reject(new Error('server exited before emitting its port'))
  })()
})

const url = `http://localhost:${port}/core-map/${HTML}`
console.log(`[verify-render] opening WebView → ${url}`)

let exitCode = 0
let view: any = null
try {
  view = new Bun.WebView({
    url,
    width: VIEWPORT_W,
    height: VIEWPORT_H,
  })

  // Let the page fetch, parse, execute, and paint. Tiles are async —
  // we're not asserting exact tile content, just that the map chrome
  // and at least the SVG/Canvas panes draw.
  await new Promise(r => setTimeout(r, SETTLE_MS))

  const buf = await view.screenshot({ encoding: 'buffer', format: 'png' })
  console.log(`[verify-render] screenshot bytes: ${buf.byteLength}`)

  const PNG_MAGIC = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (buf[i] !== PNG_MAGIC[i])
      throw new Error(`bad PNG magic at byte ${i}: got ${buf[i]?.toString(16)}`)
  }

  // Guard against an empty-white screenshot: a blank PNG at 1024×720
  // compresses to ~2 KB. A map with attribution + controls + a few
  // tiles comes in much heavier. 8 KB is a soft floor.
  const SOFT_FLOOR = 8 * 1024
  if (buf.byteLength < SOFT_FLOOR) {
    console.warn(`[verify-render] screenshot is only ${buf.byteLength} bytes — map may not have painted.`)
    exitCode = 1
  }

  const outPath = resolve(OUT_DIR, `${DEMO}.png`)
  writeFileSync(outPath, buf)
  console.log(`[verify-render] wrote ${outPath}`)
}
catch (err) {
  console.error('[verify-render] failed:', err)
  exitCode = 1
}
finally {
  try { view?.destroy?.() } catch {}
  try { view?.terminate?.() } catch {}
  try { serverProc.kill() } catch {}
}

process.exit(exitCode)
