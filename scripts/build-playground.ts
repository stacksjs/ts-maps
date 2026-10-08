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

// Opened in the docs (`?embed`, scripts/build-demo-pages.ts), a demo leaves
// out its own info card: the docs page around it says the same.
const EMBED = `<script>if (/[?&]embed\\b/.test(location.search)) document.documentElement.classList.add('embedded')</script>`

for (const page of pages) {
  const html = readFileSync(join(SRC, page), 'utf8')
    .replace(/<head>/, `<head>\n    ${EMBED}`)
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
  '02-camera': '<div class="panel"><button type="button" id="fly-ny">New York</button><button type="button" id="fly-london">London</button><button type="button" id="fly-tokyo">Tokyo</button><br><button type="button" id="ease-tilt" class="secondary">Tilt</button><button type="button" id="ease-flat" class="secondary">Flatten</button><button type="button" id="jump" class="secondary">Jump to Paris</button></div>',
  '03-vector-tile': '<div class="panel" id="info"></div>',
  '04-style-spec': '<div class="panel"><button type="button" id="tint-indigo">Indigo</button><button type="button" id="tint-rose">Rose</button><button type="button" id="tint-emerald">Emerald</button><button type="button" id="toggle-fill" class="secondary">Fill on / off</button></div>',
  '06-terrain': '<div class="panel"><label for="shading">Shading <span id="shading-value">0.60</span></label><input id="shading" type="range" min="0" max="1" step="0.05" value="0.6"><div id="height">Click for the height there.</div></div>',
  '08-symbols': '<div class="panel" id="info"></div>',
  '15-landmarks': '<div class="panel"><button type="button" id="pyramid">Transamerica Pyramid</button><button type="button" id="presidio">Presidio woods</button></div>',
  '17-localization': '<div class="bottom panel"><a data-lang="de" href="?lang=de">Deutsch</a> · <a data-lang="en" href="?lang=en">English</a></div>',
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
    const body = `<div id="map"></div>${PANELS[name] ?? ''}`
    writeFileSync(join(EXAMPLES_OUT, `${name}.html`), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ts-maps — ${title.replace(/</g, '&lt;')}</title>
    <link rel="stylesheet" href="../ts-maps.css" />
    <link rel="stylesheet" href="./examples.css" />
  </head>
  <body>
    ${body}
    <script type="module" src="./${name}.js"></script>
  </body>
</html>
`)
  }
  copyFileSync(join(SRC, 'examples.css'), join(EXAMPLES_OUT, 'examples.css'))
  // Edit and run (examples-editor.ts): the library as one module to import
  // from 'ts-maps', the examples' data as modules of their own, and every
  // example's source and panel for the editor to start from.
  const lib = await Bun.build({
    entrypoints: [join(ROOT, 'packages', 'ts-maps', 'src', 'core-map', 'index.ts')],
    outdir: join(EXAMPLES_OUT, 'lib'),
    target: 'browser',
    format: 'esm',
    minify: true,
    naming: 'ts-maps.[ext]',
  })
  const data = await Bun.build({
    entrypoints: readdirSync(join(EXAMPLES, 'data')).filter(f => f.endsWith('.ts')).map(f => join(EXAMPLES, 'data', f)),
    outdir: join(EXAMPLES_OUT, 'data'),
    target: 'browser',
    format: 'esm',
    minify: true,
  })
  const editor = await Bun.build({
    entrypoints: [join(SRC, 'examples-editor.ts')],
    outdir: EXAMPLES_OUT,
    target: 'browser',
    format: 'esm',
    minify: true,
    naming: 'edit.[ext]',
  })
  for (const result of [lib, data, editor]) {
    if (!result.success) {
      for (const log of result.logs)
        console.error(log)
      process.exit(1)
    }
  }
  const sources = Object.fromEntries(examples.map((file) => {
    const name = file.replace(/\.ts$/, '')
    const title = readFileSync(join(EXAMPLES, `${name}.md`), 'utf8').match(/^#\s+(.+)$/m)?.[1] ?? name
    return [name, { title, source: readFileSync(join(EXAMPLES, file), 'utf8'), panel: PANELS[name] ?? '' }]
  }))
  writeFileSync(join(EXAMPLES_OUT, 'sources.json'), JSON.stringify(sources))
  copyFileSync(join(SRC, 'examples-editor.css'), join(EXAMPLES_OUT, 'editor.css'))
  writeFileSync(join(EXAMPLES_OUT, 'edit.html'), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Edit and run — ts-maps</title>
    <link rel="stylesheet" href="./editor.css" />
  </head>
  <body>
    <header>
      <strong>Edit and run</strong>
      <select id="example" aria-label="Example"></select>
      <button type="button" id="run" title="Run (⌘↵)">Run</button>
      <button type="button" id="reset" class="secondary">Reset</button>
      <span class="spacer"></span>
      <a id="docs" href="/examples/">Docs</a>
      <a id="full-screen" href="./">Full screen</a>
    </header>
    <main>
      <div class="code">
        <pre id="highlight" aria-hidden="true"></pre>
        <textarea id="code" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Source"></textarea>
      </div>
      <iframe id="preview" title="The example, running" allow="geolocation; fullscreen"></iframe>
    </main>
    <footer id="status">Loading…</footer>
    <script type="module" src="./edit.js"></script>
  </body>
</html>
`)

  // The examples gallery's pictures of them (scripts/playground-thumbs.ts --examples).
  const pictures = join(EXAMPLES, 'thumbs')
  if (existsSync(pictures)) {
    mkdirSync(join(EXAMPLES_OUT, 'thumbs'), { recursive: true })
    for (const file of readdirSync(pictures).filter(f => f.endsWith('.jpg')))
      copyFileSync(join(pictures, file), join(EXAMPLES_OUT, 'thumbs', file))
  }
  console.log(`[build-playground] ${examples.length} examples → ${EXAMPLES_OUT}`)
}
