#!/usr/bin/env bun
/* eslint-disable ts/no-top-level-await, no-console */
/**
 * Builds the core-map playground into static files, so the docs site can
 * serve it at /playground/ without the dev server.
 *
 *   bun scripts/build-playground.ts [outDir]
 *
 * outDir defaults to dist/.bunpress/playground, next to the docs build. Every
 * demo's .ts entry is bundled in one pass with code splitting, so the library
 * is one shared chunk rather than a copy per page. The HTML is rewritten to
 * load the built .js and a copy of ts-maps.css next to it.
 *
 * The docs' examples are built alongside, into examples/, so each example's
 * docs page can show it running.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '..')
const SRC = join(ROOT, 'playground', 'core-map')
const CSS = join(ROOT, 'packages', 'ts-maps', 'src', 'core-map', 'ts-maps.css')
const OUT = resolve(ROOT, process.argv[2] ?? 'dist/.bunpress/playground')

const pages = readdirSync(SRC).filter(f => f.endsWith('.html'))
const entries = pages
  .map(page => join(SRC, page.replace(/\.html$/, '.ts')))
  .filter(entry => existsSync(entry))

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const result = await Bun.build({
  entrypoints: entries,
  outdir: OUT,
  target: 'browser',
  format: 'esm',
  splitting: true,
  minify: true,
  sourcemap: 'linked',
  naming: { entry: '[name].[ext]', chunk: 'chunks/[name]-[hash].[ext]' },
})

if (!result.success) {
  for (const log of result.logs)
    console.error(log)
  process.exit(1)
}

// The offline demo's service worker: one file, unsplit, since a worker
// script cannot import chunks the way a module page does.
const worker = join(SRC, 'sw.ts')
if (existsSync(worker)) {
  const built = await Bun.build({ entrypoints: [worker], outdir: OUT, target: 'browser', format: 'esm', minify: true, naming: '[name].js' })
  if (!built.success) {
    for (const log of built.logs)
      console.error(log)
    process.exit(1)
  }
}

for (const page of pages) {
  const html = readFileSync(join(SRC, page), 'utf8')
    .replace(/(['"])(?:\.\.\/)+packages\/ts-maps\/src\/core-map\/ts-maps\.css\1/g, '$1./ts-maps.css$1')
    .replace(/src=(['"])\.\/([\w-]+)\.ts\1/g, 'src=$1./$2.js$1')
  writeFileSync(join(OUT, page), html)
}
copyFileSync(join(SRC, 'shared.css'), join(OUT, 'shared.css'))
// The gallery's pictures of each demo (scripts/playground-thumbs.ts).
const THUMBS = join(SRC, 'thumbs')
if (existsSync(THUMBS)) {
  mkdirSync(join(OUT, 'thumbs'), { recursive: true })
  for (const file of readdirSync(THUMBS))
    copyFileSync(join(THUMBS, file), join(OUT, 'thumbs', file))
}
copyFileSync(CSS, join(OUT, 'ts-maps.css'))

console.log(`[build-playground] ${pages.length} pages, ${result.outputs.length} files → ${OUT}`)

// ---------------------------------------------------------------------------
// The docs' examples, running: each docs/examples/NN-*.ts as a page of its
// own under examples/, which the example's docs page shows in a frame. The
// scripts are the ones the docs print; the pages only add the few elements a
// script looks for besides the map (an info line, a button, a search field).
// ---------------------------------------------------------------------------

const EXAMPLES = join(ROOT, 'docs', 'examples')
const EXAMPLES_OUT = join(OUT, 'examples')

/** What each example needs on the page besides `#map`. */
const PANELS: Record<string, string> = {
  '03-vector-tile': '<div class="panel" id="info"></div>',
  '06-hillshade': '<div class="panel"><div id="shade-preview"></div><div id="decode-info"></div></div>',
  '08-symbols': '<div class="panel" id="info"></div>',
  '09-geocoder': '<div class="panel"><input id="q" type="search" placeholder="Search a place…" autocomplete="off"><ul id="results"></ul></div>',
  '10-directions': '<div class="panel"><div id="info"></div><button type="button" id="reset">Reset</button></div>',
  '11-offline': '<div class="panel"><button type="button" id="download">Download this area</button> <button type="button" id="toggle">Disable network</button><div id="info"></div></div>',
}

const examples = existsSync(EXAMPLES) ? readdirSync(EXAMPLES).filter(f => /^\d+-.+\.ts$/.test(f)) : []
if (examples.length) {
  const built = await Bun.build({
    entrypoints: examples.map(f => join(EXAMPLES, f)),
    outdir: EXAMPLES_OUT,
    target: 'browser',
    format: 'esm',
    splitting: true,
    minify: true,
    sourcemap: 'linked',
    naming: { entry: '[name].[ext]', chunk: 'chunks/[name]-[hash].[ext]' },
  })
  if (!built.success) {
    for (const log of built.logs)
      console.error(log)
    process.exit(1)
  }
  for (const file of examples) {
    const name = file.replace(/\.ts$/, '')
    const title = readFileSync(join(EXAMPLES, `${name}.md`), 'utf8').match(/^#\s+(.+)$/m)?.[1] ?? name
    // The globe example draws its own canvas rather than a map.
    const globe = name.endsWith('-globe')
    const body = globe
      ? '<canvas id="globe"></canvas><div class="panel" id="info"></div>'
      : `<div id="map"></div>${PANELS[name] ?? ''}`
    writeFileSync(join(EXAMPLES_OUT, `${name}.html`), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ts-maps — ${title.replace(/</g, '&lt;')}</title>
    <link rel="stylesheet" href="../ts-maps.css" />
    <link rel="stylesheet" href="./examples.css" />
  </head>
  <body${globe ? ' class="globe"' : ''}>
    ${body}
    <script type="module" src="./${name}.js"></script>
  </body>
</html>
`)
  }
  copyFileSync(join(SRC, 'examples.css'), join(EXAMPLES_OUT, 'examples.css'))
  console.log(`[build-playground] ${examples.length} examples → ${EXAMPLES_OUT}`)
}
