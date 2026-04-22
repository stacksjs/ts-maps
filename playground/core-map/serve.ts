/**
 * ts-maps core-map playground dev server.
 *
 * Zero-dep: uses Bun.serve + Bun.build on the fly to transpile
 * TypeScript entry files into browser-ready ES modules.
 *
 * Usage (from repo root):
 *   bun playground:core-map
 *
 * Then open: http://localhost:3000/core-map/
 */

import { resolve, extname, join, relative, normalize } from 'node:path'
import { existsSync, statSync } from 'node:fs'

const PORT = Number(Bun.env.PORT) || 3000
const REPO_ROOT: string = resolve(import.meta.dir, '..', '..')
const PLAYGROUND_ROOT: string = resolve(import.meta.dir, '..')
const CORE_MAP_DIR: string = import.meta.dir

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

function isSafePath(base: string, target: string): boolean {
  const normalizedTarget = normalize(target)
  const rel = relative(base, normalizedTarget)
  return !rel.startsWith('..') && !rel.startsWith('/')
}

async function buildEntry(entry: string): Promise<Response> {
  const result = await Bun.build({
    entrypoints: [entry],
    target: 'browser',
    format: 'esm',
    // Leave sourcemaps inline so errors point to TS files
    sourcemap: 'inline',
    splitting: false,
    minify: false,
  })

  if (!result.success) {
    const message = result.logs.map(l => String(l)).join('\n')
    // eslint-disable-next-line no-console
    console.error('[core-map playground] build failed:\n', message)
    return new Response(
      `console.error(${JSON.stringify(`ts-maps playground build failed:\n${message}`)});`,
      { status: 500, headers: { 'Content-Type': 'text/javascript; charset=utf-8' } },
    )
  }

  const [out] = result.outputs
  const text = await out.text()
  return new Response(text, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
}

function serveStatic(filePath: string): Response {
  try {
    if (!existsSync(filePath))
      return new Response('Not Found', { status: 404 })

    const st = statSync(filePath)
    if (st.isDirectory()) {
      const index = join(filePath, 'index.html')
      if (existsSync(index))
        return serveStatic(index)
      return new Response('Not Found', { status: 404 })
    }

    const ext = extname(filePath)
    const mime = MIME_TYPES[ext] || 'application/octet-stream'
    const file = Bun.file(filePath)
    return new Response(file, {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'no-cache',
      },
    })
  }
  catch (err) {
    // eslint-disable-next-line no-console
    console.error('[core-map playground] static error:', err)
    return new Response('Internal Server Error', { status: 500 })
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    let pathname = decodeURIComponent(url.pathname)

    // Redirect root to the core-map playground.
    if (pathname === '/' || pathname === '')
      return Response.redirect('/core-map/', 302)

    if (pathname === '/core-map' || pathname === '/core-map/')
      pathname = '/core-map/index.html'

    // Route 1: /core-map/* — files in the playground/core-map folder.
    if (pathname.startsWith('/core-map/')) {
      const rel = pathname.slice('/core-map/'.length)
      const filePath = resolve(CORE_MAP_DIR, rel)
      if (!isSafePath(CORE_MAP_DIR, filePath))
        return new Response('Forbidden', { status: 403 })

      const ext = extname(filePath)
      if ((ext === '.ts' || ext === '.tsx') && existsSync(filePath))
        return buildEntry(filePath)

      return serveStatic(filePath)
    }

    // Route 2: /packages/* — expose the packages tree read-only so CSS + TS imports
    // resolve from HTML <link rel="stylesheet" href="../../packages/...">.
    if (pathname.startsWith('/packages/')) {
      const rel = pathname.slice('/packages/'.length)
      const filePath = resolve(REPO_ROOT, 'packages', rel)
      if (!isSafePath(resolve(REPO_ROOT, 'packages'), filePath))
        return new Response('Forbidden', { status: 403 })

      const ext = extname(filePath)
      if ((ext === '.ts' || ext === '.tsx') && existsSync(filePath))
        return buildEntry(filePath)

      return serveStatic(filePath)
    }

    // Route 3: /playground/* — let the legacy playground assets resolve too.
    if (pathname.startsWith('/playground/')) {
      const rel = pathname.slice('/playground/'.length)
      const filePath = resolve(PLAYGROUND_ROOT, rel)
      if (!isSafePath(PLAYGROUND_ROOT, filePath))
        return new Response('Forbidden', { status: 403 })
      return serveStatic(filePath)
    }

    // Fallback: try to serve directly from repo root for convenience.
    const filePath = resolve(REPO_ROOT, pathname.replace(/^\//, ''))
    if (isSafePath(REPO_ROOT, filePath) && existsSync(filePath))
      return serveStatic(filePath)

    return new Response('Not Found', { status: 404 })
  },
})

// eslint-disable-next-line no-console
console.log(`ts-maps core-map playground running at http://localhost:${server.port}/core-map/`)
