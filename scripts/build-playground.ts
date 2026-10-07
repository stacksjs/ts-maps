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

for (const page of pages) {
  const html = readFileSync(join(SRC, page), 'utf8')
    .replace(/(['"])(?:\.\.\/)+packages\/ts-maps\/src\/core-map\/ts-maps\.css\1/g, '$1./ts-maps.css$1')
    .replace(/src=(['"])\.\/([\w-]+)\.ts\1/g, 'src=$1./$2.js$1')
  writeFileSync(join(OUT, page), html)
}
copyFileSync(join(SRC, 'shared.css'), join(OUT, 'shared.css'))
copyFileSync(CSS, join(OUT, 'ts-maps.css'))

console.log(`[build-playground] ${pages.length} pages, ${result.outputs.length} files → ${OUT}`)
