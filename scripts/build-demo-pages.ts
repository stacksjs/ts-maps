#!/usr/bin/env bun
/* eslint-disable no-console */
/**
 * A docs page for each playground demo, so it opens inside the docs with the
 * sidebar beside it.
 *
 *   bun scripts/build-demo-pages.ts
 *
 * Writes docs/demos/<demo>.md for every playground/core-map/<n>-<name>.html,
 * from the demo page's own title and description, with the demo running in a
 * frame; and docs/demos/index.md, a gallery of them. Runs before the docs
 * build. The pages are generated, so docs/demos/ is not committed: change a
 * demo's page and its docs page follows.
 *
 * They live at /demos/ rather than /playground/, which the gateway serves
 * from the playground's own files (cloud.config.ts).
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '..')
const SRC = join(ROOT, 'playground', 'core-map')
const OUT = join(ROOT, 'docs', 'demos')
const SOURCE = 'https://github.com/stacksjs/ts-maps/blob/main/playground/core-map'

/** The frame a demo runs in: as tall as the window allows, under the page's heading. */
const FRAME = ['width: 100%', 'height: calc(100vh - 260px)', 'min-height: 520px', 'border: 0', 'border-radius: 12px', 'background: #e8eaed'].join('; ')
const ALLOW = ['geolocation', 'fullscreen'].join('; ')

interface Demo {
  name: string
  title: string
  description: string
}

function decode(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&amp;/g, '&')
}

function demos(): Demo[] {
  return readdirSync(SRC)
    .filter(f => /^\d+-.+\.html$/.test(f))
    .sort((a, b) => Number.parseInt(a) - Number.parseInt(b))
    .map((file) => {
      const html = readFileSync(join(SRC, file), 'utf8')
      const name = file.replace(/\.html$/, '')
      const title = decode(html.match(/<title>(.*?)(?: — ts-maps playground)?<\/title>/)?.[1] ?? name)
      // The card on the demo says it with markup; the meta tag in words.
      const card = html.match(/<details class='demo-info'[^>]*>[\s\S]*?<div class='demo-body'>\s*<p>([\s\S]*?)<\/p>/)?.[1]
      const description = card?.trim() ?? decode(html.match(/<meta name='description' content="(.*?)"/)?.[1] ?? '')
      return { name, title, description }
    })
}

function page(demo: Demo, list: Demo[]): string {
  const i = list.indexOf(demo)
  const prev = list[i - 1]
  const next = list[i + 1]
  const nav = [
    prev ? `[← ${prev.title}](/demos/${prev.name})` : '[← All demos](/demos/)',
    next ? `[${next.title} →](/demos/${next.name})` : '[All demos →](/demos/)',
  ].join(' · ')
  return `# ${demo.title}

${demo.description.replace(/\s+/g, ' ')}

<iframe class="ts-maps-demo" src="/playground/${demo.name}.html?embed" title="${demo.title.replace(/"/g, '&quot;')}, running" allow="${ALLOW}" style="${FRAME}"></iframe>

[Open it full screen](/playground/${demo.name}.html) · Source: [\`${demo.name}.ts\`](${SOURCE}/${demo.name}.ts)

---

${nav}
`
}

function gallery(list: Demo[]): string {
  const cards = list.map(d => `  <a href="/demos/${d.name}" style="display: block; border: 1px solid rgba(127, 127, 127, 0.25); border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit;">
    <img src="/playground/thumbs/${d.name}.jpg" alt="" loading="lazy" style="display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; margin: 0;" />
    <span style="display: block; padding: 10px 12px; font-weight: 600;">${d.title.replace(/&/g, '&amp;')}</span>
  </a>`).join('\n')
  return `# Playground

Every ts-maps feature, running in the browser on a real basemap. Each demo opens here with the docs around it, or on its own, full screen, from its page.

<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; margin-top: 20px;">
${cards}
</div>
`
}

const list = demos()
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
for (const demo of list)
  writeFileSync(join(OUT, `${demo.name}.md`), page(demo, list))
writeFileSync(join(OUT, 'index.md'), gallery(list))
console.log(`[build-demo-pages] ${list.length} demos → ${OUT}`)
