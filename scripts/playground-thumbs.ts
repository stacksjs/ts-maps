#!/usr/bin/env bun
/* eslint-disable no-console */
/**
 * Pictures of each playground demo, for the gallery at /playground/, and of
 * each docs example, for the one at /examples/.
 *
 *   bun scripts/playground-thumbs.ts [baseUrl] [--examples] [name…]
 *
 * Opens every demo in headless Chrome, waits for its map to finish drawing,
 * and saves the top of the window (above the demo's info card) as
 * playground/core-map/thumbs/<demo>.jpg. With `--examples`, the docs'
 * examples instead, whole, as docs/examples/thumbs/<example>.jpg. baseUrl is
 * where the built playground is served, default
 * http://localhost:4173/playground/. Name demos (`7-3d`, `12-globe`) to take
 * only those again. Run it after a demo changes how it looks, and commit the pictures.
 * WebGL is drawn in software here and a busy page can miss the capture: run
 * again for the ones it names.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '..')
const args = process.argv.slice(2)
const EXAMPLES = args.includes('--examples')
const only = args.filter(a => a !== '--examples')
const base = only[0]?.startsWith('http') ? only.shift() : undefined
const SRC = EXAMPLES ? join(ROOT, 'docs', 'examples') : join(ROOT, 'playground', 'core-map')
const OUT = join(SRC, 'thumbs')
const BASE = `${(base ?? 'http://localhost:4173/playground/').replace(/\/?$/, '/')}${EXAMPLES ? 'examples/' : ''}`
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const WIDTH = 640
// An example is the map and its own controls, all of it; a demo, the map
// above its info card.
const HEIGHT = EXAMPLES ? 400 : 600
const SHOT = { width: 640, height: EXAMPLES ? 400 : 360 }
const SETTLE_MS = 7000

const demos = readdirSync(SRC)
  .filter(f => (EXAMPLES ? /^\d+-.+\.ts$/ : /^\d+-.+\.html$/).test(f))
  .map(f => f.replace(/\.(html|ts)$/, ''))
  .filter(d => !only.length || only.includes(d))
mkdirSync(OUT, { recursive: true })

/** One demo in a Chrome of its own: a page that hangs its renderer takes nothing else with it. */
async function shoot(demo: string, port: number): Promise<void> {
  const profile = join(tmpdir(), `ts-maps-thumbs-${process.pid}-${port}`)
  const chrome = Bun.spawn([CHROME, '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${WIDTH},${HEIGHT}`, '--hide-scrollbars', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stderr: 'ignore', stdout: 'ignore' })
  try {
    let url: string | undefined
    for (let i = 0; i < 50 && !url; i++) {
      try {
        const list = await (await fetch(`http://localhost:${port}/json/list`)).json() as Array<{ type: string, webSocketDebuggerUrl: string }>
        url = list.find(t => t.type === 'page')?.webSocketDebuggerUrl
      }
      catch {}
      if (!url)
        await Bun.sleep(200)
    }
    if (!url)
      throw new Error('Chrome did not start')
    const socket = new WebSocket(url)
    await new Promise(r => socket.addEventListener('open', r, { once: true }))
    let id = 0
    const waiting = new Map<number, (result: any) => void>()
    socket.addEventListener('message', (e) => {
      const message = JSON.parse(String(e.data))
      waiting.get(message.id)?.(message.result)
      waiting.delete(message.id)
    })
    const send = (method: string, params: Record<string, unknown> = {}): Promise<any> => {
      const n = ++id
      socket.send(JSON.stringify({ id: n, method, params }))
      return Promise.race([new Promise(r => waiting.set(n, r)), Bun.sleep(60000).then(() => { throw new Error(`${method} timed out`) })])
    }
    await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: `${BASE}${demo}.html` })
    await Bun.sleep(SETTLE_MS)
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 72, clip: { x: 0, y: 0, ...SHOT, scale: 1 } })
    writeFileSync(join(OUT, `${demo}.jpg`), Buffer.from(shot.data, 'base64'))
    socket.close()
  }
  finally {
    chrome.kill()
    await chrome.exited
    rmSync(profile, { recursive: true, force: true })
  }
}

let saved = 0
for (const [i, demo] of demos.entries()) {
  try {
    await shoot(demo, 9400 + i)
    saved++
    console.log(`[thumbs] ${demo}`)
  }
  catch (err) {
    console.error(`[thumbs] ${demo}: ${(err as Error).message}`)
  }
}
console.log(`[thumbs] ${saved} of ${demos.length} → ${OUT}`)
