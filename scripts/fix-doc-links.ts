#!/usr/bin/env bun
/* eslint-disable no-console */
/**
 * Points the built docs' relative links where the site serves them.
 *
 *   bun scripts/fix-doc-links.ts [siteDir]
 *
 * The docs link to each other as files (`./02-camera.md`, `../concepts/map.md`)
 * so they also work on GitHub, and BunPress copies those hrefs into the HTML
 * as they are: on the site they 404. This resolves each one from the page's
 * own source file:
 *
 *   - a `.md` link becomes the page's clean URL: `/examples/02-camera`, and
 *     `index.md` its directory, `/examples/`;
 *   - a link to another file in docs/ (an example's `.ts`) goes to that file
 *     on GitHub, since the site does not serve sources.
 *
 * Anything else (absolute paths, anchors, other sites) is left alone.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, posix, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '..')
const DOCS = join(ROOT, 'docs')
const SITE = resolve(ROOT, process.argv[2] ?? 'dist/.bunpress')
const SOURCE = 'https://github.com/stacksjs/ts-maps/blob/main/docs'

function pages(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (name === 'playground')
      continue
    if (statSync(path).isDirectory())
      out.push(...pages(path))
    else if (name.endsWith('.html'))
      out.push(path)
  }
  return out
}

/** The markdown a built page came from, as a path inside docs/: `examples/01-basic-map.md`. */
function sourceOf(page: string): string | undefined {
  const rel = relative(SITE, page).split('\\').join('/')
  const base = rel.replace(/(?:^|\/)index\.html$/, '').replace(/\.html$/, '')
  for (const candidate of [base ? `${base}.md` : 'index.md', base ? `${base}/index.md` : 'index.md']) {
    if (existsSync(join(DOCS, candidate)))
      return candidate
  }
  return undefined
}

/** Where a link written in `source` should go on the site, or undefined to leave it. */
export function siteHref(source: string, href: string): string | undefined {
  if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(href))
    return undefined
  const [, path = '', rest = ''] = href.match(/^([^?#]*)(.*)$/) ?? []
  if (!path)
    return undefined
  const target = posix.normalize(posix.join(posix.dirname(source), path))
  if (target.startsWith('..'))
    return undefined
  if (target.endsWith('.md')) {
    const page = target.replace(/\.md$/, '')
    return `/${page === 'index' ? '' : page.endsWith('/index') ? page.slice(0, -'index'.length) : page}${rest}`
  }
  if (existsSync(join(DOCS, target)) && statSync(join(DOCS, target)).isFile())
    return `${SOURCE}/${target}${rest}`
  return undefined
}

if (import.meta.main) {
  let changed = 0
  let links = 0
  for (const page of pages(SITE)) {
    const source = sourceOf(page)
    if (!source)
      continue
    const html = readFileSync(page, 'utf8')
    const next = html.replace(/href="([^"]+)"/g, (whole, href: string) => {
      const to = siteHref(source, href)
      if (to === undefined)
        return whole
      links++
      return `href="${to}"`
    })
    if (next !== html) {
      writeFileSync(page, next)
      changed++
    }
  }
  console.log(`[fix-doc-links] ${links} links in ${changed} pages → site URLs`)
}

