#!/usr/bin/env bun
/* eslint-disable no-console */
/**
 * The examples' index page: a gallery of them, with a picture of each.
 *
 *   bun scripts/build-example-gallery.ts
 *
 * Writes docs/examples/index.md from every docs/examples/NN-*.md — its
 * heading, and the first sentence of what it says it shows — and the
 * pictures scripts/playground-thumbs.ts --examples took of them, which the
 * playground build serves at /playground/examples/thumbs/. Runs before the
 * docs build; commit what it writes, so the page reads the same on GitHub.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const DIR = resolve(import.meta.dir, '..', 'docs', 'examples')

interface Example {
  name: string
  number: string
  title: string
  summary: string
}

/** Markdown links and code to plain text, for a line under a picture. */
function plain(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/&/g, '&amp;').replace(/</g, '&lt;')
}

const examples: Example[] = readdirSync(DIR)
  .filter(f => /^\d+-.+\.md$/.test(f))
  .sort()
  .map((file) => {
    const text = readFileSync(join(DIR, file), 'utf8')
    const [, number = '', title = file] = text.match(/^#\s+(\d+)\s*·\s*(.+)$/m) ?? []
    const intro = text.split('\n\n').find(p => p.trim() && !p.startsWith('#')) ?? ''
    const summary = plain(intro.replace(/\s+/g, ' ').match(/^.*?[.:](?=\s|$)/)?.[0] ?? intro).replace(/:$/, '.')
    return { name: file.replace(/\.md$/, ''), number, title, summary }
  })

const cards = examples.map(e => `  <a href='./${e.name}.md' style='display: flex; flex-direction: column; border: 1px solid rgba(127, 127, 127, 0.25); border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit;'>
    <img src='/playground/examples/thumbs/${e.name}.jpg' alt='' loading='lazy' style='display: block; width: 100%; aspect-ratio: 8 / 5; object-fit: cover; margin: 0;' />
    <span style='display: block; padding: 10px 12px 2px; font-weight: 600;'>${e.number} · ${plain(e.title)}</span>
    <span style='display: block; padding: 0 12px 12px; font-size: 0.86em; opacity: 0.75; line-height: 1.45;'>${e.summary}</span>
  </a>`).join('\n')

writeFileSync(join(DIR, 'index.md'), `# Examples

${examples.length} examples, each running on a real vector basemap. Every page shows the example live, with its source beside it to copy into your own project, and an editor to change it and run it again.

To see more of the library at once, open the [playground](/demos/): its demos go further, from offline maps to a whole navigation app.

<div style='display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; margin-top: 20px;'>
${cards}
</div>
`)
console.log(`[build-example-gallery] ${examples.length} examples → ${join(DIR, 'index.md')}`)
