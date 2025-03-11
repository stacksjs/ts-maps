import { serve } from 'bun'
import { readFileSync } from 'node:fs'
import { extname, join } from 'node:path'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.ts': 'application/javascript', // Serve TypeScript as JavaScript
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
}

const server = serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url)
    let path = url.pathname

    // Default to index.html if path is '/'
    if (path === '/') {
      path = '/samples/basic.html'
    }

    try {
      // Resolve the file path
      const filePath = join(import.meta.dir, path)

      // Get the file extension
      const ext = extname(filePath)

      // If it's a TypeScript file, we need to transpile it
      if (ext === '.ts') {
        const transpiler = new Bun.Transpiler({ loader: 'ts' })
        const source = readFileSync(filePath, 'utf8')
        const result = transpiler.transformSync(source)

        return new Response(result, {
          headers: {
            'Content-Type': 'application/javascript',
          },
        })
      }

      // For other files, just serve them with the correct MIME type
      const file = Bun.file(filePath)
      const mimeType = MIME_TYPES[ext] || 'application/octet-stream'

      return new Response(file, {
        headers: {
          'Content-Type': mimeType,
        },
      })
    }
    catch (error) {
      console.error('Error serving file:', error)
      return new Response('Not Found', { status: 404 })
    }
  },
})

Bun.write(Bun.stdout, `Server running at http://localhost:${server.port}\n`)
